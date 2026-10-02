import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { isToken, openStore, type Store } from "../app/.server/store";

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
    const { group, organizer } = store.createGroup("Thursday Quartet", "Viola");

    expect(store.findGroup(group.id)).toEqual(group);
    expect(store.listMembers(group.id)).toEqual([organizer]);
    expect(organizer).toMatchObject({ groupId: group.id, displayName: "Viola", role: "organizer" });
  });

  it("issues unguessable, distinct identifiers", () => {
    const store = memoryStore();
    const { group, organizer } = store.createGroup("Quartet", "Viola");

    for (const id of [group.id, group.inviteToken, organizer.id]) expect(isToken(id)).toBe(true);
    expect(new Set([group.id, group.inviteToken, organizer.id]).size).toBe(3);
  });

  it("finds a group by its invite token, and nothing for unknown or malformed tokens", () => {
    const store = memoryStore();
    const { group } = store.createGroup("Quartet", "Viola");

    expect(store.findGroupByInviteToken(group.inviteToken)).toEqual(group);
    expect(store.findGroupByInviteToken("A".repeat(22))).toBeNull();
    expect(store.findGroupByInviteToken("not a token")).toBeNull();
    expect(store.findGroupByInviteToken(group.id)).toBeNull();
    expect(store.findGroup(group.inviteToken)).toBeNull();
  });

  it("lists members in joining order and supports more than one organizer", () => {
    const store = memoryStore();
    const { group, organizer } = store.createGroup("Quartet", "Viola");
    const cellist = store.addMember(group.id, "Cellist", "member");
    const second = store.addMember(group.id, "Pianist", "organizer");

    expect(store.listMembers(group.id)).toEqual([organizer, cellist, second]);
    expect(store.findMember(group.id, second.id)?.role).toBe("organizer");
  });

  it("finds a member only within their own group", () => {
    const store = memoryStore();
    const first = store.createGroup("First", "Viola");
    const second = store.createGroup("Second", "Cello");

    expect(store.findMember(first.group.id, first.organizer.id)).toEqual(first.organizer);
    expect(store.findMember(second.group.id, first.organizer.id)).toBeNull();
  });

  it("keeps data after the database is closed and reopened", () => {
    const dir = mkdtempSync(join(tmpdir(), "music-chairs-"));
    tempDirs.push(dir);
    const filename = join(dir, "nested", "music-chairs.sqlite");

    const before = openStore(filename);
    const { group } = before.createGroup("Thursday Quartet", "Viola");
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
