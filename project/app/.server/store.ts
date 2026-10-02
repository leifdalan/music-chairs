import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Role = "organizer" | "member";

export type Group = { id: string; inviteToken: string; name: string };

export type Member = { id: string; groupId: string; displayName: string; role: Role };

export type Store = {
  createGroup(name: string, organizerName: string): { group: Group; organizer: Member };
  findGroup(id: string): Group | null;
  findGroupByInviteToken(token: string): Group | null;
  addMember(groupId: string, displayName: string, role: Role): Member;
  findMember(groupId: string, memberId: string): Member | null;
  listMembers(groupId: string): Member[];
  close(): void;
};

const DEFAULT_DATABASE = "data/music-chairs.sqlite";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    invite_token TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
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
`;

/** A new unguessable identifier: 16 random bytes, base64url (22 characters). */
function newToken(): string {
  return randomBytes(16).toString("base64url");
}

/** Whether a value has the shape of an identifier this store issues. */
export function isToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

type GroupRow = { id: string; invite_token: string; name: string };
type MemberRow = { id: string; group_id: string; display_name: string; role: Role };

function toGroup(row: GroupRow): Group {
  return { id: row.id, inviteToken: row.invite_token, name: row.name };
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
  db.exec("PRAGMA foreign_keys = ON;");
  if (filename !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  db.exec(SCHEMA);

  const insertGroup = db.prepare(
    "INSERT INTO groups (id, invite_token, name, created_at) VALUES (?, ?, ?, ?)",
  );
  const insertMember = db.prepare(
    "INSERT INTO members (id, group_id, display_name, role, joined_at) VALUES (?, ?, ?, ?, ?)",
  );
  const selectGroup = db.prepare("SELECT id, invite_token, name FROM groups WHERE id = ?");
  const selectGroupByInvite = db.prepare(
    "SELECT id, invite_token, name FROM groups WHERE invite_token = ?",
  );
  const selectMember = db.prepare(
    "SELECT id, group_id, display_name, role FROM members WHERE group_id = ? AND id = ?",
  );
  const selectMembers = db.prepare(
    "SELECT id, group_id, display_name, role FROM members WHERE group_id = ? ORDER BY joined_at, rowid",
  );

  function addMember(groupId: string, displayName: string, role: Role): Member {
    const member: Member = { id: newToken(), groupId, displayName, role };
    insertMember.run(member.id, groupId, displayName, role, new Date().toISOString());
    return member;
  }

  return {
    createGroup(name, organizerName) {
      const group: Group = { id: newToken(), inviteToken: newToken(), name };
      db.exec("BEGIN");
      try {
        insertGroup.run(group.id, group.inviteToken, name, new Date().toISOString());
        const organizer = addMember(group.id, organizerName, "organizer");
        db.exec("COMMIT");
        return { group, organizer };
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
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
