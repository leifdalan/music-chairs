import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { isOccurrence, type Slot, type SlotInput } from "~/lib/availability";

export type Role = "organizer" | "member";

export type Group = {
  id: string;
  inviteToken: string;
  name: string;
  timeZone: string;
  /** Whether members see who is free, or only counts (organizers always see names). */
  showNames: boolean;
};

export type Member = {
  id: string;
  groupId: string;
  displayName: string;
  role: Role;
  /** Optional members don't trigger "missing" warnings; everyone else counts as required. */
  optional: boolean;
};

/**
 * A member as first created, with the device token that identifies their
 * device. The token is the only bearer secret: it is never read back by any
 * other store function and must never reach page data.
 */
export type NewMember = Member & { deviceToken: string };

export type RehearsalStatus = "proposed" | "confirmed";

/** A rehearsal reuses the availability slot shape; `skips` are its cancelled dates. */
export type Rehearsal = Slot & { location: string; status: RehearsalStatus };

export type RoleChange = "changed" | "unknown" | "last-organizer";

export type RsvpAnswer = "yes" | "no" | "maybe";

export type Rsvp = { rehearsalId: string; memberId: string; date: string; answer: RsvpAnswer };

export type Store = {
  createGroup(
    name: string,
    organizerName: string,
    timeZone: string,
  ): { group: Group; organizer: NewMember };
  findGroup(id: string): Group | null;
  findGroupByInviteToken(token: string): Group | null;
  setShowNames(groupId: string, showNames: boolean): void;
  addMember(groupId: string, displayName: string, role: Role): NewMember;
  findMember(groupId: string, memberId: string): Member | null;
  findMemberByDevice(groupId: string, deviceToken: string): Member | null;
  listMembers(groupId: string): Member[];
  setOptional(groupId: string, memberId: string, optional: boolean): boolean;
  /** Refuses a change that would leave the group without an organizer. */
  setRole(groupId: string, memberId: string, role: Role): RoleChange;
  // Availability is always read and written through its owner: a slot id of
  // another member behaves exactly like an unknown one.
  listSlots(memberId: string): Slot[];
  findSlot(memberId: string, slotId: string): Slot | null;
  addSlot(memberId: string, input: SlotInput): Slot;
  updateSlot(memberId: string, slotId: string, input: SlotInput): Slot | null;
  deleteSlot(memberId: string, slotId: string): boolean;
  /** Skips or restores one date; false when the slot is unknown or does not meet that day. */
  setSkip(memberId: string, slotId: string, date: string, skipped: boolean): boolean;
  /** Every member's slots in the group, keyed by member id. */
  listGroupSlots(groupId: string): Map<string, Slot[]>;
  // Rehearsals belong to a group; an id from another group behaves as unknown.
  addRehearsal(groupId: string, input: SlotInput, location: string): Rehearsal;
  listRehearsals(groupId: string): Rehearsal[];
  findRehearsal(groupId: string, rehearsalId: string): Rehearsal | null;
  confirmRehearsal(groupId: string, rehearsalId: string): boolean;
  /** Sets a weekly rehearsal's last date, dropping cancellations after it; null if not applicable. */
  endRehearsal(groupId: string, rehearsalId: string, endDate: string): Rehearsal | null;
  /** Cancels or restores one date; false when the rehearsal is unknown or does not meet that day. */
  setCancelled(groupId: string, rehearsalId: string, date: string, cancelled: boolean): boolean;
  deleteRehearsal(groupId: string, rehearsalId: string): boolean;
  /**
   * Sets (or, with null, clears) a member's answer for one date of a rehearsal.
   * False when the rehearsal or member is not in the group, or the rehearsal
   * does not meet on that date (including cancelled dates).
   */
  setRsvp(
    groupId: string,
    rehearsalId: string,
    memberId: string,
    date: string,
    answer: RsvpAnswer | null,
  ): boolean;
  /** `setRsvp` for several dates at once, all or nothing. */
  setRsvps(
    groupId: string,
    rehearsalId: string,
    memberId: string,
    dates: string[],
    answer: RsvpAnswer | null,
  ): boolean;
  /** Every answer on the group's rehearsals. */
  listRsvps(groupId: string): Rsvp[];
  close(): void;
};

