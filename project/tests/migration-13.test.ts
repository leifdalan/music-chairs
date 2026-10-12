// Migrations 13 and 14 (plan/phase-30.md): every group gets a fresh short
// invite code in place of its long invite token, so every old invite link stops
// working; every request gets a slug, oldest first within its group.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";

import { migrate, MIGRATIONS, openStore } from "../app/.server/store";

const dir = mkdtempSync(join(tmpdir(), "music-chairs-m13-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const OLD_A = "A".repeat(22);
const OLD_B = "B".repeat(22);
const G = "g".repeat(22);
const H = "h".repeat(22);

/** A version-12 database: two groups with long invite tokens and requests. */
function version12(filename: string) {
  const db = new DatabaseSync(filename);
  migrate(db, MIGRATIONS.slice(0, 12));
  db.exec(`
    INSERT INTO groups (id, invite_token, name, time_zone, show_names, created_at, short_id)
      VALUES ('${G}', '${OLD_A}', 'Quartet', 'Europe/London', 0, '2026-10-01', 'abcdefgh'),
             ('${H}', '${OLD_B}', 'Trio', 'Europe/London', 0, '2026-10-01', 'bcdefghi');
    INSERT INTO requests (id, group_id, name, start_date, end_date, open, created_at)
      VALUES ('q3', '${G}', 'Concert', '2026-10-01', '2026-10-31', 1, '2026-10-03'),
             ('q1', '${G}', 'Concert', '2026-10-01', '2026-10-31', 1, '2026-10-01'),
             ('q2', '${G}', 'Schedule', '2026-10-01', '2026-10-31', 1, '2026-10-02'),
             ('q4', '${G}', '日本', '2026-10-01', '2026-10-31', 1, '2026-10-04'),
             ('r1', '${H}', 'Concert', '2026-10-01', '2026-10-31', 1, '2026-10-05');
  `);
  db.close();
}

describe("migrations 13 and 14", () => {
  it("replace every invite token with a fresh short code, and give every request a slug", () => {
    const filename = join(dir, "live.sqlite");
    version12(filename);

    const store = openStore(filename);
    const db = new DatabaseSync(filename);

    expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(
      MIGRATIONS.length,
    );
    const codes = [store.findGroup(G)!.inviteCode, store.findGroup(H)!.inviteCode];
    for (const code of codes) expect(code).toMatch(/^[23456789abcdefghijkmnpqrstuvwxyz]{8}$/);
    expect(new Set(codes).size).toBe(2);
    expect(store.findGroupByInviteCode(codes[0])?.id).toBe(G);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM groups WHERE invite_token IN (?, ?)").get(OLD_A, OLD_B),
    ).toEqual({ n: 0 });

    // Oldest first within each group; a group's slugs never clash with its pages.
    const slugs = Object.fromEntries(
      (db.prepare("SELECT id, slug FROM requests").all() as { id: string; slug: string }[]).map(
        (row) => [row.id, row.slug],
      ),
    );
    expect(slugs).toEqual({
      q1: "concert",
      q2: "schedule-2",
      q3: "concert-2",
      q4: "request",
      r1: "concert",
    });
    expect(() =>
      db.exec(
        `INSERT INTO requests (id, group_id, name, start_date, end_date, open, created_at, slug)
         VALUES ('x', '${G}', 'X', '2026-10-01', '2026-10-31', 1, 'x', 'concert')`,
      ),
    ).toThrow();
    // A request made afterwards takes the next free slug.
    const next = store.createRequest(G, {
      name: "Concert",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      windows: [{ startMinute: 1140, endMinute: 1320 }],
    });
    expect(next.slug).toBe("concert-3");
    db.close();
    store.close();
  });
});
