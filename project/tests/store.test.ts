import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { isToken, openStore, type Store } from "../app/.server/store";
import type { SlotInput } from "../app/lib/availability";

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
    expect(store.listMembers(group.id)).toEqual([organizer]);
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

    expect(store.listMembers(group.id)).toEqual([organizer, cellist, second]);
    expect(store.findMember(group.id, second.id)?.role).toBe("organizer");
  });

  it("finds a member only within their own group", () => {
    const store = memoryStore();
    const first = store.createGroup("First", "Viola", "Europe/London");
    const second = store.createGroup("Second", "Cello", "Europe/London");

    expect(store.findMember(first.group.id, first.organizer.id)).toEqual(first.organizer);
    expect(store.findMember(second.group.id, first.organizer.id)).toBeNull();
  });

  it("refuses a database from an earlier schema with a message saying what to do", () => {
    const dir = mkdtempSync(join(tmpdir(), "music-chairs-"));
    tempDirs.push(dir);
    const filename = join(dir, "phase-1.sqlite");
    // A groups table as Phase 1 created it, without the time zone column.
    const old = new DatabaseSync(filename);
    old.exec(
      "CREATE TABLE groups (id TEXT PRIMARY KEY, invite_token TEXT NOT NULL UNIQUE, " +
        "name TEXT NOT NULL, created_at TEXT NOT NULL)",
    );
    old.close();

    expect(() => openStore(filename)).toThrow(
      `The database ${filename} does not match this version of music-chairs`,
    );
    expect(() => openStore(filename)).toThrow(
      "move or delete that file and its -wal and -shm files",
    );
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
