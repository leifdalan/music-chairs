// What the page says after Google Calendar consent returns (`?notice=…`), on
// whichever page the consent started from.
export const CALENDAR_NOTICES: Record<string, string> = {
  "calendar-connected": "Google Calendar connected.",
  "calendar-declined": "Google Calendar access wasn't granted, so nothing changed.",
  "calendar-wrong-account":
    "That was a different Google account from the one you're signed in with, so nothing changed.",
  "calendar-failed": "Connecting Google Calendar didn't work. Please try again.",
};

/** The sentence for a request's calendar notice, if it has a known one. */
export function calendarNotice(request: Request): string | null {
  const notice = new URL(request.url).searchParams.get("notice");
  return notice ? (CALENDAR_NOTICES[notice] ?? null) : null;
}
