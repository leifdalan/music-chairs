import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { isOccurrence, type Slot, type SlotInput } from "~/lib/availability";
import type { TimeWindow } from "~/lib/requests";

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
  /**
   * The email of the Google account linked to this member, or null for a
   * name-only member. Pages show it only to the member and the group's organizers.
   */
  googleEmail: string | null;
  /** Whether this member's confirmed rehearsals are written to their Google Calendar. */
  calendarSync: boolean;
};

/**
 * A member as first created, with the device token that identifies their
 * device. The token is the only bearer secret: it is never read back by any
 * other store function and must never reach page data.
 */
export type NewMember = Member & { deviceToken: string };

/** A Google account, identified by Google's stable `sub` (never by email). */
export type Account = { id: string; email: string; name: string };

/** The identity Google reports for a signed-in user. */
export type GoogleProfile = { sub: string; email: string; name: string };

/**
 * `linked`: the member now belongs to the account (or already did).
 * `account-taken`: the account is already another member of that group.
 * `other-account`: the member is linked to a different account.
 */
export type LinkResult = "linked" | "account-taken" | "other-account" | "unknown";

/** A member's Google Calendar permission: the refresh token and the scopes granted so far. */
export type GoogleGrant = { accountId: string; refreshToken: string; scopes: string[] };

/** A member whose rehearsals are written to Google, with the account whose grant is used. */
export type SyncingMember = { memberId: string; groupId: string; accountId: string };

/** One event the app wrote to a member's Google Calendar. */
export type CalendarEvent = { rehearsalId: string; date: string; eventId: string };

/** An app-written Google Calendar event whose member or group is gone. */
export type EventRemoval = { accountId: string; eventId: string };

export type MemberRemoval = "removed" | "unknown" | "last-organizer";

/** What an organizer asks for: a named date span and the times of day it covers. */
export type RequestInput = {
  name: string;
  startDate: string;
  endDate: string;
  windows: TimeWindow[];
};

/** A scheduling request (plan/phase-9.md). Several can be open in a group at once. */
export type ScheduleRequest = RequestInput & {
  id: string;
  groupId: string;
  open: boolean;
  answerCount: number;
  createdAt: string;
};

/** A member's answer: when they sent it and their limit (null: any and all). */
export type RequestAnswer = { memberId: string; answeredAt: string; limit: number | null };

/** A session expires this many days after it was last used. */
export const SESSION_DAYS = 90;

export type RehearsalStatus = "proposed" | "confirmed";

/** A rehearsal reuses the availability slot shape; `skips` are its cancelled dates. */
export type Rehearsal = Slot & { location: string; status: RehearsalStatus };

export type RoleChange = "changed" | "unknown" | "last-organizer";

export type RsvpAnswer = "yes" | "no" | "maybe";

export type Rsvp = { rehearsalId: string; memberId: string; date: string; answer: RsvpAnswer };

