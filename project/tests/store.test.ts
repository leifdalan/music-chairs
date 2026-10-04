import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isToken,
  migrate,
  MIGRATIONS,
  openStore,
  SESSION_DAYS,
  type Member,
  type NewMember,
  type Store,
} from "../app/.server/store";
import type { SlotInput } from "../app/lib/availability";
import { requestIn } from "./routes";

/** A new member as every later read returns it: without the device token. */
function withoutToken(member: NewMember): Member {
  return {
    id: member.id,
    groupId: member.groupId,
    displayName: member.displayName,
    role: member.role,
    optional: member.optional,
    googleEmail: member.googleEmail,
    calendarSync: member.calendarSync,
    instrument: member.instrument,
    invitedEmail: member.invitedEmail,
  };
}

const opened: Store[] = [];
const tempDirs: string[] = [];

function memoryStore(): Store {
  const store = openStore(":memory:");
  opened.push(store);
  return store;
}

afterEach(() => {
  for (const store of opened.splice(0)) store.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("store", () => {
  it("creates a group with its creator as organizer", () => {
    const store = memoryStore();
    const { group, organizer } = store.createGroup("Thursday Quartet", "Viola", "Europe/London");

    expect(store.findGroup(group.id)).toEqual(group);
    expect(store.listMembers(group.id)).toEqual([withoutToken(organizer)]);
    expect(store.findGroup(group.id)?.timeZone).toBe("Europe/London");
    expect(organizer).toMatchObject({ groupId: group.id, displayName: "Viola", role: "organizer" });
  });

  it("issues unguessable, distinct identifiers", () => {
    const store = memoryStore();
    const { group, organizer } = store.createGroup("Quartet", "Viola", "Europe/London");

    for (const id of [group.id, group.inviteToken, organizer.id]) expect(isToken(id)).toBe(true);
    expect(new Set([group.id, group.inviteToken, organizer.id]).size).toBe(3);
  });

  it("finds a group by its invite token, and nothing for unknown or malformed tokens", () => {
    const store = memoryStore();
    const { group } = store.createGroup("Quartet", "Viola", "Europe/London");

    expect(store.findGroupByInviteToken(group.inviteToken)).toEqual(group);
    expect(store.findGroupByInviteToken("A".repeat(22))).toBeNull();
    expect(store.findGroupByInviteToken("not a token")).toBeNull();
    expect(store.findGroupByInviteToken(group.id)).toBeNull();
    expect(store.findGroup(group.inviteToken)).toBeNull();
  });

  it("lists members in joining order and supports more than one organizer", () => {
    const store = memoryStore();
    const { group, organizer } = store.createGroup("Quartet", "Viola", "Europe/London");
    const cellist = store.addMember(group.id, "Cellist", "member");
    const second = store.addMember(group.id, "Pianist", "organizer");

    expect(store.listMembers(group.id)).toEqual([organizer, cellist, second].map(withoutToken));
    expect(store.findMember(group.id, second.id)?.role).toBe("organizer");
  });

  it("finds a member only within their own group", () => {
    const store = memoryStore();
    const first = store.createGroup("First", "Viola", "Europe/London");
    const second = store.createGroup("Second", "Cello", "Europe/London");

    expect(store.findMember(first.group.id, first.organizer.id)).toEqual(
      withoutToken(first.organizer),
    );
    expect(store.findMember(second.group.id, first.organizer.id)).toBeNull();
  });

  /** A database file whose groups table is Phase 1's, without later columns. */
  function earlierDatabase(): { dir: string; filename: string } {
    const dir = mkdtempSync(join(tmpdir(), "music-chairs-"));
    tempDirs.push(dir);
    const filename = join(dir, "local.sqlite");
    const old = new DatabaseSync(filename);
    old.exec(
      "CREATE TABLE groups (id TEXT PRIMARY KEY, invite_token TEXT NOT NULL UNIQUE, " +
        "name TEXT NOT NULL, created_at TEXT NOT NULL)",
    );
    old.exec("INSERT INTO groups VALUES ('old', 'invite', 'Phase 1 band', '2026-10-01')");
    old.close();
    return { dir, filename };
  }

  it("refuses a database from an earlier schema with a message saying what to do", () => {
    const { filename } = earlierDatabase();

    let refusal: unknown;
    try {
      openStore(filename);
    } catch (error) {
      refusal = error;
    }

    expect(refusal).toBeInstanceOf(Error);
    expect((refusal as Error).message).toContain(
      `The database ${filename} does not match this version of music-chairs`,
    );
    expect((refusal as Error).message).toContain(
      "move that file and its -wal and -shm files aside",
    );
    expect(readdirSync(dirname(filename))).toEqual(["local.sqlite"]);
  });

  it("in development, backs up an earlier-schema database and starts a fresh one", () => {
    const { dir, filename } = earlierDatabase();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const store = openStore(filename, { resetIfStale: true });
    opened.push(store);

    const backups = readdirSync(dir).filter((name) => name.startsWith("local.sqlite.stale-"));
    expect(backups).toHaveLength(1);
    const backup = new DatabaseSync(join(dir, backups[0]));
    expect(backup.prepare("SELECT name FROM groups").all()).toEqual([{ name: "Phase 1 band" }]);
    backup.close();
    const { group } = store.createGroup("Fresh", "Viola", "Europe/London");
    expect(store.findGroup(group.id)?.name).toBe("Fresh");
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain(`Moved it to ${join(dir, backups[0])}`);
    warn.mockRestore();
  });

  it("in development, also backs up an unversioned database the baseline cannot index", () => {
    const { dir, filename } = earlierDatabase();
    const old = new DatabaseSync(filename);
    // No joined_at, so the baseline's members_by_group index fails inside the migration.
    old.exec("CREATE TABLE members (id TEXT PRIMARY KEY, group_id TEXT NOT NULL)");
    old.close();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const store = openStore(filename, { resetIfStale: true });
    opened.push(store);

    expect(readdirSync(dir).filter((name) => name.startsWith("local.sqlite.stale-"))).toHaveLength(
      1,
    );
    expect(store.createGroup("Fresh", "Viola", "Europe/London").group.name).toBe("Fresh");
    warn.mockRestore();
  });

  it("keeps data after the database is closed and reopened", () => {
    const dir = mkdtempSync(join(tmpdir(), "music-chairs-"));
    tempDirs.push(dir);
    const filename = join(dir, "nested", "music-chairs.sqlite");

    const before = openStore(filename);
    const { group } = before.createGroup("Thursday Quartet", "Viola", "Europe/London");
    before.addMember(group.id, "Cellist", "member");
    before.close();

    const after = openStore(filename);
    opened.push(after);
    expect(after.findGroup(group.id)?.name).toBe("Thursday Quartet");
    expect(after.listMembers(group.id).map((member) => member.displayName)).toEqual([
      "Viola",
      "Cellist",
    ]);
  });
});

const thursdays: SlotInput = {
  kind: "weekly",
  startDate: "2026-10-01",
  endDate: null,
  startMinute: 19 * 60,
  endMinute: 22 * 60,
};

describe("availability store", () => {
  it("adds several times at once, or none when one is refused", () => {
    const store = memoryStore();
    const { organizer } = store.createGroup("Quartet", "Viola", "Europe/London");
    const once = (startDate: string, endMinute = 1320) => ({
      kind: "once" as const,
      startDate,
      endDate: null,
      startMinute: 1140,
      endMinute,
    });

    expect(store.addSlots(organizer.id, [once("2026-10-06"), once("2026-10-08")])).toHaveLength(2);
    // The second ends before it starts, which the table refuses.
    expect(() =>
      store.addSlots(organizer.id, [once("2026-10-13"), once("2026-10-15", 1100)]),
    ).toThrow();
    expect(store.listSlots(organizer.id).map((slot) => slot.startDate)).toEqual([
      "2026-10-06",
      "2026-10-08",
    ]);
  });

  function member(store: Store) {
    return store.createGroup("Quartet", "Viola", "Europe/London").organizer;
  }

  it("adds, lists, updates and deletes a member's slots", () => {
    const store = memoryStore();
    const viola = member(store);
    const weekly = store.addSlot(viola.id, thursdays);
    const once = store.addSlot(viola.id, { ...thursdays, kind: "once", startDate: "2026-09-26" });

    expect(store.listSlots(viola.id)).toEqual([once, weekly]);
    const changed = store.updateSlot(viola.id, weekly.id, {
      ...thursdays,
      startMinute: 19 * 60 + 30,
    });
    expect(changed).toMatchObject({ id: weekly.id, startMinute: 1170, endMinute: 1320 });
    expect(store.deleteSlot(viola.id, once.id)).toBe(true);
    expect(store.listSlots(viola.id)).toEqual([changed]);
  });

  it("skips only dates the pattern meets, and restores them", () => {
    const store = memoryStore();
    const viola = member(store);
    const slot = store.addSlot(viola.id, thursdays);

    expect(store.setSkip(viola.id, slot.id, "2026-10-08", true)).toBe(true);
    expect(store.setSkip(viola.id, slot.id, "2026-10-09", true)).toBe(false);
    expect(store.findSlot(viola.id, slot.id)?.skips).toEqual(["2026-10-08"]);
    expect(store.setSkip(viola.id, slot.id, "2026-10-08", false)).toBe(true);
    expect(store.findSlot(viola.id, slot.id)?.skips).toEqual([]);
  });

  it("drops skips that an edit moves off the pattern, and all skips with the slot", () => {
    const store = memoryStore();
    const viola = member(store);
    const slot = store.addSlot(viola.id, thursdays);
    store.setSkip(viola.id, slot.id, "2026-10-08", true);
    store.setSkip(viola.id, slot.id, "2026-10-15", true);

    const kept = store.updateSlot(viola.id, slot.id, { ...thursdays, endDate: "2026-10-31" });
    expect(kept?.skips).toEqual(["2026-10-08", "2026-10-15"]);
    const moved = store.updateSlot(viola.id, slot.id, { ...thursdays, startDate: "2026-10-02" });
    expect(moved?.skips).toEqual([]);

    store.setSkip(viola.id, slot.id, "2026-10-09", true);
    store.deleteSlot(viola.id, slot.id);
    store.addSlot(viola.id, thursdays);
    expect(store.listSlots(viola.id).flatMap((item) => item.skips)).toEqual([]);
  });

  it("treats another member's slot as unknown to every function", () => {
    const store = memoryStore();
    const viola = member(store);
    const cello = member(store);
    const slot = store.addSlot(viola.id, thursdays);

    expect(store.listSlots(cello.id)).toEqual([]);
    expect(store.findSlot(cello.id, slot.id)).toBeNull();
    expect(store.updateSlot(cello.id, slot.id, thursdays)).toBeNull();
    expect(store.deleteSlot(cello.id, slot.id)).toBe(false);
    expect(store.setSkip(cello.id, slot.id, "2026-10-08", true)).toBe(false);
    expect(store.findSlot(viola.id, slot.id)).toEqual(slot);
  });

  it("refuses rows off the 15-minute grid or ending before they start", () => {
    const store = memoryStore();
    const viola = member(store);

    expect(() => store.addSlot(viola.id, { ...thursdays, startMinute: 1145 })).toThrow();
    expect(() => store.addSlot(viola.id, { ...thursdays, endMinute: 18 * 60 })).toThrow();
    expect(() => store.addSlot(viola.id, { ...thursdays, endDate: "2026-09-01" })).toThrow();
    expect(store.listSlots(viola.id)).toEqual([]);
  });
});

describe("members, privacy and roles", () => {
  it("keeps device tokens out of every member read and finds members by token in their group", () => {
    const store = memoryStore();
    const { group, organizer } = store.createGroup("Quartet", "Viola", "Europe/London");
    const other = store.createGroup("Other", "Drums", "Europe/London");

    expect(isToken(organizer.deviceToken)).toBe(true);
    expect(organizer.deviceToken).not.toBe(organizer.id);
    expect(Object.keys(store.listMembers(group.id)[0])).not.toContain("deviceToken");
    expect(store.findMemberByDevice(group.id, organizer.deviceToken)?.id).toBe(organizer.id);
    expect(store.findMemberByDevice(other.group.id, organizer.deviceToken)).toBeNull();
    expect(store.findMemberByDevice(group.id, organizer.id)).toBeNull();
  });

  it("tags members optional and switches the group's privacy setting", () => {
    const store = memoryStore();
    const { group, organizer } = store.createGroup("Quartet", "Viola", "Europe/London");

    expect(store.findGroup(group.id)?.showNames).toBe(false);
    store.setShowNames(group.id, true);
    expect(store.setOptional(group.id, organizer.id, true)).toBe(true);

    expect(store.findGroup(group.id)?.showNames).toBe(true);
    expect(store.findMember(group.id, organizer.id)?.optional).toBe(true);
    expect(store.setOptional(group.id, "Z".repeat(22), true)).toBe(false);
  });

  it("changes roles but never leaves a group without an organizer", () => {
    const store = memoryStore();
    const { group, organizer } = store.createGroup("Quartet", "Viola", "Europe/London");
    const cello = store.addMember(group.id, "Cello", "member");

    expect(store.setRole(group.id, organizer.id, "member")).toBe("last-organizer");
    expect(store.setRole(group.id, cello.id, "organizer")).toBe("changed");
    expect(store.setRole(group.id, organizer.id, "member")).toBe("changed");
    expect(store.setRole(group.id, cello.id, "member")).toBe("last-organizer");
    expect(store.setRole(group.id, "Z".repeat(22), "member")).toBe("unknown");
  });

  it("reads every member's availability in a group, and only that group", () => {
    const store = memoryStore();
    const { group, organizer } = store.createGroup("Quartet", "Viola", "Europe/London");
    const cello = store.addMember(group.id, "Cello", "member");
    const other = store.createGroup("Other", "Drums", "Europe/London");
    store.addSlot(organizer.id, thursdays);
    store.addSlot(cello.id, { ...thursdays, kind: "once", startDate: "2026-10-10" });
    store.addSlot(other.organizer.id, thursdays);

    const slots = store.listGroupSlots(group.id);

    expect([...slots.keys()].sort()).toEqual([organizer.id, cello.id].sort());
    expect(slots.get(cello.id)?.[0]).toMatchObject({ kind: "once", startDate: "2026-10-10" });
  });
});

describe("rehearsals store", () => {
  it("proposes, confirms, ends and deletes rehearsals within their group", () => {
    const store = memoryStore();
    const { group } = store.createGroup("Quartet", "Viola", "Europe/London");
    const other = store.createGroup("Other", "Drums", "Europe/London");

    const weekly = store.addRehearsal(
      group.id,
      requestIn(group.id, { store }),
      thursdays,
      "Studio B",
    );
    expect(store.findRehearsal(group.id, weekly.id)).toMatchObject({
      status: "proposed",
      location: "Studio B",
    });
    expect(store.confirmRehearsal(other.group.id, weekly.id)).toBe(false);
    expect(store.confirmRehearsal(group.id, weekly.id)).toBe(true);
    expect(store.findRehearsal(group.id, weekly.id)?.status).toBe("confirmed");

    store.setCancelled(group.id, weekly.id, "2026-10-08", true);
    store.setCancelled(group.id, weekly.id, "2026-10-29", true);
    const ended = store.endRehearsal(group.id, weekly.id, "2026-10-22");
    expect(ended).toMatchObject({
      endDate: "2026-10-22",
      status: "confirmed",
      skips: ["2026-10-08"],
    });
    expect(store.endRehearsal(group.id, weekly.id, "2026-09-01")).toBeNull();

    expect(store.listRehearsals(other.group.id)).toEqual([]);
    expect(store.deleteRehearsal(other.group.id, weekly.id)).toBe(false);
    expect(store.deleteRehearsal(group.id, weekly.id)).toBe(true);
    expect(store.listRehearsals(group.id)).toEqual([]);
  });

  it("cancels only dates the rehearsal meets, and refuses to end a one-off", () => {
    const store = memoryStore();
    const { group } = store.createGroup("Quartet", "Viola", "Europe/London");
    const weekly = store.addRehearsal(group.id, requestIn(group.id, { store }), thursdays, "");
    const once = store.addRehearsal(
      group.id,
      requestIn(group.id, { store }),
      { ...thursdays, kind: "once" },
      "",
    );

    expect(store.setCancelled(group.id, weekly.id, "2026-10-09", true)).toBe(false);
    expect(store.setCancelled(group.id, weekly.id, "2026-10-08", true)).toBe(true);
    expect(store.setCancelled(group.id, weekly.id, "2026-10-08", false)).toBe(true);
    expect(store.findRehearsal(group.id, weekly.id)?.skips).toEqual([]);
    expect(store.endRehearsal(group.id, once.id, "2026-10-22")).toBeNull();
  });
});

describe("rsvp store", () => {
  function setup() {
    const store = memoryStore();
    const { group, organizer } = store.createGroup("Quartet", "Viola", "Europe/London");
    const cello = store.addMember(group.id, "Cello", "member");
    const weekly = store.addRehearsal(
      group.id,
      requestIn(group.id, { store }),
      thursdays,
      "Studio B",
    );
    return { store, group, organizer, cello, weekly };
  }

  it("sets, changes and clears an answer, and keeps it when the rehearsal is confirmed", () => {
    const { store, group, cello, weekly } = setup();

    expect(store.setRsvp(group.id, weekly.id, cello.id, "2026-10-08", "yes")).toBe(true);
    store.confirmRehearsal(group.id, weekly.id);
    expect(store.listRsvps(group.id)).toEqual([
      { rehearsalId: weekly.id, memberId: cello.id, date: "2026-10-08", answer: "yes" },
    ]);
    store.setRsvp(group.id, weekly.id, cello.id, "2026-10-08", "no");
    expect(store.listRsvps(group.id)[0].answer).toBe("no");
    store.setRsvp(group.id, weekly.id, cello.id, "2026-10-08", null);
    expect(store.listRsvps(group.id)).toEqual([]);
  });

  it("refuses answers for dates that don't happen, other groups and other groups' members", () => {
    const { store, group, cello, weekly } = setup();
    const other = store.createGroup("Other", "Drums", "Europe/London");
    store.setCancelled(group.id, weekly.id, "2026-10-15", true);

    expect(store.setRsvp(group.id, weekly.id, cello.id, "2026-10-09", "yes")).toBe(false);
    expect(store.setRsvp(group.id, weekly.id, cello.id, "2026-10-15", "yes")).toBe(false);
    expect(store.setRsvp(other.group.id, weekly.id, cello.id, "2026-10-08", "yes")).toBe(false);
    expect(store.setRsvp(group.id, weekly.id, other.organizer.id, "2026-10-08", "yes")).toBe(false);
    const once = store.addRehearsal(
      group.id,
      requestIn(group.id, { store }),
      { ...thursdays, kind: "once" },
      "",
    );
    expect(store.setRsvp(group.id, once.id, cello.id, "2026-10-08", "yes")).toBe(false);
    expect(store.setRsvp(group.id, once.id, cello.id, "2026-10-01", "yes")).toBe(true);
    expect(store.listRsvps(other.group.id)).toEqual([]);
  });

  it("answers several dates all or nothing", () => {
    const { store, group, cello, weekly } = setup();

    expect(
      store.setRsvps(group.id, weekly.id, cello.id, ["2026-10-08", "2026-10-09"], "maybe"),
    ).toBe(false);
    expect(store.listRsvps(group.id)).toEqual([]);
    expect(
      store.setRsvps(group.id, weekly.id, cello.id, ["2026-10-08", "2026-10-15"], "maybe"),
    ).toBe(true);
    expect(store.listRsvps(group.id).map((r) => [r.date, r.answer])).toEqual([
      ["2026-10-08", "maybe"],
      ["2026-10-15", "maybe"],
    ]);
  });

  it("drops answers after a new last date, keeps them on a cancelled date, and cascades on delete", () => {
    const { store, group, cello, weekly } = setup();
    store.setRsvps(
      group.id,
      weekly.id,
      cello.id,
      ["2026-10-08", "2026-10-15", "2026-10-22"],
      "yes",
    );

    store.setCancelled(group.id, weekly.id, "2026-10-08", true);
    store.endRehearsal(group.id, weekly.id, "2026-10-15");
    store.setCancelled(group.id, weekly.id, "2026-10-08", false);
    expect(store.listRsvps(group.id).map((r) => r.date)).toEqual(["2026-10-08", "2026-10-15"]);

    store.deleteRehearsal(group.id, weekly.id);
    expect(store.listRsvps(group.id)).toEqual([]);
  });
});

describe("Google accounts and sessions", () => {
  const cellistProfile = { sub: "google-sub-1", email: "cellist@example.test", name: "Cel List" };
  const DAY = 24 * 60 * 60 * 1000;

  it("keeps one account per Google sub, refreshing its email and name", () => {
    const store = memoryStore();

    const first = store.upsertAccount(cellistProfile);
    const again = store.upsertAccount({ ...cellistProfile, email: "new@example.test" });

    expect(again).toEqual({ id: first.id, email: "new@example.test", name: "Cel List" });
    expect(isToken(first.id)).toBe(true);
  });

  it("finds a session by its token, renews it after a day of use, and expires it after 90 idle days", () => {
    const store = memoryStore();
    const account = store.upsertAccount(cellistProfile);
    const start = new Date("2026-10-01T12:00:00Z");
    const token = store.createSession(account.id, start);

    expect(store.findSession(token, new Date(start.getTime() + (SESSION_DAYS - 1) * DAY))).toEqual(
      account,
    );
    // That use renewed it, so it outlives the original 90 days...
    const renewedUse = new Date(start.getTime() + (SESSION_DAYS + 30) * DAY);
    expect(store.findSession(token, renewedUse)?.id).toBe(account.id);
    // ...until 90 days pass without any use.
    expect(store.findSession(token, new Date(renewedUse.getTime() + SESSION_DAYS * DAY))).toBe(
      null,
    );
    expect(store.findSession(token, renewedUse)).toBe(null);
  });

  it("does not extend a session used again within a day", () => {
    const store = memoryStore();
    const account = store.upsertAccount(cellistProfile);
    const start = new Date("2026-10-01T12:00:00Z");
    const token = store.createSession(account.id, start);

    store.findSession(token, new Date(start.getTime() + DAY / 2));

    expect(store.findSession(token, new Date(start.getTime() + SESSION_DAYS * DAY + 1))).toBe(null);
  });

  it("stores only a hash of the session token and forgets deleted sessions", () => {
    const dir = mkdtempSync(join(tmpdir(), "music-chairs-"));
    tempDirs.push(dir);
    const filename = join(dir, "sessions.sqlite");
    const store = openStore(filename);
    opened.push(store);
    const token = store.createSession(store.upsertAccount(cellistProfile).id);
    const raw = new DatabaseSync(filename);

    const stored = raw.prepare("SELECT token_hash FROM sessions").all() as { token_hash: string }[];
    expect(stored).toHaveLength(1);
    expect(stored[0].token_hash).not.toContain(token);
    store.deleteSession(token);
    expect(store.findSession(token)).toBe(null);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM sessions").get()).toEqual({ n: 0 });
    raw.close();
  });

  it("links a name-only member once, and an account to at most one member per group", () => {
    const store = memoryStore();
    const { group } = store.createGroup("Quartet", "Viola", "Europe/London");
    const cellist = store.addMember(group.id, "Cellist", "member");
    const pianist = store.addMember(group.id, "Pianist", "member");
    const account = store.upsertAccount(cellistProfile);
    const other = store.upsertAccount({ sub: "google-sub-2", email: "p@example.test", name: "P" });

    expect(store.linkMember(group.id, cellist.id, account.id)).toBe("linked");
    expect(store.linkMember(group.id, cellist.id, account.id)).toBe("linked");
    expect(store.linkMember(group.id, pianist.id, account.id)).toBe("account-taken");
    expect(store.linkMember(group.id, cellist.id, other.id)).toBe("other-account");
    expect(store.linkMember(group.id, "unknown-member-id-xxxx", account.id)).toBe("unknown");

    expect(store.findMemberByAccount(group.id, account.id)?.id).toBe(cellist.id);
    expect(store.findMember(group.id, cellist.id)?.googleEmail).toBe("cellist@example.test");
    expect(store.findMember(group.id, pianist.id)?.googleEmail).toBe(null);
  });

  it("lists the account's groups, including ones created and joined while signed in", () => {
    const store = memoryStore();
    const account = store.upsertAccount(cellistProfile);
    const { group: created, organizer } = store.createGroup(
      "Wind Trio",
      "Oboe",
      "Europe/London",
      account.id,
    );
    const { group: joinedGroup } = store.createGroup("Brass Band", "Tuba", "Europe/London");
    store.addMember(joinedGroup.id, "Horn", "member", account.id);
    store.createGroup("Someone Else's Choir", "Alto", "Europe/London");

    const memberships = store.listAccountMemberships(account.id);

    expect(memberships.map(({ group, member }) => [group.name, member.displayName])).toEqual([
      ["Brass Band", "Horn"],
      ["Wind Trio", "Oboe"],
    ]);
    expect(memberships[1].group).toEqual(created);
    expect(organizer.googleEmail).toBe("cellist@example.test");
  });
});

describe("Google Calendar state", () => {
  const scopeA = "https://www.googleapis.com/auth/calendar.freebusy";
  const scopeB = "https://www.googleapis.com/auth/calendar.events.owned";

  function linked() {
    const store = memoryStore();
    const { group } = store.createGroup("Quartet", "Viola", "Europe/London");
    const account = store.upsertAccount({ sub: "cal-sub", email: "c@example.test", name: "C" });
    const cellist = store.addMember(group.id, "Cellist", "member", account.id);
    return { store, group, account, cellist };
  }

  it("merges granted scopes and keeps the refresh token when a later grant has none", () => {
    const { store, account } = linked();

    expect(store.saveGrant(account.id, null, [scopeA])).toBeNull();
    store.saveGrant(account.id, "refresh-1", [scopeA]);
    store.saveGrant(account.id, null, [scopeB, scopeA]);

    expect(store.findGrant(account.id)).toEqual({
      accountId: account.id,
      refreshToken: "refresh-1",
      scopes: [scopeB, scopeA].sort(),
    });
    store.deleteGrant(account.id);
    expect(store.findGrant(account.id)).toBeNull();
  });

  it("lets a late refusal of an old refresh token leave a newer grant alone", () => {
    const { store, account } = linked();
    store.saveGrant(account.id, "old-token", [scopeA]);
    store.saveGrant(account.id, "new-token", [scopeA]);

    store.deleteGrant(account.id, "old-token");
    expect(store.findGrant(account.id)?.refreshToken).toBe("new-token");
    store.deleteGrant(account.id, "new-token");
    expect(store.findGrant(account.id)).toBeNull();
  });

  it("lists only members who turned writing on, with their account", () => {
    const { store, group, account, cellist } = linked();
    store.addMember(group.id, "Pianist", "member");

    expect(store.listSyncingMembers(group.id)).toEqual([]);
    expect(store.setCalendarSync(group.id, cellist.id, true)).toBe(true);
    expect(store.findMember(group.id, cellist.id)?.calendarSync).toBe(true);
    expect(store.listSyncingMembers(group.id)).toEqual([
      { memberId: cellist.id, groupId: group.id, accountId: account.id },
    ]);
    expect(store.listSyncingMembers()).toHaveLength(1);
  });

  it("remembers the events written for a member and forgets removed ones", () => {
    const { store, cellist } = linked();
    const event = { rehearsalId: "r", date: "2026-10-08", eventId: "mcabc" };

    store.recordCalendarEvent(cellist.id, event);
    store.recordCalendarEvent(cellist.id, { ...event, date: "2026-10-15", eventId: "mcdef" });
    store.forgetCalendarEvent(cellist.id, "r", "2026-10-08");

    expect(store.listCalendarEvents(cellist.id)).toEqual([
      { rehearsalId: "r", date: "2026-10-15", eventId: "mcdef" },
    ]);
  });

  it("gives each member one unguessable feed token", () => {
    const { store, group, cellist } = linked();
    const pianist = store.addMember(group.id, "Pianist", "member");

    const token = store.feedTokenFor(cellist.id);

    expect(isToken(token)).toBe(true);
    expect(store.feedTokenFor(cellist.id)).toBe(token);
    expect(store.feedTokenFor(pianist.id)).not.toBe(token);
    expect(store.findMemberByFeed("not-a-token")).toBeNull();
  });
});

describe("scheduling requests", () => {
  const november = {
    name: "November concert",
    startDate: "2026-11-02",
    endDate: "2026-11-29",
    windows: [
      { startMinute: 600, endMinute: 780 },
      { startMinute: 1140, endMinute: 1320 },
    ],
  };

  it("creates requests with their windows, newest first, and keeps groups apart", () => {
    const store = memoryStore();
    const { group } = store.createGroup("Quartet", "Viola", "Europe/London");
    const other = store.createGroup("Trio", "Oboe", "Europe/London").group;
    const first = store.createRequest(group.id, november);
    const second = store.createRequest(group.id, {
      ...november,
      name: "Weekly rehearsals",
      windows: [{ startMinute: 1080, endMinute: 1260 }],
    });

    expect(first).toMatchObject({ ...november, groupId: group.id, open: true, answerCount: 0 });
    expect(store.listRequests(group.id).map((request) => request.name)).toEqual([
      "Weekly rehearsals",
      "November concert",
    ]);
    expect(store.findRequest(group.id, second.id)?.windows).toEqual([
      { startMinute: 1080, endMinute: 1260 },
    ]);
    expect(store.findRequest(other.id, first.id)).toBeNull();
    expect(store.findRequest(group.id, "not a token")).toBeNull();
    expect(store.listRequests(other.id)).toEqual([]);
  });

  it("updates a request, replacing its windows, and refuses a closed one", () => {
    const store = memoryStore();
    const { group } = store.createGroup("Quartet", "Viola", "Europe/London");
    const other = store.createGroup("Trio", "Oboe", "Europe/London").group;
    const request = store.createRequest(group.id, november);
    const changed = {
      ...november,
      name: "Concert",
      windows: [{ startMinute: 0, endMinute: 1440 }],
    };

    expect(store.updateRequest(other.id, request.id, changed)).toBe(false);
    expect(store.updateRequest(group.id, request.id, changed)).toBe(true);
    expect(store.findRequest(group.id, request.id)).toMatchObject(changed);

    expect(store.setRequestOpen(other.id, request.id, false)).toBe(false);
    expect(store.setRequestOpen(group.id, request.id, false)).toBe(true);
    expect(store.updateRequest(group.id, request.id, november)).toBe(false);
    expect(store.findRequest(group.id, request.id)).toMatchObject({ ...changed, open: false });
    expect(store.setRequestOpen(group.id, request.id, true)).toBe(true);
    expect(store.findRequest(group.id, request.id)?.open).toBe(true);
  });

  it("records one answer per member with a limit, updating it, only while open", () => {
    const store = memoryStore();
    const { group, organizer } = store.createGroup("Quartet", "Viola", "Europe/London");
    const cellist = store.addMember(group.id, "Cellist", "member");
    const stranger = store.createGroup("Trio", "Oboe", "Europe/London").organizer;
    const request = store.createRequest(group.id, november);

    expect(
      store.answerRequest(group.id, request.id, cellist.id, 2, new Date("2026-10-03T10:00:00Z")),
    ).toBe(true);
    expect(store.answerRequest(group.id, request.id, organizer.id, null)).toBe(true);
    expect(
      store.answerRequest(group.id, request.id, cellist.id, null, new Date("2026-10-04T10:00:00Z")),
    ).toBe(true);
    expect(store.answerRequest(group.id, request.id, stranger.id, 1)).toBe(false);

    expect(store.listAnswers(group.id, request.id)).toEqual([
      { memberId: organizer.id, answeredAt: expect.any(String), limit: null },
      { memberId: cellist.id, answeredAt: "2026-10-04T10:00:00.000Z", limit: null },
    ]);
    expect(store.findRequest(group.id, request.id)?.answerCount).toBe(2);
    expect(store.listAnswers(stranger.groupId, request.id)).toEqual([]);

    store.setRequestOpen(group.id, request.id, false);
    expect(store.answerRequest(group.id, request.id, cellist.id, 3)).toBe(false);
    expect(store.listAnswers(group.id, request.id)[1].limit).toBeNull();
  });
});

describe("rehearsals belong to a request", () => {
  it("records the request and refuses another group's or an unknown request", () => {
    const store = memoryStore();
    const { group } = store.createGroup("Quartet", "Viola", "Europe/London");
    const other = store.createGroup("Other", "Drums", "Europe/London");
    const own = requestIn(group.id, { store });
    const theirs = requestIn(other.group.id, { store });

    const [first, second] = store.addRehearsals(group.id, own, [thursdays, thursdays], "Hall");

    expect([first.requestId, second.requestId]).toEqual([own, own]);
    expect(store.findRehearsal(group.id, first.id)?.requestId).toBe(own);
    expect(() => store.addRehearsal(group.id, theirs, thursdays, "Hall")).toThrow();
    expect(() => store.addRehearsal(group.id, "Q".repeat(22), thursdays, "Hall")).toThrow();
    expect(() => store.addRehearsals(group.id, theirs, [thursdays], "Hall")).toThrow();
    expect(store.listRehearsals(group.id)).toHaveLength(2);
  });
});

describe("removing members and deleting groups", () => {
  function band(store: Store, name: string) {
    const { group, organizer } = store.createGroup(name, "Viola", "Europe/London");
    const account = store.upsertAccount({
      sub: `sub-${name}`,
      email: `${name}@example.test`,
      name,
    });
    const cellist = store.addMember(group.id, "Cellist", "member", account.id);
    store.saveGrant(account.id, "refresh", [
      "https://www.googleapis.com/auth/calendar.events.owned",
    ]);
    const slot = store.addSlot(cellist.id, thursdays);
    store.setSkip(cellist.id, slot.id, "2026-10-08", true);
    const request = store.createRequest(group.id, {
      name: "Concert",
      startDate: "2026-11-02",
      endDate: "2026-11-29",
      windows: [{ startMinute: 1140, endMinute: 1320 }],
    });
    // Linked to the request, so deleting the group meets the request link too.
    const rehearsal = store.addRehearsal(group.id, request.id, thursdays, "Studio");
    store.setCancelled(group.id, rehearsal.id, "2026-10-15", true);
    store.setRsvp(group.id, rehearsal.id, cellist.id, "2026-10-22", "yes");
    store.answerRequest(group.id, request.id, cellist.id, 2);
    store.recordCalendarEvent(cellist.id, {
      rehearsalId: rehearsal.id,
      date: "2026-10-22",
      eventId: `mc${name}new`,
    });
    store.recordCalendarEvent(cellist.id, {
      rehearsalId: rehearsal.id,
      date: "2020-01-02",
      eventId: `mc${name}old`,
    });
    return { group, organizer, account, cellist, rehearsal, request };
  }

  it("removes a member's rows and queues every event the app wrote for them", () => {
    const store = memoryStore();
    const a = band(store, "a");
    const b = band(store, "b");

    expect(store.removeMember(a.group.id, a.cellist.id)).toBe("removed");

    expect(store.findMember(a.group.id, a.cellist.id)).toBeNull();
    expect(store.listSlots(a.cellist.id)).toEqual([]);
    expect(store.listRsvps(a.group.id)).toEqual([]);
    expect(store.listAnswers(a.group.id, a.request.id)).toEqual([]);
    expect(store.listCalendarEvents(a.cellist.id)).toEqual([]);
    expect(store.listEventRemovals()).toEqual(
      [
        { accountId: a.account.id, eventId: "mcanew" },
        { accountId: a.account.id, eventId: "mcaold" },
      ].sort((x, y) => x.eventId.localeCompare(y.eventId)),
    );
    // The rehearsal, the request, the other group and the account stay.
    expect(store.findRehearsal(a.group.id, a.rehearsal.id)).not.toBeNull();
    expect(store.findRequest(a.group.id, a.request.id)).not.toBeNull();
    expect(store.listSlots(b.cellist.id)).toHaveLength(1);
    expect(store.listRsvps(b.group.id)).toHaveLength(1);
    expect(store.findGrant(a.account.id)).not.toBeNull();
    expect(store.findAccountBySub("sub-a")).not.toBeNull();
  });

  it("never removes the last organizer, and treats another group's member as unknown", () => {
    const store = memoryStore();
    const a = band(store, "a");
    const b = band(store, "b");

    expect(store.removeMember(a.group.id, a.organizer.id)).toBe("last-organizer");
    expect(store.removeMember(a.group.id, b.cellist.id)).toBe("unknown");
    expect(store.listMembers(b.group.id)).toHaveLength(2);
  });

  it("deletes a group with everything in it, and only that group", () => {
    const store = memoryStore();
    const a = band(store, "a");
    const b = band(store, "b");

    expect(store.deleteGroup(a.group.id)).toBe(true);

    expect(store.findGroup(a.group.id)).toBeNull();
    expect(store.listMembers(a.group.id)).toEqual([]);
    expect(store.listRehearsals(a.group.id)).toEqual([]);
    expect(store.listRequests(a.group.id)).toEqual([]);
    expect(store.listSlots(a.cellist.id)).toEqual([]);
    expect(
      store
        .listEventRemovals()
        .map((removal) => removal.eventId)
        .sort(),
    ).toEqual(["mcanew", "mcaold"]);
    expect(store.findGroup(b.group.id)).not.toBeNull();
    expect(store.listRehearsals(b.group.id)).toHaveLength(1);
    expect(store.listRequests(b.group.id)).toHaveLength(1);
    expect(store.findGrant(a.account.id)).not.toBeNull();
    expect(store.deleteGroup(a.group.id)).toBe(false);
  });

  it("renames groups and members within their group only", () => {
    const store = memoryStore();
    const a = band(store, "a");
    const b = band(store, "b");

    expect(store.updateGroup(a.group.id, { name: "Quartet", timeZone: "America/New_York" })).toBe(
      true,
    );
    expect(store.findGroup(a.group.id)).toMatchObject({
      name: "Quartet",
      timeZone: "America/New_York",
    });
    expect(store.renameMember(a.group.id, b.cellist.id, "X")).toBe(false);
    expect(store.renameMember(a.group.id, a.cellist.id, "Tuba")).toBe(true);
    expect(store.findMember(a.group.id, a.cellist.id)?.displayName).toBe("Tuba");
    expect(store.findMember(b.group.id, b.cellist.id)?.displayName).toBe("Cellist");
  });
});

describe("profiles and returning by name", () => {
  it("saves a member's name and instrumentation within their group only", () => {
    const store = memoryStore();
    const a = store.createGroup("A", "Viola", "Europe/London");
    const b = store.createGroup("B", "Oboe", "Europe/London");
    const cellist = store.addMember(a.group.id, "Cellist", "member");

    expect(store.setProfile(b.group.id, cellist.id, { displayName: "X", instrument: "y" })).toBe(
      false,
    );
    expect(
      store.setProfile(a.group.id, cellist.id, { displayName: "Cel", instrument: "cello" }),
    ).toBe(true);
    expect(store.findMember(a.group.id, cellist.id)).toMatchObject({
      displayName: "Cel",
      instrument: "cello",
    });
    expect(cellist.instrument).toBe("");
  });

  it("matches only name-only members of that group, never organizers or linked members", () => {
    const store = memoryStore();
    const { group } = store.createGroup("A", "Spare", "Europe/London");
    const spare = store.addMember(group.id, "Spare", "member");
    const account = store.upsertAccount({ sub: "s", email: "s@example.test", name: "S" });
    store.addMember(group.id, "spare", "member", account.id);
    const other = store.createGroup("B", "Oboe", "Europe/London").group;
    store.addMember(other.id, "Spare", "member");

    expect(store.nameOnlyMatches(group.id, " SPARE ").map((member) => member.id)).toEqual([
      spare.id,
    ]);
    expect(store.nameOnlyMatches(group.id, "Nobody")).toEqual([]);
  });

  it("reads a device token back only within the member's own group", () => {
    const store = memoryStore();
    const a = store.createGroup("A", "Viola", "Europe/London");
    const b = store.createGroup("B", "Oboe", "Europe/London");
    const cellist = store.addMember(a.group.id, "Cellist", "member");

    expect(store.deviceTokenFor(a.group.id, cellist.id)).toBe(cellist.deviceToken);
    expect(store.deviceTokenFor(b.group.id, cellist.id)).toBeNull();
    expect(store.deviceTokenFor(a.group.id, "not a token")).toBeNull();
  });
});

describe("schema migrations", () => {
  function fileDatabase(): string {
    const dir = mkdtempSync(join(tmpdir(), "music-chairs-"));
    tempDirs.push(dir);
    return join(dir, "live.sqlite");
  }

  function version(db: DatabaseSync): number {
    return (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  }

  it("starts a new database at the latest version and keeps rows across reopening", () => {
    const filename = fileDatabase();
    const first = openStore(filename);
    const { group } = first.createGroup("Quartet", "Viola", "Europe/London");
    first.close();

    const second = openStore(filename);
    opened.push(second);
    const raw = new DatabaseSync(filename);

    expect(version(raw)).toBe(MIGRATIONS.length);
    expect(second.findGroup(group.id)?.name).toBe("Quartet");
    raw.close();
  });

  it("upgrades a version-1 database to accounts and sessions, keeping its data", () => {
    const filename = fileDatabase();
    const raw = new DatabaseSync(filename);
    migrate(raw, MIGRATIONS.slice(0, 1));
    raw.exec(`
      INSERT INTO groups VALUES ('g', 'invite', 'Quartet', 'Europe/London', 0, '2026-10-01');
      INSERT INTO members VALUES ('m', 'g', 'Cellist', 'member', 0, 'device', '2026-10-01');
      INSERT INTO availability VALUES ('a', 'm', 'weekly', '2026-10-01', NULL, 1140, 1260, '2026-10-01');
      INSERT INTO rehearsals VALUES ('r', 'g', 'once', '2026-10-08', NULL, 1140, 1260, 'Studio', 'confirmed', '2026-10-01');
      INSERT INTO rsvps VALUES ('r', 'm', '2026-10-08', 'yes', '2026-10-01');
    `);
    expect(version(raw)).toBe(1);
    raw.close();

    const store = openStore(filename);
    opened.push(store);
    const check = new DatabaseSync(filename);

    expect(version(check)).toBe(MIGRATIONS.length);
    expect(check.prepare("SELECT account_id FROM members").all()).toEqual([{ account_id: null }]);
    expect(check.prepare("SELECT COUNT(*) AS n FROM availability").get()).toEqual({ n: 1 });
    expect(store.listRsvps("g")).toEqual([
      { rehearsalId: "r", memberId: "m", date: "2026-10-08", answer: "yes" },
    ]);
    expect(store.listMembers("g").map((m) => [m.displayName, m.googleEmail])).toEqual([
      ["Cellist", null],
    ]);
    check.close();
  });

  it("upgrades a version-2 database to Calendar grants, switches and feeds, keeping its data", () => {
    const filename = fileDatabase();
    const raw = new DatabaseSync(filename);
    migrate(raw, MIGRATIONS.slice(0, 2));
    raw.exec(`
      INSERT INTO groups VALUES ('g', 'invite', 'Quartet', 'Europe/London', 0, '2026-10-01');
      INSERT INTO accounts VALUES ('a', 'sub-a', 'a@example.test', 'A', '2026-10-01');
      INSERT INTO members VALUES ('m', 'g', 'Cellist', 'member', 0, 'device', '2026-10-01', 'a');
    `);
    expect(version(raw)).toBe(2);
    raw.close();

    const store = openStore(filename);
    opened.push(store);
    const check = new DatabaseSync(filename);

    expect(version(check)).toBe(MIGRATIONS.length);
    expect(check.prepare("SELECT calendar_sync, feed_token FROM members").all()).toEqual([
      { calendar_sync: 0, feed_token: null },
    ]);
    expect(store.listMembers("g")).toEqual([
      expect.objectContaining({ calendarSync: false, googleEmail: "a@example.test" }),
    ]);
    check.close();
  });

  it("upgrades a version-3 database to quarter-hour times, keeping rows, children and checks", () => {
    const filename = fileDatabase();
    const raw = new DatabaseSync(filename);
    migrate(raw, MIGRATIONS.slice(0, 3));
    raw.exec(`
      INSERT INTO groups VALUES ('g', 'invite', 'Quartet', 'Europe/London', 0, '2026-10-01');
      INSERT INTO members (id, group_id, display_name, role, optional, device_token, joined_at)
        VALUES ('m', 'g', 'Cellist', 'member', 0, 'device', '2026-10-01');
      INSERT INTO availability VALUES ('a', 'm', 'weekly', '2026-10-01', NULL, 1140, 1260, '2026-10-01');
      INSERT INTO availability_skips VALUES ('a', '2026-10-08');
      INSERT INTO rehearsals VALUES ('r', 'g', 'weekly', '2026-10-01', NULL, 1140, 1260, 'Studio', 'confirmed', '2026-10-01');
      INSERT INTO rehearsal_cancellations VALUES ('r', '2026-10-15');
      INSERT INTO rsvps VALUES ('r', 'm', '2026-10-08', 'yes', '2026-10-01');
    `);
    expect(() =>
      raw.exec(
        "INSERT INTO availability VALUES ('q', 'm', 'once', '2026-10-02', NULL, 1155, 1260, 'x')",
      ),
    ).toThrow();
    raw.close();

    openStore(filename).close();
    const db = new DatabaseSync(filename);
    const count = (table: string) =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

    expect(version(db)).toBe(MIGRATIONS.length);
    for (const table of [
      "availability",
      "availability_skips",
      "rehearsals",
      "rehearsal_cancellations",
      "rsvps",
    ]) {
      expect(count(table)).toBe(1);
    }
    db.exec(
      "INSERT INTO availability VALUES ('q', 'm', 'once', '2026-10-02', NULL, 1155, 1290, 'x')",
    );
    expect(() =>
      db.exec(
        "INSERT INTO availability VALUES ('t', 'm', 'once', '2026-10-02', NULL, 1150, 1290, 'x')",
      ),
    ).toThrow();
    expect(() =>
      db.exec(
        "INSERT INTO rehearsals VALUES ('u', 'g', 'once', '2026-10-02', NULL, 1200, 1200, 'S', 'proposed', 'x')",
      ),
    ).toThrow();
    const indexes = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name").all() as {
        name: string;
      }[]
    ).map((row) => row.name);
    expect(indexes).toEqual(
      expect.arrayContaining(["availability_by_member", "rehearsals_by_group"]),
    );
    db.close();
  });

  it("upgrades a version-4 database to scheduling requests, keeping its data and checks", () => {
    const filename = fileDatabase();
    const raw = new DatabaseSync(filename);
    migrate(raw, MIGRATIONS.slice(0, 4));
    raw.exec(`
      INSERT INTO groups VALUES ('g', 'invite', 'Quartet', 'Europe/London', 0, '2026-10-01');
      INSERT INTO members (id, group_id, display_name, role, optional, device_token, joined_at)
        VALUES ('m', 'g', 'Cellist', 'member', 0, 'device', '2026-10-01');
      INSERT INTO rehearsals VALUES ('r', 'g', 'once', '2026-10-08', NULL, 1140, 1260, 'Studio', 'confirmed', '2026-10-01');
    `);
    expect(version(raw)).toBe(4);
    raw.close();

    const store = openStore(filename);
    opened.push(store);
    const db = new DatabaseSync(filename);
    db.exec("PRAGMA foreign_keys = ON;");

    expect(version(db)).toBe(MIGRATIONS.length);
    expect(store.listMembers("g").map((member) => member.displayName)).toEqual(["Cellist"]);
    expect(store.listRehearsals("g")).toHaveLength(1);
    expect(store.listRequests("g")).toEqual([]);
    db.exec(`
      INSERT INTO requests VALUES ('q', 'g', 'Concert', '2026-11-01', '2026-11-30', 1, 'x');
      INSERT INTO request_windows VALUES ('q', 1140, 1320);
      INSERT INTO request_answers VALUES ('q', 'm', 'x', NULL);
      INSERT INTO requests VALUES ('q2', 'g', 'Weekly', '2026-11-01', '2026-11-01', 1, 'x');
    `);
    for (const bad of [
      "INSERT INTO requests VALUES ('b', 'g', 'B', '2026-11-30', '2026-11-01', 1, 'x')",
      "INSERT INTO request_windows VALUES ('q', 1150, 1320)",
      "INSERT INTO request_windows VALUES ('q', 1320, 1320)",
      "INSERT INTO request_answers VALUES ('q2', 'm', 'x', 0)",
      "INSERT INTO request_answers VALUES ('q2', 'm', 'x', 100)",
      "INSERT INTO requests VALUES ('n', 'no-group', 'N', '2026-11-01', '2026-11-01', 1, 'x')",
      "INSERT INTO request_answers VALUES ('q2', 'no-member', 'x', NULL)",
      "INSERT INTO request_windows VALUES ('no-request', 1140, 1320)",
    ]) {
      expect(() => db.exec(bad)).toThrow();
    }
    db.exec("INSERT INTO request_answers VALUES ('q2', 'm', 'x', 99)");
    // Windows and answers go with their request.
    db.exec("DELETE FROM requests WHERE id = 'q'");
    expect(db.prepare("SELECT COUNT(*) AS n FROM request_windows").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM request_answers").get()).toEqual({ n: 1 });
    db.close();
  });

  it("upgrades a version-5 database to pending event removals, keeping its data", () => {
    const filename = fileDatabase();
    const raw = new DatabaseSync(filename);
    migrate(raw, MIGRATIONS.slice(0, 5));
    raw.exec(`
      INSERT INTO groups VALUES ('g', 'invite', 'Quartet', 'Europe/London', 0, '2026-10-01');
      INSERT INTO accounts VALUES ('a', 'sub-a', 'a@example.test', 'A', '2026-10-01');
      INSERT INTO members (id, group_id, display_name, role, optional, device_token, joined_at, account_id)
        VALUES ('m', 'g', 'Cellist', 'member', 0, 'device', '2026-10-01', 'a');
      INSERT INTO requests VALUES ('q', 'g', 'Concert', '2026-11-01', '2026-11-30', 1, 'x');
    `);
    expect(version(raw)).toBe(5);
    raw.close();

    const store = openStore(filename);
    opened.push(store);
    const db = new DatabaseSync(filename);
    db.exec("PRAGMA foreign_keys = ON;");

    expect(version(db)).toBe(MIGRATIONS.length);
    expect(store.listMembers("g")).toHaveLength(1);
    expect(store.listRequests("g")).toHaveLength(1);
    expect(store.listEventRemovals()).toEqual([]);
    db.exec("INSERT INTO calendar_event_removals VALUES ('a', 'mc1')");
    for (const bad of [
      "INSERT INTO calendar_event_removals VALUES ('a', 'mc1')",
      "INSERT INTO calendar_event_removals VALUES ('no-account', 'mc2')",
    ]) {
      expect(() => db.exec(bad)).toThrow();
    }
    expect(store.listEventRemovals()).toEqual([{ accountId: "a", eventId: "mc1" }]);
    db.close();
  });

  it("upgrades a version-6 database to instrumentation, keeping members", () => {
    const filename = fileDatabase();
    const raw = new DatabaseSync(filename);
    migrate(raw, MIGRATIONS.slice(0, 6));
    raw.exec(`
      INSERT INTO groups VALUES ('g', 'invite', 'Quartet', 'Europe/London', 0, '2026-10-01');
      INSERT INTO members (id, group_id, display_name, role, optional, device_token, joined_at)
        VALUES ('m', 'g', 'Cellist', 'member', 0, 'device', '2026-10-01');
    `);
    expect(version(raw)).toBe(6);
    raw.close();

    const store = openStore(filename);
    opened.push(store);

    expect(store.listMembers("g")).toEqual([
      expect.objectContaining({ displayName: "Cellist", instrument: "" }),
    ]);
    const db = new DatabaseSync(filename);
    expect(version(db)).toBe(MIGRATIONS.length);
    db.close();
  });

  it("upgrades a version-7 database to invitations, leaving accounts unverified", () => {
    const filename = fileDatabase();
    const raw = new DatabaseSync(filename);
    migrate(raw, MIGRATIONS.slice(0, 7));
    raw.exec(`
      INSERT INTO groups VALUES ('g', 'invite', 'Quartet', 'Europe/London', 0, '2026-10-01');
      INSERT INTO members (id, group_id, display_name, role, optional, device_token, joined_at)
        VALUES ('m', 'g', 'Cellist', 'member', 0, 'device', '2026-10-01');
      INSERT INTO accounts (id, google_sub, email, name, created_at)
        VALUES ('a', 'sub', 'cellist@example.test', 'Cellist', '2026-10-01');
    `);
    expect(version(raw)).toBe(7);
    raw.close();

    const store = openStore(filename);
    opened.push(store);

    expect(store.listMembers("g")).toEqual([
      expect.objectContaining({ displayName: "Cellist", invitedEmail: null }),
    ]);
    const db = new DatabaseSync(filename);
    expect(version(db)).toBe(MIGRATIONS.length);
    expect(db.prepare("SELECT email_verified FROM accounts").get()).toEqual({ email_verified: 0 });
    db.close();
  });

  it("upgrades a version-8 database to request links, keeping every rehearsal unlinked", () => {
    const filename = fileDatabase();
    const raw = new DatabaseSync(filename);
    migrate(raw, MIGRATIONS.slice(0, 8));
    const rehearsalId = "R".repeat(22);
    raw.exec(`
      INSERT INTO groups VALUES ('g', 'invite', 'Quartet', 'Europe/London', 0, '2026-10-01');
      INSERT INTO members (id, group_id, display_name, role, optional, device_token, joined_at)
        VALUES ('m', 'g', 'Cellist', 'member', 0, 'device', '2026-10-01');
      INSERT INTO requests VALUES ('q', 'g', 'Concert', '2026-10-01', '2026-10-31', 1, '2026-10-01');
      INSERT INTO rehearsals
        (id, group_id, kind, start_date, end_date, start_minute, end_minute, location, status,
         created_at)
        VALUES ('${rehearsalId}', 'g', 'weekly', '2026-10-01', NULL, 1140, 1260, 'Hall',
          'confirmed', '2026-10-01');
      INSERT INTO rehearsal_cancellations VALUES ('${rehearsalId}', '2026-10-08');
      INSERT INTO rsvps VALUES ('${rehearsalId}', 'm', '2026-10-15', 'yes', '2026-10-01');
    `);
    expect(version(raw)).toBe(8);
    raw.close();

    const store = openStore(filename);
    opened.push(store);

    expect(store.listRehearsals("g")).toEqual([
      expect.objectContaining({
        id: rehearsalId,
        status: "confirmed",
        requestId: null,
        skips: ["2026-10-08"],
      }),
    ]);
    expect(store.listRsvps("g")).toHaveLength(1);
    expect(store.listRequests("g")).toHaveLength(1);
    const db = new DatabaseSync(filename);
    expect(version(db)).toBe(MIGRATIONS.length);
    expect(db.prepare("SELECT request_id FROM rehearsals").get()).toEqual({ request_id: null });
    db.close();
  });

  it("refuses a database from a newer version, even in development", () => {
    const filename = fileDatabase();
    openStore(filename).close();
    const raw = new DatabaseSync(filename);
    raw.exec(`PRAGMA user_version = ${MIGRATIONS.length + 1};`);
    raw.close();

    expect(() => openStore(filename, { resetIfStale: true })).toThrow(
      "is newer than this version of music-chairs supports",
    );
    expect(readdirSync(dirname(filename)).filter((name) => name.includes("stale"))).toEqual([]);
  });

  it("applies a later migration once, and a table rebuild keeps the child rows", () => {
    const filename = fileDatabase();
    const store = openStore(filename);
    const { group, organizer } = store.createGroup("Quartet", "Viola", "Europe/London");
    const slot = store.addSlot(organizer.id, thursdays);
    store.setSkip(organizer.id, slot.id, "2026-10-08", true);
    store.close();

    // A typical SQLite column change: rebuild the parent table of availability_skips.
    const rebuild = `
      CREATE TABLE availability_new (
        id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL REFERENCES members(id),
        kind TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT,
        start_minute INTEGER NOT NULL,
        end_minute INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT ''
      );
      INSERT INTO availability_new
        SELECT id, member_id, kind, start_date, end_date, start_minute, end_minute, created_at, ''
        FROM availability;
      DROP TABLE availability;
      ALTER TABLE availability_new RENAME TO availability;
    `;
    const db = new DatabaseSync(filename);
    db.exec("PRAGMA foreign_keys = ON;");
    migrate(db, [...MIGRATIONS, rebuild]);
    migrate(db, [...MIGRATIONS, rebuild]);

    expect(version(db)).toBe(MIGRATIONS.length + 1);
    expect(db.prepare("SELECT date FROM availability_skips").all()).toEqual([
      { date: "2026-10-08" },
    ]);
    expect(db.prepare("SELECT note FROM availability").all()).toEqual([{ note: "" }]);
    expect(db.prepare("SELECT name FROM groups WHERE id = ?").get(group.id)).toEqual({
      name: "Quartet",
    });
    db.close();
  });

  it("rolls a failing migration back completely", () => {
    const filename = fileDatabase();
    const store = openStore(filename);
    store.createGroup("Quartet", "Viola", "Europe/London");
    store.close();
    const db = new DatabaseSync(filename);

    let failure: unknown;
    try {
      migrate(db, [...MIGRATIONS, "DELETE FROM groups; SELECT * FROM no_such_table;"]);
    } catch (error) {
      failure = error;
    }
    expect((failure as Error).message).toContain(
      `from schema version ${MIGRATIONS.length} to ${MIGRATIONS.length + 1} failed`,
    );
    // Without the SQLite code, openStore never treats it as a stale database to move aside.
    expect((failure as { code?: unknown }).code).toBeUndefined();
    expect(() => migrate(db, [...MIGRATIONS, "DELETE FROM groups;"])).toThrow(
      "broken foreign-key references",
    );

    expect(version(db)).toBe(MIGRATIONS.length);
    expect(db.prepare("SELECT COUNT(*) AS n FROM groups").get()).toEqual({ n: 1 });
    db.close();
  });
});

describe("members added from contacts", () => {
  const amy = { sub: "amy-sub", email: "Amy@Example.test", name: "Amy", emailVerified: true };

  it("keeps the email lowercased, once per group", () => {
    const store = memoryStore();
    const { group } = store.createGroup("Quartet", "Viola", "Europe/London");
    const other = store.createGroup("Trio", "Viola", "Europe/London").group;

    expect(store.addInvitedMember(group.id, "Amy", " AMY@example.test ").invitedEmail).toBe(
      "amy@example.test",
    );
    expect(store.addInvitedMember(group.id, "Spare", null).invitedEmail).toBeNull();
    expect(() => store.addInvitedMember(group.id, "Amy again", "amy@example.test")).toThrow();
    expect(store.listMembers(group.id).map((member) => member.displayName)).toEqual([
      "Viola",
      "Amy",
      "Spare",
    ]);
    expect(store.addInvitedMember(other.id, "Amy", "amy@example.test").invitedEmail).toBe(
      "amy@example.test",
    );
  });

  it("is claimed by the account with that verified email, and only once", () => {
    const store = memoryStore();
    const { group } = store.createGroup("Quartet", "Viola", "Europe/London");
    const invited = store.addInvitedMember(group.id, "Amy", "amy@example.test");
    const account = store.upsertAccount(amy);

    const claimed = store.claimInvitation(group.id, account.id);

    expect(claimed).toMatchObject({
      id: invited.id,
      googleEmail: "Amy@Example.test",
      invitedEmail: null,
    });
    expect(store.findMemberByAccount(group.id, account.id)?.id).toBe(invited.id);
    expect(store.claimInvitation(group.id, account.id)).toBeNull();
  });

  it("is not claimed by an unverified email, another email or an account already in the group", () => {
    const store = memoryStore();
    const { group } = store.createGroup("Quartet", "Viola", "Europe/London");
    store.addInvitedMember(group.id, "Amy", "amy@example.test");
    const unverified = store.upsertAccount({ ...amy, emailVerified: false });
    expect(store.claimInvitation(group.id, unverified.id)).toBeNull();

    const bob = store.upsertAccount({ ...amy, sub: "bob-sub", email: "bob@example.test" });
    expect(store.claimInvitation(group.id, bob.id)).toBeNull();

    const verified = store.upsertAccount(amy);
    store.addMember(group.id, "Amy B", "member", verified.id);
    expect(store.claimInvitation(group.id, verified.id)).toBeNull();
    expect(
      store.listMembers(group.id).find((member) => member.displayName === "Amy"),
    ).toMatchObject({ invitedEmail: "amy@example.test", googleEmail: null });
  });

  it("is never matched by name alone", () => {
    const store = memoryStore();
    const { group } = store.createGroup("Quartet", "Viola", "Europe/London");
    store.addInvitedMember(group.id, "Amy", "amy@example.test");
    const spare = store.addInvitedMember(group.id, "Spare", null);

    expect(store.nameOnlyMatches(group.id, "amy")).toEqual([]);
    expect(store.nameOnlyMatches(group.id, "spare").map((member) => member.id)).toEqual([spare.id]);
  });
});
