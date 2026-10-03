import { calendarDates } from "~/.server/calendar-sync";
import { getStore } from "~/.server/store";
import { addDays, todayInZone, windowEnd } from "~/lib/availability";
import { renderFeed } from "~/lib/ics";
import { zonedInstant } from "~/lib/zoned-time";

import type { Route } from "./+types/calendar-feed";

/**
 * A member's private calendar feed at `/calendar/<token>.ics`: the same dates
 * written to Google (confirmed, minus dates they said No to and cancelled
 * dates), from four weeks back to the end of the answer window.
 */
export function loader({ params }: Route.LoaderArgs) {
  const token = params.feedFile.endsWith(".ics") ? params.feedFile.slice(0, -4) : "";
  const store = getStore();
  const member = store.findMemberByFeed(token);
  const group = member ? store.findGroup(member.groupId) : null;
  if (!member || !group) return new Response("Not found", { status: 404 });
  const now = new Date();
  const today = todayInZone(group.timeZone, now);
  const zone = group.timeZone;
  const events = calendarDates(group, member.id, addDays(today, -28), windowEnd(today)).map(
    ({ rehearsal, date }) => ({
      uid: `${rehearsal.id}-${date}@music-chairs`,
      start: zonedInstant(date, rehearsal.startMinute, zone, { skipped: "forward" }) as Date,
      end: zonedInstant(date, rehearsal.endMinute, zone, { skipped: "forward" }) as Date,
      summary: `${group.name} rehearsal`,
      location: rehearsal.location,
    }),
  );
  return new Response(renderFeed(`${group.name} rehearsals`, events, now), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=300",
    },
  });
}
