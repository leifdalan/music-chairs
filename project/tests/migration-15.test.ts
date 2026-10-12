// Migration 15 (plan/phase-32.md): granting the Google Calendar permission
// switches writing on, so every member whose account already granted writing
// writes once this ships; nobody else changes.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";

import { CALENDAR_SCOPES } from "../app/lib/google-scopes";
import { migrate, MIGRATIONS, openStore } from "../app/.server/store";

const dir = mkdtempSync(join(tmpdir(), "music-chairs-m15-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const G = "g".repeat(22);
const H = "h".repeat(22);
const WRITER = "w".repeat(22);
const BUSY_ONLY = "b".repeat(22);
const NO_GRANT = "n".repeat(22);

/** A version-14 database: members of accounts with different grants, and one without an account. */
function version14(filename: string) {
  const db = new DatabaseSync(filename);
  migrate(db, MIGRATIONS.slice(0, 14));
  const row = (id: string, group: string, account: string | null, sync: number) =>
    `('${id}', '${group}', 'M', 'member', 0, 'device-${id}', '2026-10-01', ${account ? `'${account}'` : "NULL"}, ${sync})`;
  db.exec(`
    INSERT INTO groups (id, invite_token, name, time_zone, show_names, created_at, short_id)
      VALUES ('${G}', 'abcdefgh', 'Quartet', 'Europe/London', 0, '2026-10-01', 'bcdefghi'),
             ('${H}', 'cdefghij', 'Trio', 'Europe/London', 0, '2026-10-01', 'defghijk');
    INSERT INTO accounts (id, google_sub, email, name, created_at)
      VALUES ('${WRITER}', 'sub-w', 'w@example.test', 'W', '2026-10-01'),
             ('${BUSY_ONLY}', 'sub-b', 'b@example.test', 'B', '2026-10-01'),
             ('${NO_GRANT}', 'sub-n', 'n@example.test', 'N', '2026-10-01');
    INSERT INTO google_tokens (account_id, refresh_token, scopes, updated_at)
      VALUES ('${WRITER}', 'r1', 'openid ${CALENDAR_SCOPES.busy} ${CALENDAR_SCOPES.write}', 'x'),
             ('${BUSY_ONLY}', 'r2', 'openid ${CALENDAR_SCOPES.busy} ${CALENDAR_SCOPES.write}.extra', 'x');
    INSERT INTO members (id, group_id, display_name, role, optional, device_token, joined_at,
        account_id, calendar_sync)
      VALUES ${[
        row("m1", G, WRITER, 0),
        row("m2", H, WRITER, 0),
        row("m3", G, BUSY_ONLY, 0),
        row("m4", H, NO_GRANT, 0),
        row("m5", H, null, 0),
        row("m6", H, BUSY_ONLY, 1),
      ].join(", ")};
  `);
  db.close();
}

describe("migration 15", () => {
  it("switches writing on for members whose account granted it, and changes nobody else", () => {
    const filename = join(dir, "live.sqlite");
    version14(filename);

    const store = openStore(filename);
    const db = new DatabaseSync(filename);

    expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(
      MIGRATIONS.length,
    );
    const rows = db
      .prepare("SELECT id, calendar_sync, calendar_hold FROM members ORDER BY id")
      .all() as { id: string; calendar_sync: number; calendar_hold: string | null }[];
    expect(rows).toEqual([
      // Both memberships of the writing account.
      { id: "m1", calendar_sync: 1, calendar_hold: null },
      { id: "m2", calendar_sync: 1, calendar_hold: null },
      // A scope that only starts like the write permission is not it.
      { id: "m3", calendar_sync: 0, calendar_hold: null },
      { id: "m4", calendar_sync: 0, calendar_hold: null },
      { id: "m5", calendar_sync: 0, calendar_hold: null },
      // Already writing stays writing.
      { id: "m6", calendar_sync: 1, calendar_hold: null },
    ]);
    expect(() => db.exec("UPDATE members SET calendar_hold = 'maybe' WHERE id = 'm1'")).toThrow();
    db.close();
    store.close();
  });
});