const DEFAULT_DATABASE = "data/music-chairs.sqlite";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** Schema version 1: the shape music-chairs had when it was first deployed (Phase 5). */
const BASELINE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    invite_token TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    time_zone TEXT NOT NULL,
    show_names INTEGER NOT NULL CHECK (show_names IN (0, 1)),
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id),
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('organizer', 'member')),
    optional INTEGER NOT NULL CHECK (optional IN (0, 1)),
    device_token TEXT NOT NULL UNIQUE,
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
  CREATE TABLE IF NOT EXISTS rehearsals (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id),
    kind TEXT NOT NULL CHECK (kind IN ('once', 'weekly')),
    start_date TEXT NOT NULL,
    end_date TEXT,
    start_minute INTEGER NOT NULL CHECK (start_minute % 30 = 0 AND start_minute >= 0),
    end_minute INTEGER NOT NULL CHECK (
      end_minute % 30 = 0 AND end_minute > start_minute AND end_minute <= 1440
    ),
    location TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('proposed', 'confirmed')),
    created_at TEXT NOT NULL,
    CHECK (end_date IS NULL OR (kind = 'weekly' AND end_date >= start_date))
  );
  CREATE INDEX IF NOT EXISTS rehearsals_by_group ON rehearsals (group_id);
  CREATE TABLE IF NOT EXISTS rehearsal_cancellations (
    rehearsal_id TEXT NOT NULL REFERENCES rehearsals(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    PRIMARY KEY (rehearsal_id, date)
  );
  CREATE TABLE IF NOT EXISTS rsvps (
    rehearsal_id TEXT NOT NULL REFERENCES rehearsals(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES members(id),
    date TEXT NOT NULL,
    answer TEXT NOT NULL CHECK (answer IN ('yes', 'no', 'maybe')),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (rehearsal_id, member_id, date)
  );
`;

/**
 * Ordered, forward-only schema migrations: entry i upgrades a database from
 * version i to i + 1, recorded in SQLite's `user_version`. The persisted schema
 * left greenfield on 2026-10-02 (policies/greenfield-until-released.md
 * § Amendments in force), so every later schema change is appended here with a
 * test that upgrades a database built at the previous version.
 */
export const MIGRATIONS: readonly string[] = [BASELINE_SCHEMA];

/**
 * Brings `db` up to the latest version in one transaction. Foreign keys are off
 * while migrations run, so a table rebuild cannot cascade-delete child rows,
 * and are checked before committing. A database newer than `migrations`
 * refuses to open.
 */
export function migrate(db: DatabaseSync, migrations: readonly string[] = MIGRATIONS): void {
  const current = (db.prepare("PRAGMA user_version").get() as { user_version: number })
    .user_version;
  if (current > migrations.length) {
    throw new Error(
      `The database's schema version (${current}) is newer than this version of ` +
        `music-chairs supports (${migrations.length}); deploy the newer code instead.`,
    );
  }
  if (current === migrations.length) return;
  db.exec("PRAGMA foreign_keys = OFF;");
  try {
    db.exec("BEGIN");
    let version = current;
    try {
      for (; version < migrations.length; version++) {
        db.exec(migrations[version]);
      }
      const violations = db.prepare("PRAGMA foreign_key_check").all();
      if (violations.length > 0) {
        throw new Error(`Migration left ${violations.length} broken foreign-key references.`);
      }
      db.exec(`PRAGMA user_version = ${migrations.length};`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      // The baseline only fails on tables from before schema versioning: openStore
      // treats that SQLite error as a stale database. A later step's failure becomes
      // a plain Error so it is never mistaken for one.
      if (version === 0) throw error;
      throw new Error(
        `Migrating the database from schema version ${current} to ${migrations.length} failed ` +
          `and was rolled back (${(error as Error).message}); the data is unchanged.`,
        { cause: error },
      );
    }
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

/** A new unguessable identifier: 16 random bytes, base64url (22 characters). */
function newToken(): string {
  return randomBytes(16).toString("base64url");
}

/** Whether a value has the shape of an identifier this store issues. */
export function isToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

type GroupRow = {
  id: string;
  invite_token: string;
  name: string;
  time_zone: string;
  show_names: number;
};
type MemberRow = {
  id: string;
  group_id: string;
  display_name: string;
  role: Role;
  optional: number;
};
type SlotRow = {
  id: string;
  kind: Slot["kind"];
  start_date: string;
  end_date: string | null;
  start_minute: number;
  end_minute: number;
};

function toGroup(row: GroupRow): Group {
  return {
    id: row.id,
    inviteToken: row.invite_token,
    name: row.name,
    timeZone: row.time_zone,
    showNames: row.show_names === 1,
  };
}

function toMember(row: MemberRow): Member {
  return {
    id: row.id,
    groupId: row.group_id,
    displayName: row.display_name,
    role: row.role,
    optional: row.optional === 1,
  };
}

/**
 * Opens (creating if needed) the SQLite database at `filename`; `:memory:` is
 * private to the store.
 *
 * The schema is brought up to date by `migrate`, whose failures propagate
 * unchanged. A database from before schema versioning (a development build
 * earlier than the first release) has tables `CREATE TABLE IF NOT EXISTS`
 * leaves as they were, so it fails when the statements are prepared. With
 * `resetIfStale` (local development) that file and its -wal/-shm files are
 * renamed to a timestamped backup and a fresh database is created; otherwise
 * opening refuses with a message saying what to do. Nothing is ever deleted.
 */
export function openStore(filename: string, options: { resetIfStale?: boolean } = {}): Store {
  if (filename !== ":memory:") {
    mkdirSync(dirname(resolve(filename)), { recursive: true });
  }
  const db = new DatabaseSync(filename);
  try {
    return buildStore(db, filename);
  } catch (error) {
    db.close();
    if ((error as { code?: unknown }).code !== "ERR_SQLITE_ERROR") throw error;
    const path = resolve(filename);
    const reason = (error as Error).message;
    if (options.resetIfStale && filename !== ":memory:") {
      const backup = `${path}.stale-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      for (const suffix of ["", "-wal", "-shm"]) {
        if (existsSync(path + suffix)) renameSync(path + suffix, backup + suffix);
      }
      console.warn(
        `music-chairs: ${path} was created by an earlier version (${reason}). ` +
          `Moved it to ${backup} and started a fresh database.`,
      );
      return openStore(filename);
    }
    throw new Error(
      `The database ${path} does not match this version of music-chairs (${reason}). ` +
        "It was probably created by a development build from before schema versioning, which " +
        "no migration reads: stop the server, move that file and its -wal and -shm files " +
        "aside, then start again.",
      { cause: error },
    );
  }
}

/** Migrates the schema and prepares every statement; throws if the file's tables differ. */
function buildStore(db: DatabaseSync, filename: string): Store {
  if (filename !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  migrate(db);
  db.exec("PRAGMA foreign_keys = ON;");

  const insertGroup = db.prepare(
    `INSERT INTO groups (id, invite_token, name, time_zone, show_names, created_at)
     VALUES (?, ?, ?, ?, 0, ?)`,
  );
  const insertMember = db.prepare(
    `INSERT INTO members (id, group_id, display_name, role, optional, device_token, joined_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
  );
  const groupColumns = "id, invite_token, name, time_zone, show_names";
  const selectGroup = db.prepare(`SELECT ${groupColumns} FROM groups WHERE id = ?`);
  const selectGroupByInvite = db.prepare(
    `SELECT ${groupColumns} FROM groups WHERE invite_token = ?`,
  );
  const changeShowNames = db.prepare("UPDATE groups SET show_names = ? WHERE id = ?");
  // Member reads never select the device token.
  const memberColumns = "id, group_id, display_name, role, optional";
  const selectMember = db.prepare(
    `SELECT ${memberColumns} FROM members WHERE group_id = ? AND id = ?`,
  );
  const selectMemberByDevice = db.prepare(
    `SELECT ${memberColumns} FROM members WHERE group_id = ? AND device_token = ?`,
  );
  const selectMembers = db.prepare(
    `SELECT ${memberColumns} FROM members WHERE group_id = ? ORDER BY joined_at, rowid`,
  );
  const changeOptional = db.prepare(
    "UPDATE members SET optional = ? WHERE group_id = ? AND id = ?",
  );
  const changeRole = db.prepare("UPDATE members SET role = ? WHERE group_id = ? AND id = ?");
  const countOrganizers = db.prepare(
    "SELECT COUNT(*) AS count FROM members WHERE group_id = ? AND role = 'organizer'",
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
  const selectGroupSlots = db.prepare(
    `SELECT availability.member_id, ${slotColumns
      .split(", ")
      .map((column) => `availability.${column}`)
      .join(", ")}
     FROM availability JOIN members ON members.id = availability.member_id
     WHERE members.group_id = ?
     ORDER BY availability.start_date, availability.start_minute, availability.created_at`,
  );

  const rehearsalColumns = `${slotColumns}, location, status`;
  const insertRehearsal = db.prepare(
    `INSERT INTO rehearsals
     (id, group_id, kind, start_date, end_date, start_minute, end_minute, location, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?)`,
  );
  const selectRehearsals = db.prepare(
    `SELECT ${rehearsalColumns} FROM rehearsals WHERE group_id = ?
     ORDER BY start_date, start_minute, created_at, rowid`,
  );
  const selectRehearsal = db.prepare(
    `SELECT ${rehearsalColumns} FROM rehearsals WHERE group_id = ? AND id = ?`,
  );
  const changeRehearsalStatus = db.prepare(
    "UPDATE rehearsals SET status = 'confirmed' WHERE group_id = ? AND id = ?",
  );
  const changeRehearsalEnd = db.prepare(
    "UPDATE rehearsals SET end_date = ? WHERE group_id = ? AND id = ?",
  );
  const removeRehearsal = db.prepare("DELETE FROM rehearsals WHERE group_id = ? AND id = ?");
  const selectCancellations = db.prepare(
    "SELECT date FROM rehearsal_cancellations WHERE rehearsal_id = ? ORDER BY date",
  );
  const insertCancellation = db.prepare(
    "INSERT OR IGNORE INTO rehearsal_cancellations (rehearsal_id, date) VALUES (?, ?)",
  );
  const removeCancellation = db.prepare(
    "DELETE FROM rehearsal_cancellations WHERE rehearsal_id = ? AND date = ?",
  );
  const upsertRsvp = db.prepare(
    `INSERT INTO rsvps (rehearsal_id, member_id, date, answer, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (rehearsal_id, member_id, date)
     DO UPDATE SET answer = excluded.answer, updated_at = excluded.updated_at`,
  );
  const removeRsvp = db.prepare(
    "DELETE FROM rsvps WHERE rehearsal_id = ? AND member_id = ? AND date = ?",
  );
  const removeRsvpsAfter = db.prepare("DELETE FROM rsvps WHERE rehearsal_id = ? AND date > ?");
  const selectGroupRsvps = db.prepare(
    `SELECT rsvps.rehearsal_id, rsvps.member_id, rsvps.date, rsvps.answer
     FROM rsvps JOIN rehearsals ON rehearsals.id = rsvps.rehearsal_id
     WHERE rehearsals.group_id = ?
     ORDER BY rsvps.date, rsvps.rehearsal_id`,
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

  type RehearsalRow = SlotRow & { location: string; status: RehearsalStatus };

  function toRehearsal(row: RehearsalRow): Rehearsal {
    return {
      id: row.id,
      kind: row.kind,
      startDate: row.start_date,
      endDate: row.end_date,
      startMinute: row.start_minute,
      endMinute: row.end_minute,
      location: row.location,
      status: row.status,
      skips: (selectCancellations.all(row.id) as { date: string }[]).map((item) => item.date),
    };
  }

  function findRehearsal(groupId: string, rehearsalId: string): Rehearsal | null {
    if (!isToken(rehearsalId)) return null;
    const row = selectRehearsal.get(groupId, rehearsalId) as RehearsalRow | undefined;
    return row ? toRehearsal(row) : null;
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

  /** Whether `memberId` may answer for `date` of the group's rehearsal. */
  function canAnswer(groupId: string, rehearsalId: string, memberId: string, date: string) {
    const rehearsal = findRehearsal(groupId, rehearsalId);
    if (!rehearsal || !isToken(memberId) || !selectMember.get(groupId, memberId)) return false;
    const meets =
      rehearsal.kind === "once" ? date === rehearsal.startDate : isOccurrence(rehearsal, date);
    return meets && !rehearsal.skips.includes(date);
  }

  function writeRsvp(
    rehearsalId: string,
    memberId: string,
    date: string,
    answer: RsvpAnswer | null,
  ) {
    if (answer === null) removeRsvp.run(rehearsalId, memberId, date);
    else upsertRsvp.run(rehearsalId, memberId, date, answer, new Date().toISOString());
  }

  function addMember(groupId: string, displayName: string, role: Role): NewMember {
    const member: NewMember = {
      id: newToken(),
      groupId,
      displayName,
      role,
      optional: false,
      deviceToken: newToken(),
    };
    insertMember.run(
      member.id,
      groupId,
      displayName,
      role,
      member.deviceToken,
      new Date().toISOString(),
    );
    return member;
  }

  return {
    createGroup(name, organizerName, timeZone) {
      const group: Group = {
        id: newToken(),
        inviteToken: newToken(),
        name,
        timeZone,
        showNames: false,
      };
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
    setShowNames(groupId, showNames) {
      changeShowNames.run(showNames ? 1 : 0, groupId);
    },
    addMember,
    findMember(groupId, memberId) {
      if (!isToken(memberId)) return null;
      const row = selectMember.get(groupId, memberId) as MemberRow | undefined;
      return row ? toMember(row) : null;
    },
    findMemberByDevice(groupId, deviceToken) {
      if (!isToken(deviceToken)) return null;
      const row = selectMemberByDevice.get(groupId, deviceToken) as MemberRow | undefined;
      return row ? toMember(row) : null;
    },
    listMembers(groupId) {
      return (selectMembers.all(groupId) as MemberRow[]).map(toMember);
    },
    setOptional(groupId, memberId, optional) {
      if (!isToken(memberId)) return false;
      return Number(changeOptional.run(optional ? 1 : 0, groupId, memberId).changes) > 0;
    },
    setRole(groupId, memberId, role) {
      if (!isToken(memberId)) return "unknown";
      return transaction(() => {
        const row = selectMember.get(groupId, memberId) as MemberRow | undefined;
        if (!row) return "unknown";
        const organizers = (countOrganizers.get(groupId) as { count: number }).count;
        if (row.role === "organizer" && role === "member" && organizers <= 1) {
          return "last-organizer";
        }
        changeRole.run(role, groupId, memberId);
        return "changed";
      });
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
    listGroupSlots(groupId) {
      const slots = new Map<string, Slot[]>();
      for (const row of selectGroupSlots.all(groupId) as (SlotRow & { member_id: string })[]) {
        const list = slots.get(row.member_id) ?? [];
        list.push(toSlot(row));
        slots.set(row.member_id, list);
      }
      return slots;
    },
    addRehearsal(groupId, input, location) {
      const id = newToken();
      insertRehearsal.run(
        id,
        groupId,
        input.kind,
        input.startDate,
        input.endDate,
        input.startMinute,
        input.endMinute,
        location,
        new Date().toISOString(),
      );
      return { ...input, id, location, status: "proposed", skips: [] };
    },
    listRehearsals(groupId) {
      return (selectRehearsals.all(groupId) as RehearsalRow[]).map(toRehearsal);
    },
    findRehearsal,
    confirmRehearsal(groupId, rehearsalId) {
      if (!isToken(rehearsalId)) return false;
      return Number(changeRehearsalStatus.run(groupId, rehearsalId).changes) > 0;
    },
    endRehearsal(groupId, rehearsalId, endDate) {
      const existing = findRehearsal(groupId, rehearsalId);
      if (!existing || existing.kind !== "weekly" || endDate < existing.startDate) return null;
      return transaction(() => {
        changeRehearsalEnd.run(endDate, groupId, rehearsalId);
        // Cancellations and answers after the new last date no longer mean anything.
        for (const date of existing.skips) {
          if (date > endDate) removeCancellation.run(rehearsalId, date);
        }
        removeRsvpsAfter.run(rehearsalId, endDate);
        return findRehearsal(groupId, rehearsalId);
      });
    },
    setCancelled(groupId, rehearsalId, date, cancelled) {
      const rehearsal = findRehearsal(groupId, rehearsalId);
      if (!rehearsal || !isOccurrence(rehearsal, date)) return false;
      if (cancelled) insertCancellation.run(rehearsalId, date);
      else removeCancellation.run(rehearsalId, date);
      return true;
    },
    deleteRehearsal(groupId, rehearsalId) {
      if (!isToken(rehearsalId)) return false;
      return Number(removeRehearsal.run(groupId, rehearsalId).changes) > 0;
    },
    setRsvp(groupId, rehearsalId, memberId, date, answer) {
      if (!canAnswer(groupId, rehearsalId, memberId, date)) return false;
      writeRsvp(rehearsalId, memberId, date, answer);
      return true;
    },
    setRsvps(groupId, rehearsalId, memberId, dates, answer) {
      if (dates.length === 0) return false;
      if (!dates.every((date) => canAnswer(groupId, rehearsalId, memberId, date))) return false;
      transaction(() => {
        for (const date of dates) writeRsvp(rehearsalId, memberId, date, answer);
      });
      return true;
    },
    listRsvps(groupId) {
      return (
        selectGroupRsvps.all(groupId) as {
          rehearsal_id: string;
          member_id: string;
          date: string;
          answer: RsvpAnswer;
        }[]
      ).map((row) => ({
        rehearsalId: row.rehearsal_id,
        memberId: row.member_id,
        date: row.date,
        answer: row.answer,
      }));
    },
    close() {
      db.close();
    },
  };
}

let shared: Store | undefined;

/**
 * The process-wide store for `MUSIC_CHAIRS_DB` (default `data/music-chairs.sqlite`),
 * opened on first use. Outside production a database from an earlier version is
 * backed up and replaced; a production server refuses it instead, because a
 * silent reset there would hide real data.
 */
export function getStore(): Store {
  shared ??= openStore(process.env.MUSIC_CHAIRS_DB || DEFAULT_DATABASE, {
    resetIfStale: process.env.NODE_ENV !== "production",
  });
  return shared;
}
