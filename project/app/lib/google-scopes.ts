// Google's OAuth scope names, shared by the Google client and the store.

/**
 * The Calendar permissions, each requested only from the feature that needs it
 * (plan/phase-7.md, Decisions): busy periods for import, and writing events on
 * calendars the member owns.
 */
export const CALENDAR_SCOPES = {
  busy: "https://www.googleapis.com/auth/calendar.freebusy",
  write: "https://www.googleapis.com/auth/calendar.events.owned",
} as const;
