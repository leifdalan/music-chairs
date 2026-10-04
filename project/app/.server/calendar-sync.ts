// Writing confirmed rehearsals to members' primary Google Calendars
// (plan/phase-7.md, Decisions): one event per date, the same dates members can
// answer for, minus dates they said No to and cancelled dates.

import { createHash } from "node:crypto";

import type { GoogleWriteState } from "~/components/calendar-actions";
import { offeredDates, todayInZone, windowEnd } from "~/lib/availability";
import type { FeedEvent } from "~/lib/ics";
import { zonedInstant } from "~/lib/zoned-time";

import {
  CALENDAR_SCOPES,
  GoogleAccessRevoked,
  googleConfig,
  putEvent,
  removeEvent,
} from "./google";
import { findViewer, publicOrigin, readAccount } from "./membership";
import {
  getStore,
  type Account,
  type Group,
  type Member,
  type Rehearsal,
  type SyncingMember,
} from "./store";

/** How often, in production, every syncing member is brought up to date. */
export const SWEEP_MINUTES = 60;

/**
 * The member whose calendar features this visitor may use: the signed-in
 * account's member in the group, and only when it is also the member this
 * visitor is resolved as (a borrowed device signed in as someone else gets none).
 */
export async function calendarViewer(
  request: Request,
  group: Group,
): Promise<{ member: Member; account: Account } | null> {
  const viewer = await findViewer(request, group);
  const account = await readAccount(request);
  if (!viewer || !account) return null;
  const member = getStore().findMemberByAccount(group.id, account.id);
  return member && member.id === viewer.id ? { member, account } : null;
}

/** The rehearsal dates that belong on this member's calendar between `from` and `to`. */
export function calendarDates(
  group: Group,
  memberId: string,
  from: string,
  to: string,
): { rehearsal: Rehearsal; date: string }[] {
  const store = getStore();
  const declined = new Set(
    store
      .listRsvps(group.id)
      .filter((rsvp) => rsvp.memberId === memberId && rsvp.answer === "no")
      .map((rsvp) => `${rsvp.rehearsalId} ${rsvp.date}`),
  );
  return store
    .listRehearsals(group.id)
    .filter((rehearsal) => rehearsal.status === "confirmed")
    .flatMap((rehearsal) =>
      offeredDates(rehearsal, from, to)
        .filter((date) => !declined.has(`${rehearsal.id} ${date}`))
        .map((date) => ({ rehearsal, date })),
    );
}

/** Calendar-file events for `calendarDates` output: the feed's and a request's download. */
export function feedEvents(
  group: Group,
  dates: { rehearsal: Rehearsal; date: string }[],
): FeedEvent[] {
  const zone = group.timeZone;
  return dates.map(({ rehearsal, date }) => ({
    uid: `${rehearsal.id}-${date}@music-chairs`,
    start: zonedInstant(date, rehearsal.startMinute, zone, { skipped: "forward" }) as Date,
    end: zonedInstant(date, rehearsal.endMinute, zone, { skipped: "forward" }) as Date,
    summary: `${group.name} rehearsal`,
    location: rehearsal.location,
  }));
}

/**
 * Whether this visitor can have the app write rehearsals to their Google
 * Calendar, for the viewer's member of the group: null when Google isn't
 * configured; "unlinked" or "other-account" when this visitor isn't signed in
 * as that member; "connect" before the write permission is granted; then
 * whether writing is off or on.
 */
export async function googleWriteState(
  request: Request,
  group: Group,
  viewer: Member,
): Promise<GoogleWriteState | null> {
  if (!googleConfig()) return null;
  const capable = await calendarViewer(request, group);
  if (!capable) return viewer.googleEmail ? "other-account" : "unlinked";
  const grant = getStore().findGrant(capable.account.id);
  if (!grant?.scopes.includes(CALENDAR_SCOPES.write)) return "connect";
  return capable.member.calendarSync ? "on" : "off";
}

/** A stable Google event id (base32hex characters) for one member's rehearsal date. */
export function eventId(memberId: string, rehearsalId: string, date: string): string {
  const hash = createHash("sha256").update(`${memberId} ${rehearsalId} ${date}`).digest("hex");
  return `mc${hash.slice(0, 40)}`;
}

