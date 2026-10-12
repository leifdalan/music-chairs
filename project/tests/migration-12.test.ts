// Migration 12 (plan/phase-29.md): every rehearsal is one date. Weekly
// rehearsals go, as Delete would: their Google events from UTC yesterday on are
// queued for removal, past ones stay; cancellations go; rehearsals gain notes.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";

import { migrate, MIGRATIONS, openStore } from "../app/.server/store";

const dir = mkdtempSync(join(tmpdir(), "music-chairs-m12-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const fileDatabase = () => join(dir, "live.sqlite");

/** The UTC date `offset` days from now, as SQLite's date('now') sees it. */
function utcDay(offset: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset))
    .toISOString()
    .slice(0, 10);
}

const WEEKLY = "W".repeat(22);
const ONCE = "O".repeat(22);
const GONE = "G".repeat(22);

/** A version-11 database: a weekly and a one-off rehearsal with answers and written events. */
function version11(filename: string) {
  const db = new DatabaseSync(filename);
  migrate(db, MIGRATIONS.slice(0, 11));
  const soon = utcDay(7);
  db.exec(`
    INSERT INTO groups (id, invite_token, name, time_zone, show_names, created_at, short_id)
      VALUES ('g', 'invite', 'Quartet', 'Europe/London', 0, '2026-10-01', 'abcdefgh');
    INSERT INTO accounts (id, google_sub, email, name, created_at)
      VALUES ('acct', 'sub', 'cello@example.test', 'Cel', '2026-10-01');
    INSERT INTO members (id, group_id, display_name, role, optional, device_token, joined_at,
        account_id)
      VALUES ('org', 'g', 'Viola', 'organizer', 0, 'device-a', '2026-10-01', NULL),
             ('cel', 'g', 'Cellist', 'member', 0, 'device-b', '2026-10-01', 'acct'),
             ('pia', 'g', 'Pianist', 'member', 0, 'device-c', '2026-10-01', NULL);
    INSERT INTO requests (id, group_id, name, start_date, end_date, open, created_at)
      VALUES ('q', 'g', 'Concert', '2026-10-01', '2026-12-31', 1, '2026-10-01');
    INSERT INTO rehearsals (id, group_id, kind, start_date, end_date, start_minute, end_minute,
        location, status, created_at, request_id)
      VALUES ('${WEEKLY}', 'g', 'weekly', '${utcDay(-21)}', NULL, 1140, 1260, 'Hall',
              'confirmed', '2026-10-01', 'q'),
             ('${ONCE}', 'g', 'once', '${soon}', NULL, 1170, 1290, 'Studio', 'confirmed',
              '2026-10-01', 'q');
    INSERT INTO rehearsal_cancellations VALUES ('${WEEKLY}', '${utcDay(14)}');
    INSERT INTO rsvps VALUES
      ('${WEEKLY}', 'cel', '${utcDay(7)}', 'yes', '2026-10-01'),
      ('${ONCE}', 'cel', '${soon}', 'maybe', '2026-10-01'),
      ('${ONCE}', 'pia', '${soon}', 'no', '2026-10-01');
    -- Events written for the weekly rehearsal: one past, one yesterday (UTC), one coming,
    -- one for the Pianist (no account, so nothing to remove at Google).
    INSERT INTO calendar_events VALUES
      ('cel', '${WEEKLY}', '${utcDay(-7)}', 'mc-weekly-past'),
      ('cel', '${WEEKLY}', '${utcDay(-1)}', 'mc-weekly-yesterday'),
      ('cel', '${WEEKLY}', '${utcDay(7)}', 'mc-weekly-coming'),
      ('pia', '${WEEKLY}', '${utcDay(7)}', 'mc-weekly-unlinked'),
      ('cel', '${ONCE}', '${soon}', 'mc-once'),
      -- A rehearsal deleted earlier whose event still waits to be removed.
      ('cel', '${GONE}', '${utcDay(3)}', 'mc-orphan');
  `);
  db.close();
  return { soon };
}

describe("migration 12", () => {
  it("deletes weekly rehearsals as Delete would and keeps one-offs with their answers and events", () => {
    const filename = fileDatabase();
    const { soon } = version11(filename);

    const store = openStore(filename);
    const db = new DatabaseSync(filename);
    const rows = (sql: string) => db.prepare(sql).all();

    expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(
      MIGRATIONS.length,
    );
    // The weekly rehearsal, its answers and its event rows are gone; the one-off stays.
    expect(store.listRehearsals("g")).toEqual([
      {
        id: ONCE,
        date: soon,
        startMinute: 1170,
        endMinute: 1290,
        location: "Studio",
        notes: "",
        status: "confirmed",
        requestId: "q",
      },
    ]);
    expect(store.listRsvps("g").map((rsvp) => [rsvp.memberId, rsvp.answer, rsvp.date])).toEqual([
      ["cel", "maybe", soon],
      ["pia", "no", soon],
    ]);
    expect(rows("SELECT event_id FROM calendar_events ORDER BY event_id")).toEqual([
      { event_id: "mc-once" },
      { event_id: "mc-orphan" },
    ]);
    // Only the linked member's events from UTC yesterday on are queued for Google.
    expect(
      rows("SELECT account_id, event_id FROM calendar_event_removals ORDER BY event_id"),
    ).toEqual([
      { account_id: "acct", event_id: "mc-weekly-coming" },
      { account_id: "acct", event_id: "mc-weekly-yesterday" },
    ]);
    expect(rows("SELECT name FROM sqlite_master WHERE name = 'rehearsal_cancellations'")).toEqual(
      [],
    );
    // The rebuilt table: one date, notes, no kind or end date, both indexes.
    const columns = (db.prepare("PRAGMA table_info(rehearsals)").all() as { name: string }[]).map(
      (column) => column.name,
    );
    expect(columns).toEqual([
      "id",
      "group_id",
      "request_id",
      "date",
      "start_minute",
      "end_minute",
      "location",
      "notes",
      "status",
      "created_at",
    ]);
    expect(
      rows("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'rehearsals'"),
    ).toEqual(
      expect.arrayContaining([{ name: "rehearsals_by_group" }, { name: "rehearsals_by_request" }]),
    );
    // Its checks and references survive the rebuild.
    expect(() =>
      db.exec(
        `INSERT INTO rehearsals (id, group_id, date, start_minute, end_minute, location, status,
          created_at) VALUES ('x', 'g', '2026-10-02', 1200, 1200, 'S', 'proposed', 'x')`,
      ),
    ).toThrow();
    expect(
      rows("PRAGMA foreign_key_list(rehearsals)")
        .map((key) => (key as { table: string }).table)
        .sort(),
    ).toEqual(["groups", "requests"]);
    // Answers still cascade when a kept rehearsal is deleted.
    expect(store.deleteRehearsal("g", ONCE)).toBe(true);
    expect(store.listRsvps("g")).toEqual([]);
    db.close();
    store.close();
  });
});
