import { redirect } from "react-router";

import { calendarDates, feedEvents } from "~/.server/calendar-sync";
import { findViewer, publicOrigin } from "~/.server/membership";
import { requestProgress } from "~/.server/progress";
import { groupFromAddress } from "~/.server/group-address";
import { requestFromSlug } from "~/.server/request-address";
import { groupPath } from "~/lib/group-address";
import { withNotice } from "~/lib/notices";
import { requestPath } from "~/lib/request-address";
import { addDays, todayInZone } from "~/lib/availability";
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
 * for this request (minus those they said No to), from four weeks back on.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const group = groupFromAddress(request, params.groupAddress);
  const viewer = await findViewer(request, group);
  if (!viewer) throw redirect(groupPath(group));
  const scheduleRequest = requestFromSlug(group, params.requestSlug);
  const now = new Date();
  const today = todayInZone(group.timeZone, now);
  const progress = requestProgress(group, today).find(
    (item) => item.requestId === scheduleRequest.id,
  );
  // An old or early link goes to the request, saying why there's no file (plan/phase-34.md).
  if (!progress?.complete) {
    throw redirect(
      withNotice(requestPath(groupPath(group), scheduleRequest.slug), "ics-unavailable"),
    );
  }
  const dates = calendarDates(group, viewer.id, addDays(today, -28)).filter(
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