/**
 * Brings one member's Google Calendar in line: adds missing upcoming dates and
 * removes upcoming dates the app wrote that no longer belong (all of them when
 * the member turned writing off). Past events are left alone.
 */
export async function syncMember(
  target: SyncingMember,
  now: Date = new Date(),
  options: { rewrite?: boolean } = {},
): Promise<void> {
  const store = getStore();
  const group = store.findGroup(target.groupId);
  const member = group ? store.findMember(group.id, target.memberId) : null;
  if (!group || !member) return;
  const grant = store.findGrant(target.accountId);
  if (!grant?.scopes.includes(CALENDAR_SCOPES.write)) return;
  const today = todayInZone(group.timeZone, now);
  const wanted = member.calendarSync
    ? calendarDates(group, member.id, today, windowEnd(today))
    : [];
  const written = store.listCalendarEvents(member.id);
  const writtenKeys = new Set(written.map((event) => `${event.rehearsalId} ${event.date}`));
  const wantedKeys = new Set(wanted.map(({ rehearsal, date }) => `${rehearsal.id} ${date}`));
  const origin = publicOrigin() ?? "";
  const failures: unknown[] = [];
  // Removals first: a date someone can no longer make matters most, and one
  // failing date never holds back the others. The sweep retries what failed.
  for (const event of written) {
    if (event.date < today || wantedKeys.has(`${event.rehearsalId} ${event.date}`)) continue;
    try {
      await removeEvent(target.accountId, event.eventId);
      store.forgetCalendarEvent(member.id, event.rehearsalId, event.date);
    } catch (error) {
      if (error instanceof GoogleAccessRevoked) throw error;
      failures.push(error);
    }
  }
  for (const { rehearsal, date } of wanted) {
    // A rewrite (after a rename or zone change) puts written dates again in
    // place, under the same event id, keeping their records throughout.
    if (writtenKeys.has(`${rehearsal.id} ${date}`) && !options.rewrite) continue;
    const id = eventId(member.id, rehearsal.id, date);
    try {
      await putEvent(target.accountId, id, {
        summary: `${group.name} rehearsal`,
        location: rehearsal.location,
        description: `Rehearsal for ${group.name}. Answer or see the schedule: ${origin}/g/${group.id}/schedule`,
        start: zonedInstant(date, rehearsal.startMinute, group.timeZone, {
          skipped: "forward",
        }) as Date,
        end: zonedInstant(date, rehearsal.endMinute, group.timeZone, {
          skipped: "forward",
        }) as Date,
        timeZone: group.timeZone,
      });
      // The member (or the whole group) may have been removed while Google
      // answered; the event is then queued for removal instead of recorded.
      if (!store.findMember(group.id, member.id)) {
        store.addEventRemoval({ accountId: target.accountId, eventId: id });
        return;
      }
      store.recordCalendarEvent(member.id, { rehearsalId: rehearsal.id, date, eventId: id });
    } catch (error) {
      if (error instanceof GoogleAccessRevoked) throw error;
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new Error(`${failures.length} calendar update(s) failed; first: ${String(failures[0])}`);
  }
}

// One chain per member, so syncs of the same calendar never overlap.
const chains = new Map<string, Promise<void>>();

/** Queues syncs and returns at once; failures are logged and retried by the next sweep. */
export function scheduleSync(targets: SyncingMember[], options: { rewrite?: boolean } = {}): void {
  for (const target of targets) {
    const previous = chains.get(target.memberId) ?? Promise.resolve();
    const next = previous
      .then(() => syncMember(target, new Date(), options))
      .catch((error: unknown) => {
        const reason = error instanceof GoogleAccessRevoked ? "access revoked" : String(error);
        console.warn(`music-chairs: calendar sync for a member failed: ${reason}`);
      });
    chains.set(target.memberId, next);
  }
}

/**
 * Re-writes the upcoming events of the group's writing members after its name
 * or time zone changed: each still-wanted date is put again in place (same
 * event id, new title and instants). Records are never forgotten, so removals
 * and later syncs still find every event the app wrote.
 */
export function rewriteGroupEvents(groupId: string): void {
  const store = getStore();
  const group = store.findGroup(groupId);
  if (!group) return;
  scheduleSync(
    store
      .listSyncingMembers(group.id)
      .filter((target) => store.findMember(group.id, target.memberId)?.calendarSync),
    { rewrite: true },
  );
}

/**
 * Removes app-written events whose member or group was deleted. A removal is
 * tried only while the account can still write to its calendar; with its
 * grant gone (revoked, or the person disconnected) nothing can be removed and
 * the account's removals are dropped. Failures stay for the next sweep.
 */
export async function removePendingEvents(accountId?: string): Promise<number> {
  const store = getStore();
  let failures = 0;
  for (const removal of store.listEventRemovals()) {
    if (accountId !== undefined && removal.accountId !== accountId) continue;
    const grant = store.findGrant(removal.accountId);
    if (!grant) {
      store.forgetEventRemovalsFor(removal.accountId);
      continue;
    }
    if (!grant.scopes.includes(CALENDAR_SCOPES.write)) continue;
    try {
      await removeEvent(removal.accountId, removal.eventId);
      store.forgetEventRemoval(removal);
    } catch (error) {
      // Only a grant that is really gone ends the removals; a refused access
      // token with the grant still saved is retried like any failure.
      if (error instanceof GoogleAccessRevoked && !store.findGrant(removal.accountId)) {
        store.forgetEventRemovalsFor(removal.accountId);
      } else failures += 1;
    }
  }
  if (failures > 0)
    console.warn(`music-chairs: ${failures} calendar removal(s) failed; will retry`);
  return failures;
}

// One chain for removals, so runs never overlap.
let removals: Promise<void> = Promise.resolve();

/** Queues a removal run and returns at once. */
export function scheduleRemovals(): void {
  removals = removals
    .then(async () => {
      await removePendingEvents();
    })
    .catch((error: unknown) => {
      console.warn(`music-chairs: calendar removals failed: ${String(error)}`);
    });
}

/** How long Disconnect Google waits for the account's events to be removed. */
const STOP_WRITING_WAIT_MS = 20_000;

/**
 * Before Disconnect Google withdraws the app's access (plan/phase-14.md): turns
 * calendar writing off on every membership of the account and removes the
 * upcoming events the app wrote, including those still queued from removed
 * memberships, while the token still works. Each member's sync runs on its
 * chain, so it never overlaps another. True when everything was removed;
 * false after a failure, or when 20 seconds pass first.
 */
export async function stopWritingFor(accountId: string): Promise<boolean> {
  const store = getStore();
  const targets: SyncingMember[] = store
    .listAccountMemberships(accountId)
    .map(({ group, member }) => ({ memberId: member.id, groupId: group.id, accountId }));
  for (const target of targets) store.setCalendarSync(target.groupId, target.memberId, false);
  const work = targets.map((target) => {
    const next = (chains.get(target.memberId) ?? Promise.resolve())
      .catch(() => {})
      .then(() => syncMember(target));
    chains.set(
      target.memberId,
      next.catch(() => {}),
    );
    return next;
  });
  const removing = removals.catch(() => {}).then(() => removePendingEvents(accountId));
  removals = removing.then(() => {}).catch(() => {});
  // Wait for every sync and the queued removals, even after one fails, so the
  // grant is revoked only once nothing is still using it.
  const outcome = Promise.allSettled([...work, removing]).then((results) =>
    results.every(
      (result, index) =>
        result.status === "fulfilled" && (index < work.length || result.value === 0),
    ),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), STOP_WRITING_WAIT_MS);
  });
  try {
    return await Promise.race([outcome, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** Resolves when every queued sync and removal run has finished. */
export async function whenSynced(): Promise<void> {
  await Promise.all([...chains.values(), removals]);
}

/**
 * Syncs every member who writes to Google, or who has app-written events left
 * after turning it off, and retries pending removals: retries failures and
 * rolls the 8-week window.
 */
export async function sweepOnce(): Promise<void> {
  scheduleRemovals();
  scheduleSync(getStore().listSyncingMembers());
  await whenSynced();
}

if (process.env.NODE_ENV === "production") {
  setTimeout(() => void sweepOnce(), 60_000).unref();
  setInterval(() => void sweepOnce(), SWEEP_MINUTES * 60_000).unref();
}
