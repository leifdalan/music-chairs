import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isToken, openStore, type Member, type NewMember, type Store } from "../app/.server/store";
import type { SlotInput } from "../app/lib/availability";

/** A new member as every later read returns it: without the device token. */
function withoutToken(member: NewMember): Member {
  return {
    id: member.id,
    groupId: member.groupId,
    displayName: member.displayName,
    role: member.role,
    optional: member.optional,
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
      "move or delete that file and its -wal and -shm files",
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

  it("refuses rows off the 30-minute grid or ending before they start", () => {
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

    const weekly = store.addRehearsal(group.id, thursdays, "Studio B");
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
    const weekly = store.addRehearsal(group.id, thursdays, "");
    const once = store.addRehearsal(group.id, { ...thursdays, kind: "once" }, "");

    expect(store.setCancelled(group.id, weekly.id, "2026-10-09", true)).toBe(false);
    expect(store.setCancelled(group.id, weekly.id, "2026-10-08", true)).toBe(true);
    expect(store.setCancelled(group.id, weekly.id, "2026-10-08", false)).toBe(true);
    expect(store.findRehearsal(group.id, weekly.id)?.skips).toEqual([]);
    expect(store.endRehearsal(group.id, once.id, "2026-10-22")).toBeNull();
  });
});
