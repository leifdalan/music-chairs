// What a page says after a round trip to Google (`?notice=…`, which may
// repeat), on whichever page it started from. Each page renders the keys it
// lists in its route `handle` in context; the root layout renders any other,
// so none is dropped (plan/phase-34.md).
export const NOTICES = {
  "signin-cancelled": "Google sign-in was cancelled.",
  "signin-failed": "Google sign-in didn't work. Please try again.",
  "signin-expired": "That took too long, so you weren't signed in. Please try again.",
  "signin-calendar-declined":
    "Signed in. Google Calendar wasn't allowed, so clashes and calendar writing stay off.",
  "google-unavailable": "Signing in with Google isn't available right now. Please try again later.",
  "unverified-email":
    "Signed in. Google hasn't verified this account's email yet, so places organizers added for it can't be found until it does.",
  linked: "Linked to your Google account.",
  "account-taken":
    "This Google account is already someone else in this group, so this device's member stays name-only.",
  "calendar-connected": "Google Calendar connected.",
  "calendar-writing": "Google Calendar connected. Confirmed rehearsals are being added to it.",
  "calendar-declined": "Google Calendar access wasn't granted, so nothing changed.",
  "calendar-wrong-account":
    "That was a different Google account from the one you're signed in with, so nothing changed.",
  "calendar-failed": "Connecting Google Calendar didn't work. Please try again.",
  "calendar-partial-busy":
    "Google Calendar is connected for clashes only: adding rehearsals to it wasn't allowed.",
  "calendar-partial-write":
    "Google Calendar is connected for adding rehearsals only: seeing clashes wasn't allowed.",
  "calendar-unsaved":
    "Google didn't give music-chairs lasting access to your calendar, so it isn't connected. Please try again.",
  "contacts-connected": "Google contacts connected: start typing a name to see suggestions.",
  "contacts-partial":
    "Google contacts connected for your saved contacts only: people you've emailed but not saved won't be suggested.",
  "contacts-declined": "Google contacts access wasn't granted, so nothing changed.",
  "contacts-wrong-account":
    "That was a different Google account from the one you're signed in with, so nothing changed.",
  "contacts-failed": "Connecting Google contacts didn't work. Please try again.",
  "link-gone": "That link is out of date: what it pointed to was deleted or changed.",
  "ics-unavailable":
    "There's no calendar file for this availability request yet: it comes once its rehearsals are confirmed.",
} as const satisfies Record<string, string>;

export type NoticeKey = keyof typeof NOTICES;

/**
 * How a notice looks (plan/phase-38.md): something failed or was refused is a
 * problem (red); got less than asked for is a warning (yellow); declined
 * everything, or nothing went wrong, is information (neutral).
 */
export type NoticeTone = "info" | "warning" | "problem";

export const NOTICE_TONES: Record<NoticeKey, NoticeTone> = {
  "signin-cancelled": "info",
  "signin-failed": "problem",
  "signin-expired": "problem",
  "signin-calendar-declined": "warning",
  "google-unavailable": "problem",
  "unverified-email": "warning",
  linked: "info",
  "account-taken": "problem",
  "calendar-connected": "info",
  "calendar-writing": "info",
  "calendar-declined": "info",
  "calendar-wrong-account": "problem",
  "calendar-failed": "problem",
  "calendar-partial-busy": "warning",
  "calendar-partial-write": "warning",
  "calendar-unsaved": "problem",
  "contacts-connected": "info",
  "contacts-partial": "warning",
  "contacts-declined": "info",
  "contacts-wrong-account": "problem",
  "contacts-failed": "problem",
  "link-gone": "problem",
  "ics-unavailable": "info",
};

/** A notice to show: its words and how it looks. */
export type ShownNotice = { text: string; tone: NoticeTone };

const SEVERITY: NoticeTone[] = ["info", "warning", "problem"];

/** The most severe of these tones. */
export function gravest(tones: NoticeTone[]): NoticeTone {
  return tones.reduce<NoticeTone>(
    (worst, tone) => (SEVERITY.indexOf(tone) > SEVERITY.indexOf(worst) ? tone : worst),
    "info",
  );
}

const keysStarting = (prefix: string) =>
  (Object.keys(NOTICES) as NoticeKey[]).filter((key) => key.startsWith(prefix));

/** Notices of Google Calendar consent and writing. */
export const CALENDAR_NOTICE_KEYS = keysStarting("calendar-");
/** Notices of Google contacts consent. */
export const CONTACTS_NOTICE_KEYS = keysStarting("contacts-");
/** Notices of signing in with Google. */
export const SIGNIN_NOTICE_KEYS: NoticeKey[] = [
  ...keysStarting("signin-"),
  "google-unavailable",
  "unverified-email",
];

/** The address's known notices, once each, in order. */
export function noticeKeys(url: string | URL): NoticeKey[] {
  const keys = new URL(url, "http://site.invalid").searchParams.getAll("notice");
  return [...new Set(keys)].filter((key): key is NoticeKey => key in NOTICES);
}

/**
 * The request's notices among `keys`, if any: their sentences together, in
 * the most severe of their tones.
 */
export function noticeText(request: Request, keys: readonly NoticeKey[]): ShownNotice | null {
  const shown = noticeKeys(request.url).filter((key) => keys.includes(key));
  if (shown.length === 0) return null;
  return {
    text: shown.map((key) => NOTICES[key]).join(" "),
    tone: gravest(shown.map((key) => NOTICE_TONES[key])),
  };
}

/**
 * `path` saying these notices, in order (plan/phase-34.md); any notice it
 * carried from an earlier round trip goes.
 */
export function withNotice(path: string, ...notices: string[]): string {
  const target = new URL(path, "http://site.invalid");
  target.searchParams.delete("notice");
  for (const notice of notices) target.searchParams.append("notice", notice);
  return target.pathname + target.search + target.hash;
}

/** The notices a route renders itself, from its `handle`. */
export type NoticeHandle = { notices?: readonly NoticeKey[] };

/**
 * What granting Google Calendar access does, said beside every way to sign in
 * with Google or connect it (plan/phase-32.md), true on a first sign-in and a
 * later one alike.
 */
export const CALENDAR_ACCESS_HINT =
  "If you allow Google Calendar access, music-chairs adds confirmed rehearsals from the groups you've joined to it and keeps them up to date. You can stop that anytime.";
