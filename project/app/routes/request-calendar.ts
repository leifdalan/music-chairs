import { data, redirect } from "react-router";

import { calendarDates, feedEvents } from "~/.server/calendar-sync";
import { findViewer, publicOrigin } from "~/.server/membership";
import { requestProgress } from "~/.server/progress";
import { groupFromAddress } from "~/.server/group-address";
import { getStore } from "~/.server/store";
import { groupPath } from "~/lib/group-address";
import { addDays, todayInZone, windowEnd } from "~/lib/availability";
import { renderFeed } from "~/lib/ics";

import type { Route } from "./+types/request-calendar";

/** An ASCII file name for the request, "rehearsals" when nothing usable is left. */
function fileName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${slug || "rehearsals"}.ics`;
}

/**
 * A complete request's confirmed rehearsals as a calendar file to download
 * (plan/phase-17.md, Add to calendar): the dates the viewer's own feed holds
 * for this request (minus dates they said No to and cancelled dates), from
 * four weeks back to the end of the answer window.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const store = getStore();
  const group = groupFromAddress(request, params.groupAddress);
  const viewer = await findViewer(request, group);
  if (!viewer) throw redirect(groupPath(group));
  const scheduleRequest = store.findRequest(group.id, params.requestId);
  if (!scheduleRequest) throw data(null, { status: 404 });
  const now = new Date();
  const today = todayInZone(group.timeZone, now);
  const progress = requestProgress(group, today).find(
    (item) => item.requestId === scheduleRequest.id,
  );
  if (!progress?.complete) throw data(null, { status: 404 });
  const dates = calendarDates(group, viewer.id, addDays(today, -28), windowEnd(today)).filter(
    ({ rehearsal }) => rehearsal.requestId === scheduleRequest.id,
  );
  const body = renderFeed(
    `${group.name} — ${scheduleRequest.name}`,
    feedEvents(group, dates, publicOrigin() ?? new URL(request.url).origin),
    now,
  );
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName(scheduleRequest.name)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
