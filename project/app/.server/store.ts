import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { isOccurrence, type Slot, type SlotInput } from "~/lib/availability";

export type Role = "organizer" | "member";

export type Group = { id: string; inviteToken: string; name: string; timeZone: string };

export type Member = { id: string; groupId: string; displayName: string; role: Role };

export type Store = {
  createGroup(
    name: string,
    organizerName: string,
    timeZone: string,
  ): { group: Group; organizer: Member };
  findGroup(id: string): Group | null;
  findGroupByInviteToken(token: string): Group | null;
  addMember(groupId: string, displayName: string, role: Role): Member;
  findMember(groupId: string, memberId: string): Member | null;
  listMembers(groupId: string): Member[];
  // Availability is always read and written through its owner: a slot id of
  // another member behaves exactly like an unknown one.
  listSlots(memberId: string): Slot[];
  findSlot(memberId: string, slotId: string): Slot | null;
  addSlot(memberId: string, input: SlotInput): Slot;
  updateSlot(memberId: string, slotId: string, input: SlotInput): Slot | null;
  deleteSlot(memberId: string, slotId: string): boolean;
  /** Skips or restores one date; false when the slot is unknown or does not meet that day. */
  setSkip(memberId: string, slotId: string, date: string, skipped: boolean): boolean;
  close(): void;
};

