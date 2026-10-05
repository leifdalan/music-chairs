// Helpers for calling route loaders and actions directly, as React Router's
// server does, without a browser or HTTP server.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll } from "vitest";

import { findGroupByAddress } from "../app/.server/group-address";
import { rememberMembership, startSession } from "../app/.server/membership";
import { groupPath } from "../app/lib/group-address";
import {
  getStore,
  type Account,
  type GoogleProfile,
  type Group,
  type Store,
} from "../app/.server/store";

export const ORIGIN = "http://music-chairs.test";

/** Loader/action arguments for `path`, with optional cookie and form fields. */
export function routeArgs<P>(
  path: string,
  params: P,
  options: { cookie?: string; form?: Record<string, string> } = {},
) {
  const headers = new Headers();
  if (options.cookie) headers.set("Cookie", options.cookie);
  const init: RequestInit = { headers };
  if (options.form) {
    init.method = "POST";
    init.body = new URLSearchParams(options.form);
  }
  return {
    request: new Request(new URL(path, ORIGIN), init),
    params,
    context: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- route Args types carry router internals
  } as any;
}

/** The `name=value` pair from a response's `Set-Cookie`, ready for a `Cookie` header. */
export function cookieFrom(response: Response): string {
  const setCookie = response.headers.get("Set-Cookie");
  if (!setCookie) throw new Error("response sets no cookie");
  return setCookie.split(";")[0];
}

/**
 * Every cookie a response sets, by name, each as a `name=value` pair (an
 * expired cookie has an empty value). Unlike `cookieFrom`, this reads each
 * `Set-Cookie` header separately.
 */
export function setCookies(response: Response): Record<string, string> {
  return Object.fromEntries(
    response.headers.getSetCookie().map((header) => {
      const pair = header.split(";")[0];
      return [pair.slice(0, pair.indexOf("=")), pair];
    }),
  );
}

/** Signs a Google identity in: the account and a `Cookie` pair for its new session. */
export async function signedIn(
  profile: GoogleProfile,
): Promise<{ account: Account; cookie: string }> {
  const account = getStore().upsertAccount(profile);
  return { account, cookie: (await startSession(account.id)).split(";")[0] };
}

/** The value a promise rejects with; fails if it resolves. */
export async function thrownBy(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
}

/**
 * Points the app's store at a fresh temporary database file and returns a row
 * counter that reads it through a separate connection. Call before the first
 * route call in a test file (Vitest gives each file its own module graph).
 * The directory is removed after the file's tests finish.
 */
type Table =
  | "groups"
  | "members"
  | "availability"
  | "availability_skips"
  | "rehearsals"
  | "rehearsal_cancellations"
  | "rsvps"
  | "accounts"
  | "sessions"
  | "google_tokens"
  | "calendar_events"
  | "requests"
  | "request_windows"
  | "request_answers";

export function tempDatabase(): (table: Table) => number {
  const dir = mkdtempSync(join(tmpdir(), "music-chairs-"));
  const filename = join(dir, "test.sqlite");
  process.env.MUSIC_CHAIRS_DB = filename;
  afterAll(() => {
    getStore().close();
    rmSync(dir, { recursive: true, force: true });
  });
  return (table) => {
    const db = new DatabaseSync(filename);
    try {
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
      return row.count;
    } finally {
      db.close();
    }
  };
}

/** A Cookie header for a device whose token is `deviceToken` in `groupId`. */
export async function deviceCookie(groupId: string, deviceToken: string): Promise<string> {
  return (await rememberMembership(new Request(ORIGIN), groupId, deviceToken)).split(";")[0];
}

/**
 * A request in the group to propose rehearsals from (every rehearsal belongs
 * to one, plan/phase-17.md); returns its id.
 */
export function requestIn(
  groupId: string,
  { name = "Autumn rehearsals", store = getStore() }: { name?: string; store?: Store } = {},
): string {
  return store.createRequest(groupId, {
    name,
    startDate: "2026-10-01",
    endDate: "2026-12-31",
    windows: [{ startMinute: 0, endMinute: 1440 }],
  }).id;
}

/** A group's address as the `:groupAddress` route parameter carries it (plan/phase-19.3.md). */
export function addressOf(group: { name: string; shortId: string }): string {
  return groupPath(group).slice("/g/".length);
}

/**
 * The address of the group with this internal id, for helpers that take a
 * group by id. An id that names no group throws: a test asking for a missing
 * group passes its address explicitly, so the 404 it expects is for the
 * reason it means.
 */
export function addressFor(groupId: string): string {
  const group = getStore().findGroup(groupId);
  if (!group) throw new Error(`addressFor: no group ${groupId}; pass an explicit address`);
  return addressOf(group);
}

/** The group a redirect's `Location` (a group path) points at, or null. */
export function groupAt(location: string | null): Group | null {
  return location?.startsWith("/g/") ? findGroupByAddress(location.slice("/g/".length)) : null;
}
