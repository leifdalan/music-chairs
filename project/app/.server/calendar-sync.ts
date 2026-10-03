// Writing confirmed rehearsals to members' primary Google Calendars
// (plan/phase-7.md, Decisions): one event per date, the same dates members can
// answer for, minus dates they said No to and cancelled dates.

import { createHash } from "node:crypto";

import { offeredDates, todayInZone, windowEnd } from "~/lib/availability";
import { zonedInstant } from "~/lib/zoned-time";

import { CALENDAR_SCOPES, GoogleAccessRevoked, putEvent, removeEvent } from "./google";
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
export async function syncMember(target: SyncingMember, now: Date = new Date()): Promise<void> {
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
    if (writtenKeys.has(`${rehearsal.id} ${date}`)) continue;
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
export function scheduleSync(targets: SyncingMember[]): void {
  for (const target of targets) {
    const previous = chains.get(target.memberId) ?? Promise.resolve();
    const next = previous
      .then(() => syncMember(target))
      .catch((error: unknown) => {
        const reason = error instanceof GoogleAccessRevoked ? "access revoked" : String(error);
        console.warn(`music-chairs: calendar sync for a member failed: ${reason}`);
      });
    chains.set(target.memberId, next);
  }
}

/** Resolves when every queued sync has finished. */
export async function whenSynced(): Promise<void> {
  await Promise.all([...chains.values()]);
}

/**
 * Syncs every member who writes to Google, or who has app-written events left
 * after turning it off: retries failures and rolls the 8-week window.
 */
export async function sweepOnce(): Promise<void> {
  scheduleSync(getStore().listSyncingMembers());
  await whenSynced();
}

if (process.env.NODE_ENV === "production") {
  setTimeout(() => void sweepOnce(), 60_000).unref();
  setInterval(() => void sweepOnce(), SWEEP_MINUTES * 60_000).unref();
}
