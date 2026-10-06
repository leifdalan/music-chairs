// A member's own Google Calendar busy times, shown as clashes while they give
// times on a request (plan/phase-10.md; on the request page since
// plan/phase-23.md).

import { calendarViewer } from "~/.server/calendar-sync";
import {
  accessTokenFor,
  CALENDAR_SCOPES,
  GoogleAccessRevoked,
  GoogleApiError,
  queryBusy,
} from "~/.server/google";
import { pagePath } from "~/.server/membership";
import { getStore, type Group } from "~/.server/store";
import { addDays } from "~/lib/availability";
import { busyQueries, busyRanges, clipRanges, type Clashes } from "~/lib/busy";
import type { TimeWindow } from "~/lib/requests";

/**
 * The member's own busy times from Google Calendar for the offered dates, read
 * live on every load. Only for the member signed in with Google on this
 * device, and only within the request's windows, so nothing outside the
 * request reaches the page. Consent returns to the page that asked.
 */
export async function googleClashes(
  request: Request,
  group: Group,
  range: { from: string; to: string },
  windows: TimeWindow[],
): Promise<Clashes> {
  const capable = await calendarViewer(request, group);
  if (!capable) return { state: "none" };
  const url = new URL(request.url);
  // Back here after consent, without the notice of an earlier attempt.
  url.searchParams.delete("notice");
  const connectUrl = `/auth/google/calendar?scope=busy&returnTo=${encodeURIComponent(pagePath(url))}`;
  if (!getStore().findGrant(capable.account.id)?.scopes.includes(CALENDAR_SCOPES.busy)) {
    return { state: "connect", connectUrl };
  }
  try {
    // One token refresh for every query that follows, not one each.
    await accessTokenFor(capable.account.id);
    const answers = await Promise.all(
      busyQueries(range.from, range.to, group.timeZone).map((query) =>
        queryBusy(capable.account.id, query.timeMin, query.timeMax),
      ),
    );
    const dates: string[] = [];
    for (let date = range.from; date <= range.to; date = addDays(date, 1)) dates.push(date);
    const busy = busyRanges(answers.flat(), dates, group.timeZone);
    for (const date of Object.keys(busy)) {
      const inside = clipRanges(busy[date], windows);
      if (inside.length > 0) busy[date] = inside;
      else delete busy[date];
    }
    return { state: "ready", busy };
  } catch (error) {
    if (error instanceof GoogleAccessRevoked) return { state: "connect", connectUrl };
    if (!(error instanceof GoogleApiError)) throw error;
    console.warn(`music-chairs: free/busy for clashes failed: ${error.message}`);
    return { state: "error" };
  }
}