export type Store = {
  /** With `accountId`, the organizer is linked to that Google account. */
  createGroup(
    name: string,
    organizerName: string,
    timeZone: string,
    accountId?: string | null,
  ): { group: Group; organizer: NewMember };
  findGroup(id: string): Group | null;
  findGroupByInviteToken(token: string): Group | null;
  setShowNames(groupId: string, showNames: boolean): void;
  /** Renames the group and sets its time zone; false for an unknown group. */
  updateGroup(groupId: string, changes: { name: string; timeZone: string }): boolean;
  /**
   * Deletes the group and everything in it, queueing every Google Calendar
   * event the app wrote for its members for removal. Accounts, sessions and
   * Google grants stay. False for an unknown group.
   */
  deleteGroup(groupId: string): boolean;
  addMember(groupId: string, displayName: string, role: Role, accountId?: string | null): NewMember;
  findMember(groupId: string, memberId: string): Member | null;
  findMemberByDevice(groupId: string, deviceToken: string): Member | null;
  listMembers(groupId: string): Member[];
  setOptional(groupId: string, memberId: string, optional: boolean): boolean;
  /** Refuses a change that would leave the group without an organizer. */
  setRole(groupId: string, memberId: string, role: Role): RoleChange;
  renameMember(groupId: string, memberId: string, displayName: string): boolean;
  /**
   * Deletes a member and their availability, answers and RSVPs, queueing the
   * Google Calendar events the app wrote for them for removal. The group's
   * last organizer cannot be removed.
   */
  removeMember(groupId: string, memberId: string): MemberRemoval;
  // Availability is always read and written through its owner: a slot id of
  // another member behaves exactly like an unknown one.
  listSlots(memberId: string): Slot[];
  findSlot(memberId: string, slotId: string): Slot | null;
  addSlot(memberId: string, input: SlotInput): Slot;
  /** Several times at once, all or none. */
  addSlots(memberId: string, inputs: SlotInput[]): Slot[];
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
  /** Creates the account for a Google identity, or refreshes its email and name. */
  upsertAccount(profile: GoogleProfile): Account;
  /** A new session for the account; returns the bearer token (only its hash is stored). */
  createSession(accountId: string, now?: Date): string;
  /**
   * The account a session token belongs to, or null when unknown or expired
   * (an expired session is deleted). A use more than a day after the last
   * renewal extends the session to `SESSION_DAYS` from now.
   */
  findSession(token: string, now?: Date): Account | null;
  deleteSession(token: string): void;
  findMemberByAccount(groupId: string, accountId: string): Member | null;
  /** Links a member to an account; a Google account is at most one member per group. */
  linkMember(groupId: string, memberId: string, accountId: string): LinkResult;
  /** Every group the account is a member of, with that member, by group name. */
  listAccountMemberships(accountId: string): { group: Group; member: Member }[];
  findAccountBySub(sub: string): Account | null;
  /**
   * Records a Google Calendar grant: scopes are added to those already granted,
   * and a missing refresh token keeps the stored one. Null when there is no
   * refresh token to keep.
   */
  saveGrant(accountId: string, refreshToken: string | null, scopes: string[]): GoogleGrant | null;
  findGrant(accountId: string): GoogleGrant | null;
  /** Deletes the grant; with `refreshToken`, only if it still holds that token. */
  deleteGrant(accountId: string, refreshToken?: string): void;
  setCalendarSync(groupId: string, memberId: string, on: boolean): boolean;
  /**
   * Members with Google writing on, or with events the app wrote that may still
   * need removing (in one group, or everywhere), with their linked account.
   */
  listSyncingMembers(groupId?: string): SyncingMember[];
  /** The member's private calendar feed token, created on first use. */
  feedTokenFor(memberId: string): string;
  findMemberByFeed(token: string): Member | null;
  listCalendarEvents(memberId: string): CalendarEvent[];
  recordCalendarEvent(memberId: string, event: CalendarEvent): void;
  forgetCalendarEvent(memberId: string, rehearsalId: string, date: string): void;
  addEventRemoval(removal: EventRemoval): void;
  listEventRemovals(): EventRemoval[];
  forgetEventRemoval(removal: EventRemoval): void;
  /** Drops every pending removal for an account whose Google access was revoked. */
  forgetEventRemovalsFor(accountId: string): void;
  createRequest(groupId: string, input: RequestInput): ScheduleRequest;
  /** Replaces name, span and windows; false for an unknown or closed request. */
  updateRequest(groupId: string, requestId: string, input: RequestInput): boolean;
  setRequestOpen(groupId: string, requestId: string, open: boolean): boolean;
  /** The group's requests, newest first. */
  listRequests(groupId: string): ScheduleRequest[];
  /** An id from another group behaves as unknown. */
  findRequest(groupId: string, requestId: string): ScheduleRequest | null;
  /**
   * Records (or updates) a member's answer and limit. False for an unknown or
   * closed request, or a member who is not in the group.
   */
  answerRequest(
    groupId: string,
    requestId: string,
    memberId: string,
    limit: number | null,
    now?: Date,
  ): boolean;
  listAnswers(groupId: string, requestId: string): RequestAnswer[];
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
export const MIGRATIONS: readonly string[] = [
  BASELINE_SCHEMA,
  // Version 2 (Phase 6): Google accounts, sessions, and members linked to accounts.
  `
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    google_sub TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  ALTER TABLE members ADD COLUMN account_id TEXT REFERENCES accounts(id);
  CREATE UNIQUE INDEX members_by_account ON members (group_id, account_id)
    WHERE account_id IS NOT NULL;
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    expires_at TEXT NOT NULL,
    renewed_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX sessions_by_account ON sessions (account_id);
  `,
  // Version 3 (Phase 7): Google Calendar grants, the per-group calendar switch,
  // private feed tokens, and the events written to members' calendars. The
  // event map has no foreign key to rehearsals so a deleted rehearsal's events
  // can still be found and removed.
  `
  CREATE TABLE google_tokens (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id),
    refresh_token TEXT NOT NULL,
    scopes TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  ALTER TABLE members ADD COLUMN calendar_sync INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE members ADD COLUMN feed_token TEXT;
  CREATE UNIQUE INDEX members_by_feed ON members (feed_token) WHERE feed_token IS NOT NULL;
  CREATE TABLE calendar_events (
    member_id TEXT NOT NULL REFERENCES members(id),
    rehearsal_id TEXT NOT NULL,
    date TEXT NOT NULL,
    event_id TEXT NOT NULL,
    PRIMARY KEY (member_id, rehearsal_id, date)
  );
  `,
  // Version 4 (Phase 8): times move to a 15-minute grid. SQLite cannot change a
  // CHECK constraint, so both tables are rebuilt with explicit column lists;
  // migrate() runs with foreign keys off, so their child rows are kept.
  `
  CREATE TABLE availability_v4 (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES members(id),
    kind TEXT NOT NULL CHECK (kind IN ('once', 'weekly')),
    start_date TEXT NOT NULL,
    end_date TEXT,
    start_minute INTEGER NOT NULL CHECK (start_minute % 15 = 0 AND start_minute >= 0),
    end_minute INTEGER NOT NULL CHECK (
      end_minute % 15 = 0 AND end_minute > start_minute AND end_minute <= 1440
    ),
    created_at TEXT NOT NULL,
    CHECK (end_date IS NULL OR (kind = 'weekly' AND end_date >= start_date))
  );
  INSERT INTO availability_v4
    (id, member_id, kind, start_date, end_date, start_minute, end_minute, created_at)
    SELECT id, member_id, kind, start_date, end_date, start_minute, end_minute, created_at
    FROM availability;
  DROP TABLE availability;
  ALTER TABLE availability_v4 RENAME TO availability;
  CREATE INDEX availability_by_member ON availability (member_id);
  CREATE TABLE rehearsals_v4 (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id),
    kind TEXT NOT NULL CHECK (kind IN ('once', 'weekly')),
    start_date TEXT NOT NULL,
    end_date TEXT,
    start_minute INTEGER NOT NULL CHECK (start_minute % 15 = 0 AND start_minute >= 0),
    end_minute INTEGER NOT NULL CHECK (
      end_minute % 15 = 0 AND end_minute > start_minute AND end_minute <= 1440
    ),
    location TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('proposed', 'confirmed')),
    created_at TEXT NOT NULL,
    CHECK (end_date IS NULL OR (kind = 'weekly' AND end_date >= start_date))
  );
  INSERT INTO rehearsals_v4
    (id, group_id, kind, start_date, end_date, start_minute, end_minute, location, status,
     created_at)
    SELECT id, group_id, kind, start_date, end_date, start_minute, end_minute, location, status,
      created_at
    FROM rehearsals;
  DROP TABLE rehearsals;
  ALTER TABLE rehearsals_v4 RENAME TO rehearsals;
  CREATE INDEX rehearsals_by_group ON rehearsals (group_id);
  `,
  // Version 5 (Phase 9): scheduling requests, their time windows, and answers.
  // Requests are closed, never deleted, so they can be repeated later.
  `
  CREATE TABLE requests (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id),
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL CHECK (end_date >= start_date),
    open INTEGER NOT NULL CHECK (open IN (0, 1)),
    created_at TEXT NOT NULL
  );
  CREATE INDEX requests_by_group ON requests (group_id);
  CREATE TABLE request_windows (
    request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    start_minute INTEGER NOT NULL CHECK (start_minute % 15 = 0 AND start_minute >= 0),
    end_minute INTEGER NOT NULL CHECK (
      end_minute % 15 = 0 AND end_minute > start_minute AND end_minute <= 1440
    ),
    PRIMARY KEY (request_id, start_minute, end_minute)
  );
  CREATE TABLE request_answers (
    request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES members(id),
    answered_at TEXT NOT NULL,
    limit_count INTEGER CHECK (limit_count IS NULL OR (limit_count BETWEEN 1 AND 99)),
    PRIMARY KEY (request_id, member_id)
  );
  `,
  // Version 6 (Phase 11): Google Calendar events still to be removed after the
  // member or group that owned them was deleted; retried until Google confirms.
  `
  CREATE TABLE calendar_event_removals (
    account_id TEXT NOT NULL REFERENCES accounts(id),
    event_id TEXT NOT NULL,
    PRIMARY KEY (account_id, event_id)
  );
  `,
];

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
  google_email: string | null;
  calendar_sync: number;
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
    googleEmail: row.google_email,
    calendarSync: row.calendar_sync === 1,
  };
}

