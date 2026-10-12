// What the page says after Google Calendar consent returns (`?notice=…`), on
// whichever page the consent started from.
export const CALENDAR_NOTICES: Record<string, string> = {
  "calendar-connected": "Google Calendar connected.",
  "calendar-writing": "Google Calendar connected. Confirmed rehearsals are being added to it.",
  "calendar-declined": "Google Calendar access wasn't granted, so nothing changed.",
  "calendar-wrong-account":
    "That was a different Google account from the one you're signed in with, so nothing changed.",
  "calendar-failed": "Connecting Google Calendar didn't work. Please try again.",
  "contacts-connected": "Google contacts connected: start typing a name to see suggestions.",
  "contacts-declined": "Google contacts access wasn't granted, so nothing changed.",
  "contacts-wrong-account":
    "That was a different Google account from the one you're signed in with, so nothing changed.",
  "contacts-failed": "Connecting Google contacts didn't work. Please try again.",
};

/** The sentence for a request's calendar notice, if it has a known one. */
export function calendarNotice(request: Request): string | null {
  const notice = new URL(request.url).searchParams.get("notice");
  return notice ? (CALENDAR_NOTICES[notice] ?? null) : null;
}

/**
 * What granting Google Calendar access does, said beside every way to sign in
 * with Google or connect it (plan/phase-32.md), true on a first sign-in and a
 * later one alike.
 */
export const CALENDAR_ACCESS_HINT =
  "If you allow Google Calendar access, music-chairs adds confirmed rehearsals from the groups you've joined to it and keeps them up to date. You can stop that anytime.";
