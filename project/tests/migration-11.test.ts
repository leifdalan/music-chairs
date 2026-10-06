// Migration 11 (plan/phase-23.md): weekly availability becomes its one-off
// dates for the next 8 weeks; weekly rows and skips go.
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { migrate, MIGRATIONS } from "../app/.server/store";
import { weeklyDates } from "./weekly-dates";

/** The UTC date `offset` days from now, as SQLite's date('now') sees it. */
function utcDay(offset: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset))
    .toISOString()
    .slice(0, 10);
}

type Row = { member_id: string; kind: string; start_date: string; start_minute: number };

describe("migration 11", () => {
  it("turns weekly times into dates, keeping end dates, skips and other one-offs", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db, MIGRATIONS.slice(0, 10));
    const start = utcDay(-3);
    const end = utcDay(30);
    const [first, second, third] = weeklyDates(start, end);
    const [cellistFirst] = weeklyDates(start);
    const later = utcDay(10);
    db.exec(`
      INSERT INTO groups (id, invite_token, name, time_zone, show_names, created_at, short_id)
        VALUES ('g', 'invite', 'Quartet', 'Europe/London', 0, '2026-10-01', 'abcdefgh');
      INSERT INTO members (id, group_id, display_name, role, optional, device_token, joined_at)
        VALUES ('a', 'g', 'Viola', 'organizer', 0, 'device-a', '2026-10-01'),
               ('b', 'g', 'Cellist', 'member', 0, 'device-b', '2026-10-01'),
               ('c', 'g', 'Pianist', 'member', 0, 'device-c', '2026-10-01'),
               ('d', 'g', 'Oboe', 'member', 0, 'device-d', '2026-10-01');
      -- Viola: weekly 7-10 PM to an end date, one date skipped, one date already
      -- saved at the same time, one date also free in the morning.
      INSERT INTO availability VALUES
        ('wa', 'a', 'weekly', '${start}', '${end}', 1140, 1320, '2026-10-01'),
        ('oa1', 'a', 'once', '${second}', NULL, 1140, 1320, '2026-10-01'),
        ('oa2', 'a', 'once', '${third}', NULL, 540, 660, '2026-10-01');
      INSERT INTO availability_skips VALUES ('wa', '${first}');
      -- Cellist: two weekly times on the same weekday, open-ended.
      INSERT INTO availability VALUES
        ('wb1', 'b', 'weekly', '${start}', NULL, 600, 720, '2026-10-01'),
        ('wb2', 'b', 'weekly', '${start}', NULL, 1140, 1260, '2026-10-01');
      -- Pianist: a one-off only, one at exactly the Cellist's weekly date and time.
      INSERT INTO availability VALUES
        ('oc', 'c', 'once', '${second}', NULL, 1080, 1200, '2026-10-01'),
        ('oc2', 'c', 'once', '${cellistFirst}', NULL, 1140, 1260, '2026-10-01');
      -- Oboe: the same weekly time saved twice, starting ten days ahead.
      INSERT INTO availability VALUES
        ('wd1', 'd', 'weekly', '${later}', NULL, 1140, 1320, '2026-10-01'),
        ('wd2', 'd', 'weekly', '${later}', NULL, 1140, 1320, '2026-10-01');
    `);

    migrate(db);

    expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(
      11,
    );
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name = 'availability_skips'").all(),
    ).toEqual([]);
    const rows = db
      .prepare(
        `SELECT member_id, kind, start_date, start_minute FROM availability
         ORDER BY member_id, start_date, start_minute`,
      )
      .all() as Row[];
    expect(rows.filter((row) => row.kind !== "once")).toEqual([]);
    const dates = (member: string, minute: number) =>
      rows
        .filter((row) => row.member_id === member && row.start_minute === minute)
        .map((row) => row.start_date);

    // The skipped date is left out; the date saved at the same time isn't repeated.
    expect(dates("a", 1140)).toEqual(weeklyDates(start, end, [first]));
    expect(dates("a", 1140).filter((date) => date === second)).toHaveLength(1);
    // A different time on a weekly date stays beside the weekly one.
    expect(dates("a", 540)).toEqual([third]);
    expect(dates("a", 1140)).toContain(third);
    // Two weekly times on one weekday both become dates; open-ended runs 8 weeks.
    expect(dates("b", 600)).toEqual(weeklyDates(start));
    expect(dates("b", 1140)).toEqual(weeklyDates(start));
    expect(weeklyDates(start).length).toBeGreaterThanOrEqual(8);
    expect(dates("c", 1080)).toEqual([second]);
    // Another member's identical one-off doesn't stop the Cellist's date.
    expect(dates("c", 1140)).toEqual([cellistFirst]);
    expect(dates("b", 1140)).toContain(cellistFirst);
    // A weekly time starting ahead begins there; saved twice, its dates come once.
    expect(dates("d", 1140)).toEqual(weeklyDates(later));
    expect(dates("d", 1140)[0]).toBe(later);

    const migrated = db
      .prepare("SELECT id, end_date, end_minute FROM availability WHERE member_id = 'b'")
      .all() as { id: string; end_date: string | null; end_minute: number }[];
    for (const row of migrated) {
      expect(row.id).toMatch(/^[0-9a-f]{22}$/);
      expect(row.end_date).toBeNull();
    }
    expect(migrated.map((row) => row.end_minute).sort()).toEqual(
      [...weeklyDates(start).map(() => 720), ...weeklyDates(start).map(() => 1260)].sort(),
    );
    db.close();
  });
});