/** Sessions are stored by hash, so a copy of the database cannot be replayed as a login. */
function sessionHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const DAY_MS = 24 * 60 * 60 * 1000;

type GrantRow = { account_id: string; refresh_token: string; scopes: string };

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
    `INSERT INTO members
     (id, group_id, display_name, role, optional, device_token, joined_at, account_id)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
  );
  const groupColumns = "id, invite_token, name, time_zone, show_names";
  const selectGroup = db.prepare(`SELECT ${groupColumns} FROM groups WHERE id = ?`);
  const selectGroupByInvite = db.prepare(
    `SELECT ${groupColumns} FROM groups WHERE invite_token = ?`,
  );
  const changeShowNames = db.prepare("UPDATE groups SET show_names = ? WHERE id = ?");
  const changeGroup = db.prepare("UPDATE groups SET name = ?, time_zone = ? WHERE id = ?");
  const changeDisplayName = db.prepare(
    "UPDATE members SET display_name = ? WHERE group_id = ? AND id = ?",
  );
  // Deleting a member or a group: every row that refers to them, children first.
  // Skips, windows, answers, cancellations and RSVPs of deleted parents cascade.
  const queueMemberRemovals = db.prepare(
    `INSERT OR IGNORE INTO calendar_event_removals (account_id, event_id)
     SELECT members.account_id, calendar_events.event_id
     FROM calendar_events JOIN members ON members.id = calendar_events.member_id
     WHERE members.id = ? AND members.account_id IS NOT NULL`,
  );
  const queueGroupRemovals = db.prepare(
    `INSERT OR IGNORE INTO calendar_event_removals (account_id, event_id)
     SELECT members.account_id, calendar_events.event_id
     FROM calendar_events JOIN members ON members.id = calendar_events.member_id
     WHERE members.group_id = ? AND members.account_id IS NOT NULL`,
  );
  const deleteMemberRows = [
    "DELETE FROM calendar_events WHERE member_id = ?",
    "DELETE FROM rsvps WHERE member_id = ?",
    "DELETE FROM request_answers WHERE member_id = ?",
    "DELETE FROM availability WHERE member_id = ?",
    "DELETE FROM members WHERE id = ?",
  ].map((sql) => db.prepare(sql));
  const inGroup = "SELECT id FROM members WHERE group_id = ?";
  const deleteGroupRows = [
    `DELETE FROM calendar_events WHERE member_id IN (${inGroup})`,
    "DELETE FROM requests WHERE group_id = ?",
    "DELETE FROM rehearsals WHERE group_id = ?",
    `DELETE FROM availability WHERE member_id IN (${inGroup})`,
    "DELETE FROM members WHERE group_id = ?",
    "DELETE FROM groups WHERE id = ?",
  ].map((sql) => db.prepare(sql));
  const insertRemoval = db.prepare(
    "INSERT OR IGNORE INTO calendar_event_removals (account_id, event_id) VALUES (?, ?)",
  );
  const selectRemovals = db.prepare(
    "SELECT account_id, event_id FROM calendar_event_removals ORDER BY account_id, event_id",
  );
  const removeRemoval = db.prepare(
    "DELETE FROM calendar_event_removals WHERE account_id = ? AND event_id = ?",
  );
  const removeAccountRemovals = db.prepare(
    "DELETE FROM calendar_event_removals WHERE account_id = ?",
  );
  // Member reads never select the device token.
  const memberSelect = `SELECT members.id, members.group_id, members.display_name, members.role,
      members.optional, members.calendar_sync, accounts.email AS google_email
    FROM members LEFT JOIN accounts ON accounts.id = members.account_id`;
  const selectMember = db.prepare(`${memberSelect} WHERE members.group_id = ? AND members.id = ?`);
  const selectMemberByDevice = db.prepare(
    `${memberSelect} WHERE members.group_id = ? AND members.device_token = ?`,
  );
  const selectMemberByAccount = db.prepare(
    `${memberSelect} WHERE members.group_id = ? AND members.account_id = ?`,
  );
  const selectMembers = db.prepare(
    `${memberSelect} WHERE members.group_id = ? ORDER BY members.joined_at, members.rowid`,
  );
  const selectMemberAccount = db.prepare(
    "SELECT account_id FROM members WHERE group_id = ? AND id = ?",
  );
  const changeMemberAccount = db.prepare(
    "UPDATE members SET account_id = ? WHERE group_id = ? AND id = ?",
  );
  const selectAccountMemberships = db.prepare(
    `SELECT groups.id AS g_id, groups.invite_token, groups.name, groups.time_zone,
       groups.show_names, members.id, members.group_id, members.display_name, members.role,
       members.optional, members.calendar_sync, accounts.email AS google_email
     FROM members
     JOIN groups ON groups.id = members.group_id
     JOIN accounts ON accounts.id = members.account_id
     WHERE members.account_id = ?
     ORDER BY groups.name, groups.created_at`,
  );
  const upsertAccountRow = db.prepare(
    `INSERT INTO accounts (id, google_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (google_sub) DO UPDATE SET email = excluded.email, name = excluded.name
     RETURNING id, email, name`,
  );
  const insertSession = db.prepare(
    `INSERT INTO sessions (token_hash, account_id, expires_at, renewed_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const selectSession = db.prepare(
    `SELECT sessions.expires_at, sessions.renewed_at, accounts.id, accounts.email, accounts.name
     FROM sessions JOIN accounts ON accounts.id = sessions.account_id
     WHERE sessions.token_hash = ?`,
  );
  const renewSession = db.prepare(
    "UPDATE sessions SET expires_at = ?, renewed_at = ? WHERE token_hash = ?",
  );
  const removeSession = db.prepare("DELETE FROM sessions WHERE token_hash = ?");
  const selectAccountBySub = db.prepare(
    "SELECT id, email, name FROM accounts WHERE google_sub = ?",
  );
  const selectGrant = db.prepare(
    "SELECT account_id, refresh_token, scopes FROM google_tokens WHERE account_id = ?",
  );
  const upsertGrant = db.prepare(
    `INSERT INTO google_tokens (account_id, refresh_token, scopes, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (account_id) DO UPDATE SET refresh_token = excluded.refresh_token,
       scopes = excluded.scopes, updated_at = excluded.updated_at`,
  );
  const removeGrant = db.prepare(
    "DELETE FROM google_tokens WHERE account_id = ? AND (? IS NULL OR refresh_token = ?)",
  );
  const changeCalendarSync = db.prepare(
    "UPDATE members SET calendar_sync = ? WHERE group_id = ? AND id = ?",
  );
  const selectSyncing = db.prepare(
    `SELECT id AS member_id, group_id, account_id FROM members
     WHERE account_id IS NOT NULL AND (? IS NULL OR group_id = ?)
       AND (calendar_sync = 1 OR EXISTS (SELECT 1 FROM calendar_events WHERE member_id = members.id))
     ORDER BY group_id, joined_at`,
  );
  const selectFeedToken = db.prepare("SELECT feed_token FROM members WHERE id = ?");
  const changeFeedToken = db.prepare(
    "UPDATE members SET feed_token = ? WHERE id = ? AND feed_token IS NULL",
  );
  const selectMemberByFeed = db.prepare(`${memberSelect} WHERE members.feed_token = ?`);
  const selectCalendarEvents = db.prepare(
    `SELECT rehearsal_id, date, event_id FROM calendar_events WHERE member_id = ?
     ORDER BY date, rehearsal_id`,
  );
  const upsertCalendarEvent = db.prepare(
    `INSERT INTO calendar_events (member_id, rehearsal_id, date, event_id) VALUES (?, ?, ?, ?)
     ON CONFLICT (member_id, rehearsal_id, date) DO UPDATE SET event_id = excluded.event_id`,
  );
  const removeCalendarEvent = db.prepare(
    "DELETE FROM calendar_events WHERE member_id = ? AND rehearsal_id = ? AND date = ?",
  );
  const requestSelect = `SELECT requests.id, requests.group_id, requests.name, requests.start_date,
      requests.end_date, requests.open, requests.created_at,
      (SELECT COUNT(*) FROM request_answers WHERE request_id = requests.id) AS answer_count
    FROM requests`;
  const selectRequests = db.prepare(
    `${requestSelect} WHERE requests.group_id = ? ORDER BY requests.created_at DESC, requests.rowid DESC`,
  );
  const selectRequest = db.prepare(
    `${requestSelect} WHERE requests.group_id = ? AND requests.id = ?`,
  );
  const selectWindows = db.prepare(
    `SELECT start_minute, end_minute FROM request_windows WHERE request_id = ?
     ORDER BY start_minute, end_minute`,
  );
  const insertRequest = db.prepare(
    `INSERT INTO requests (id, group_id, name, start_date, end_date, open, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
  );
  const changeRequest = db.prepare(
    "UPDATE requests SET name = ?, start_date = ?, end_date = ? WHERE group_id = ? AND id = ?",
  );
  const changeRequestOpen = db.prepare(
    "UPDATE requests SET open = ? WHERE group_id = ? AND id = ?",
  );
  const insertWindow = db.prepare(
    "INSERT OR IGNORE INTO request_windows (request_id, start_minute, end_minute) VALUES (?, ?, ?)",
  );
  const removeWindows = db.prepare("DELETE FROM request_windows WHERE request_id = ?");
  const upsertAnswer = db.prepare(
    `INSERT INTO request_answers (request_id, member_id, answered_at, limit_count) VALUES (?, ?, ?, ?)
     ON CONFLICT (request_id, member_id)
     DO UPDATE SET answered_at = excluded.answered_at, limit_count = excluded.limit_count`,
  );
  const selectAnswers = db.prepare(
    `SELECT request_answers.member_id, request_answers.answered_at, request_answers.limit_count
     FROM request_answers JOIN members ON members.id = request_answers.member_id
     WHERE request_answers.request_id = ? ORDER BY members.joined_at, members.rowid`,
  );

  type RequestRow = {
    id: string;
    group_id: string;
    name: string;
    start_date: string;
    end_date: string;
    open: number;
    created_at: string;
    answer_count: number;
  };

  function toRequest(row: RequestRow): ScheduleRequest {
    return {
      id: row.id,
      groupId: row.group_id,
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date,
      open: row.open === 1,
      createdAt: row.created_at,
      answerCount: row.answer_count,
      windows: (selectWindows.all(row.id) as { start_minute: number; end_minute: number }[]).map(
        (window) => ({ startMinute: window.start_minute, endMinute: window.end_minute }),
      ),
    };
  }

  function findRequest(groupId: string, requestId: string): ScheduleRequest | null {
    if (!isToken(requestId)) return null;
    const row = selectRequest.get(groupId, requestId) as RequestRow | undefined;
    return row ? toRequest(row) : null;
  }

  function writeWindows(requestId: string, windows: TimeWindow[]): void {
    removeWindows.run(requestId);
    for (const window of windows) insertWindow.run(requestId, window.startMinute, window.endMinute);
  }
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

  function addSlot(memberId: string, input: SlotInput): Slot {
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

  function addMember(
    groupId: string,
    displayName: string,
    role: Role,
    accountId: string | null = null,
  ): NewMember {
    const member: NewMember = {
      id: newToken(),
      groupId,
      displayName,
      role,
      optional: false,
      googleEmail: null,
      calendarSync: false,
      deviceToken: newToken(),
    };
    insertMember.run(
      member.id,
      groupId,
      displayName,
      role,
      member.deviceToken,
      new Date().toISOString(),
      accountId,
    );
    if (accountId) {
      const row = selectMember.get(groupId, member.id) as MemberRow;
      member.googleEmail = row.google_email;
    }
    return member;
  }

  return {
    createGroup(name, organizerName, timeZone, accountId = null) {
      const group: Group = {
        id: newToken(),
        inviteToken: newToken(),
        name,
        timeZone,
        showNames: false,
      };
      return transaction(() => {
        insertGroup.run(group.id, group.inviteToken, name, timeZone, new Date().toISOString());
        const organizer = addMember(group.id, organizerName, "organizer", accountId);
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
    updateGroup(groupId, changes) {
      if (!isToken(groupId)) return false;
      return Number(changeGroup.run(changes.name, changes.timeZone, groupId).changes) > 0;
    },
    deleteGroup(groupId) {
      if (!isToken(groupId) || !selectGroup.get(groupId)) return false;
      transaction(() => {
        queueGroupRemovals.run(groupId);
        for (const statement of deleteGroupRows) statement.run(groupId);
      });
      return true;
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
    renameMember(groupId, memberId, displayName) {
      if (!isToken(memberId)) return false;
      return Number(changeDisplayName.run(displayName, groupId, memberId).changes) > 0;
    },
    removeMember(groupId, memberId) {
      if (!isToken(memberId)) return "unknown";
      return transaction(() => {
        const row = selectMember.get(groupId, memberId) as MemberRow | undefined;
        if (!row) return "unknown";
        const organizers = (countOrganizers.get(groupId) as { count: number }).count;
        if (row.role === "organizer" && organizers <= 1) return "last-organizer";
        queueMemberRemovals.run(memberId);
        for (const statement of deleteMemberRows) statement.run(memberId);
        return "removed";
      });
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
    addSlot,
    addSlots(memberId, inputs) {
      return transaction(() => inputs.map((input) => addSlot(memberId, input)));
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
    upsertAccount(profile) {
      return upsertAccountRow.get(
        newToken(),
        profile.sub,
        profile.email,
        profile.name,
        new Date().toISOString(),
      ) as Account;
    },
    createSession(accountId, now = new Date()) {
      const token = newToken();
      const at = now.toISOString();
      const expires = new Date(now.getTime() + SESSION_DAYS * DAY_MS).toISOString();
      insertSession.run(sessionHash(token), accountId, expires, at, at);
      return token;
    },
    findSession(token, now = new Date()) {
      if (!isToken(token)) return null;
      const hash = sessionHash(token);
      const row = selectSession.get(hash) as
        (Account & { expires_at: string; renewed_at: string }) | undefined;
      if (!row) return null;
      if (Date.parse(row.expires_at) <= now.getTime()) {
        removeSession.run(hash);
        return null;
      }
      if (now.getTime() - Date.parse(row.renewed_at) > DAY_MS) {
        const expires = new Date(now.getTime() + SESSION_DAYS * DAY_MS).toISOString();
        renewSession.run(expires, now.toISOString(), hash);
      }
      return { id: row.id, email: row.email, name: row.name };
    },
    deleteSession(token) {
      if (isToken(token)) removeSession.run(sessionHash(token));
    },
    findMemberByAccount(groupId, accountId) {
      if (!isToken(accountId)) return null;
      const row = selectMemberByAccount.get(groupId, accountId) as MemberRow | undefined;
      return row ? toMember(row) : null;
    },
    linkMember(groupId, memberId, accountId) {
      if (!isToken(memberId) || !isToken(accountId)) return "unknown";
      return transaction(() => {
        const row = selectMemberAccount.get(groupId, memberId) as
          { account_id: string | null } | undefined;
        if (!row) return "unknown";
        if (row.account_id === accountId) return "linked";
        if (row.account_id) return "other-account";
        if (selectMemberByAccount.get(groupId, accountId)) return "account-taken";
        changeMemberAccount.run(accountId, groupId, memberId);
        return "linked";
      });
    },
    listAccountMemberships(accountId) {
      type Row = MemberRow & Omit<GroupRow, "id"> & { g_id: string };
      return (selectAccountMemberships.all(accountId) as Row[]).map((row) => ({
        group: toGroup({ ...row, id: row.g_id }),
        member: toMember(row),
      }));
    },
    findAccountBySub(sub) {
      return (selectAccountBySub.get(sub) as Account | undefined) ?? null;
    },
    saveGrant(accountId, refreshToken, scopes) {
      return transaction(() => {
        const row = selectGrant.get(accountId) as GrantRow | undefined;
        const token = refreshToken ?? row?.refresh_token;
        if (!token) return null;
        const merged = [...new Set([...(row ? row.scopes.split(" ") : []), ...scopes])]
          .filter(Boolean)
          .sort();
        upsertGrant.run(accountId, token, merged.join(" "), new Date().toISOString());
        return { accountId, refreshToken: token, scopes: merged };
      });
    },
    findGrant(accountId) {
      const row = selectGrant.get(accountId) as GrantRow | undefined;
      return row
        ? { accountId, refreshToken: row.refresh_token, scopes: row.scopes.split(" ") }
        : null;
    },
    deleteGrant(accountId, refreshToken) {
      const token = refreshToken ?? null;
      removeGrant.run(accountId, token, token);
    },
    setCalendarSync(groupId, memberId, on) {
      if (!isToken(memberId)) return false;
      return Number(changeCalendarSync.run(on ? 1 : 0, groupId, memberId).changes) > 0;
    },
    listSyncingMembers(groupId) {
      const scope = groupId ?? null;
      return (
        selectSyncing.all(scope, scope) as {
          member_id: string;
          group_id: string;
          account_id: string;
        }[]
      ).map((row) => ({
        memberId: row.member_id,
        groupId: row.group_id,
        accountId: row.account_id,
      }));
    },
    feedTokenFor(memberId) {
      const existing = (selectFeedToken.get(memberId) as { feed_token: string | null } | undefined)
        ?.feed_token;
      if (existing) return existing;
      changeFeedToken.run(newToken(), memberId);
      return (selectFeedToken.get(memberId) as { feed_token: string }).feed_token;
    },
    findMemberByFeed(token) {
      if (!isToken(token)) return null;
      const row = selectMemberByFeed.get(token) as MemberRow | undefined;
      return row ? toMember(row) : null;
    },
    listCalendarEvents(memberId) {
      return (
        selectCalendarEvents.all(memberId) as {
          rehearsal_id: string;
          date: string;
          event_id: string;
        }[]
      ).map((row) => ({ rehearsalId: row.rehearsal_id, date: row.date, eventId: row.event_id }));
    },
    recordCalendarEvent(memberId, event) {
      upsertCalendarEvent.run(memberId, event.rehearsalId, event.date, event.eventId);
    },
    forgetCalendarEvent(memberId, rehearsalId, date) {
      removeCalendarEvent.run(memberId, rehearsalId, date);
    },
    addEventRemoval(removal) {
      insertRemoval.run(removal.accountId, removal.eventId);
    },
    listEventRemovals() {
      return (selectRemovals.all() as { account_id: string; event_id: string }[]).map((row) => ({
        accountId: row.account_id,
        eventId: row.event_id,
      }));
    },
    forgetEventRemoval(removal) {
      removeRemoval.run(removal.accountId, removal.eventId);
    },
    forgetEventRemovalsFor(accountId) {
      removeAccountRemovals.run(accountId);
    },
    createRequest(groupId, input) {
      const id = newToken();
      transaction(() => {
        insertRequest.run(
          id,
          groupId,
          input.name,
          input.startDate,
          input.endDate,
          new Date().toISOString(),
        );
        writeWindows(id, input.windows);
      });
      return findRequest(groupId, id) as ScheduleRequest;
    },
    updateRequest(groupId, requestId, input) {
      if (!findRequest(groupId, requestId)?.open) return false;
      transaction(() => {
        changeRequest.run(input.name, input.startDate, input.endDate, groupId, requestId);
        writeWindows(requestId, input.windows);
      });
      return true;
    },
    setRequestOpen(groupId, requestId, open) {
      if (!isToken(requestId)) return false;
      return Number(changeRequestOpen.run(open ? 1 : 0, groupId, requestId).changes) > 0;
    },
    listRequests(groupId) {
      return (selectRequests.all(groupId) as RequestRow[]).map(toRequest);
    },
    findRequest,
    answerRequest(groupId, requestId, memberId, limit, now = new Date()) {
      const request = findRequest(groupId, requestId);
      if (!request?.open || !isToken(memberId) || !selectMember.get(groupId, memberId)) {
        return false;
      }
      upsertAnswer.run(requestId, memberId, now.toISOString(), limit);
      return true;
    },
    listAnswers(groupId, requestId) {
      if (!findRequest(groupId, requestId)) return [];
      return (
        selectAnswers.all(requestId) as {
          member_id: string;
          answered_at: string;
          limit_count: number | null;
        }[]
      ).map((row) => ({
        memberId: row.member_id,
        answeredAt: row.answered_at,
        limit: row.limit_count,
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