const DEFAULT_DATABASE = "data/music-chairs.sqlite";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    invite_token TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    time_zone TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id),
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('organizer', 'member')),
    joined_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS members_by_group ON members (group_id, joined_at);
  CREATE TABLE IF NOT EXISTS availability (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES members(id),
    kind TEXT NOT NULL CHECK (kind IN ('once', 'weekly')),
    start_date TEXT NOT NULL,
    end_date TEXT,
    start_minute INTEGER NOT NULL CHECK (start_minute % 30 = 0 AND start_minute >= 0),
    end_minute INTEGER NOT NULL CHECK (
      end_minute % 30 = 0 AND end_minute > start_minute AND end_minute <= 1440
    ),
    created_at TEXT NOT NULL,
    CHECK (end_date IS NULL OR (kind = 'weekly' AND end_date >= start_date))
  );
  CREATE INDEX IF NOT EXISTS availability_by_member ON availability (member_id);
  CREATE TABLE IF NOT EXISTS availability_skips (
    availability_id TEXT NOT NULL REFERENCES availability(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    PRIMARY KEY (availability_id, date)
  );
`;

/** A new unguessable identifier: 16 random bytes, base64url (22 characters). */
function newToken(): string {
  return randomBytes(16).toString("base64url");
}

/** Whether a value has the shape of an identifier this store issues. */
export function isToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

type GroupRow = { id: string; invite_token: string; name: string; time_zone: string };
type MemberRow = { id: string; group_id: string; display_name: string; role: Role };
type SlotRow = {
  id: string;
  kind: Slot["kind"];
  start_date: string;
  end_date: string | null;
  start_minute: number;
  end_minute: number;
};

function toGroup(row: GroupRow): Group {
  return { id: row.id, inviteToken: row.invite_token, name: row.name, timeZone: row.time_zone };
}

function toMember(row: MemberRow): Member {
  return { id: row.id, groupId: row.group_id, displayName: row.display_name, role: row.role };
}

/** Opens (creating if needed) the SQLite database at `filename`; `:memory:` is private to the store. */
export function openStore(filename: string): Store {
  if (filename !== ":memory:") {
    mkdirSync(dirname(resolve(filename)), { recursive: true });
  }
  const db = new DatabaseSync(filename);
  try {
    return buildStore(db, filename);
  } catch (error) {
    db.close();
    if ((error as { code?: unknown }).code !== "ERR_SQLITE_ERROR") throw error;
    // Until the first release the schema changes without migrations
    // (policies/greenfield-until-released.md). `CREATE TABLE IF NOT EXISTS`
    // leaves an older table as it was, so a database from an earlier version
    // fails here, when the statements are prepared. Say so plainly instead of
    // failing every request with SQLite's generic "SQL logic error".
    throw new Error(
      `The database ${resolve(filename)} does not match this version of music-chairs ` +
        `(${(error as Error).message}). It was probably created by an earlier version, and ` +
        "there are no migrations before the first release: stop the server, move or delete " +
        "that file and its -wal and -shm files, then start again.",
      { cause: error },
    );
  }
}

/** Applies the schema and prepares every statement; throws if the file's tables differ. */
function buildStore(db: DatabaseSync, filename: string): Store {
  db.exec("PRAGMA foreign_keys = ON;");
  if (filename !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  db.exec(SCHEMA);

  const insertGroup = db.prepare(
    "INSERT INTO groups (id, invite_token, name, time_zone, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const insertMember = db.prepare(
    "INSERT INTO members (id, group_id, display_name, role, joined_at) VALUES (?, ?, ?, ?, ?)",
  );
  const selectGroup = db.prepare(
    "SELECT id, invite_token, name, time_zone FROM groups WHERE id = ?",
  );
  const selectGroupByInvite = db.prepare(
    "SELECT id, invite_token, name, time_zone FROM groups WHERE invite_token = ?",
  );
  const selectMember = db.prepare(
    "SELECT id, group_id, display_name, role FROM members WHERE group_id = ? AND id = ?",
  );
  const selectMembers = db.prepare(
    "SELECT id, group_id, display_name, role FROM members WHERE group_id = ? ORDER BY joined_at, rowid",
  );

  const slotColumns = "id, kind, start_date, end_date, start_minute, end_minute";
  const selectSlots = db.prepare(
    `SELECT ${slotColumns} FROM availability WHERE member_id = ?
     ORDER BY start_date, start_minute, created_at, rowid`,
  );
  const selectSlot = db.prepare(
    `SELECT ${slotColumns} FROM availability WHERE member_id = ? AND id = ?`,
  );
  const selectSkips = db.prepare(
    "SELECT date FROM availability_skips WHERE availability_id = ? ORDER BY date",
  );
  const insertSlot = db.prepare(
    `INSERT INTO availability
     (id, member_id, kind, start_date, end_date, start_minute, end_minute, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const changeSlot = db.prepare(
    `UPDATE availability SET kind = ?, start_date = ?, end_date = ?, start_minute = ?, end_minute = ?
     WHERE member_id = ? AND id = ?`,
  );
  const removeSlot = db.prepare("DELETE FROM availability WHERE member_id = ? AND id = ?");
  const insertSkip = db.prepare(
    "INSERT OR IGNORE INTO availability_skips (availability_id, date) VALUES (?, ?)",
  );
  const removeSkip = db.prepare(
    "DELETE FROM availability_skips WHERE availability_id = ? AND date = ?",
  );

  function toSlot(row: SlotRow): Slot {
    return {
      id: row.id,
      kind: row.kind,
      startDate: row.start_date,
      endDate: row.end_date,
      startMinute: row.start_minute,
      endMinute: row.end_minute,
      skips: (selectSkips.all(row.id) as { date: string }[]).map((skip) => skip.date),
    };
  }

  function findSlot(memberId: string, slotId: string): Slot | null {
    if (!isToken(slotId)) return null;
    const row = selectSlot.get(memberId, slotId) as SlotRow | undefined;
    return row ? toSlot(row) : null;
  }

  function transaction<T>(work: () => T): T {
    db.exec("BEGIN");
    try {
      const result = work();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function addMember(groupId: string, displayName: string, role: Role): Member {
    const member: Member = { id: newToken(), groupId, displayName, role };
    insertMember.run(member.id, groupId, displayName, role, new Date().toISOString());
    return member;
  }

  return {
    createGroup(name, organizerName, timeZone) {
      const group: Group = { id: newToken(), inviteToken: newToken(), name, timeZone };
      return transaction(() => {
        insertGroup.run(group.id, group.inviteToken, name, timeZone, new Date().toISOString());
        const organizer = addMember(group.id, organizerName, "organizer");
        return { group, organizer };
      });
    },
    findGroup(id) {
      if (!isToken(id)) return null;
      const row = selectGroup.get(id) as GroupRow | undefined;
      return row ? toGroup(row) : null;
    },
    findGroupByInviteToken(token) {
      if (!isToken(token)) return null;
      const row = selectGroupByInvite.get(token) as GroupRow | undefined;
      return row ? toGroup(row) : null;
    },
    addMember,
    findMember(groupId, memberId) {
      if (!isToken(memberId)) return null;
      const row = selectMember.get(groupId, memberId) as MemberRow | undefined;
      return row ? toMember(row) : null;
    },
    listMembers(groupId) {
      return (selectMembers.all(groupId) as MemberRow[]).map(toMember);
    },
    listSlots(memberId) {
      return (selectSlots.all(memberId) as SlotRow[]).map(toSlot);
    },
    findSlot,
    addSlot(memberId, input) {
      const id = newToken();
      insertSlot.run(
        id,
        memberId,
        input.kind,
        input.startDate,
        input.endDate,
        input.startMinute,
        input.endMinute,
        new Date().toISOString(),
      );
      return { ...input, id, skips: [] };
    },
    updateSlot(memberId, slotId, input) {
      const existing = findSlot(memberId, slotId);
      if (!existing) return null;
      return transaction(() => {
        changeSlot.run(
          input.kind,
          input.startDate,
          input.endDate,
          input.startMinute,
          input.endMinute,
          memberId,
          slotId,
        );
        // Skips that are no longer dates of the edited pattern go with it.
        for (const date of existing.skips) {
          if (!isOccurrence(input, date)) removeSkip.run(slotId, date);
        }
        return findSlot(memberId, slotId);
      });
    },
    deleteSlot(memberId, slotId) {
      if (!isToken(slotId)) return false;
      return Number(removeSlot.run(memberId, slotId).changes) > 0;
    },
    setSkip(memberId, slotId, date, skipped) {
      const slot = findSlot(memberId, slotId);
      if (!slot || !isOccurrence(slot, date)) return false;
      if (skipped) insertSkip.run(slotId, date);
      else removeSkip.run(slotId, date);
      return true;
    },
    close() {
      db.close();
    },
  };
}

let shared: Store | undefined;

/** The process-wide store for `MUSIC_CHAIRS_DB` (default `data/music-chairs.sqlite`), opened on first use. */
export function getStore(): Store {
  shared ??= openStore(process.env.MUSIC_CHAIRS_DB || DEFAULT_DATABASE);
  return shared;
}
