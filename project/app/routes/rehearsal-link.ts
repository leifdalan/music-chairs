import { redirect } from "react-router";

import { findViewer } from "~/.server/membership";
import { findRehearsalBySlug, landOrJoin, linkedGroup, linkGone } from "~/.server/request-address";
import { getStore } from "~/.server/store";
import { groupPath } from "~/lib/group-address";

import type { Route } from "./+types/rehearsal-link";

/**
 * A proposed rehearsal's link (plan/phase-30.md): a member lands on its card on
 * the schedule, where they answer Yes, No or Maybe; a visitor holding the
 * group's invite code joins first, then lands there.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const group = linkedGroup(request, params.groupAddress);
  // Visitors are sent on before the address is looked up, so it reveals nothing.
  if (!(await findViewer(request, group))) landOrJoin(request, group, false);
  const schedule = `${groupPath(group)}/schedule`;
  const scheduleRequest = getStore().findRequestBySlug(group.id, params.requestSlug);
  if (!scheduleRequest) throw linkGone(schedule);
  const rehearsal = findRehearsalBySlug(group, scheduleRequest.id, params.rehearsalSlug);
  if (!rehearsal) throw linkGone(schedule);
  throw redirect(`${schedule}#rehearsal-${rehearsal.id}`);
}
