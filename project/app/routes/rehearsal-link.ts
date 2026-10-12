import { data, redirect } from "react-router";

import { groupFromAddress } from "~/.server/group-address";
import { findViewer } from "~/.server/membership";
import { findRehearsalBySlug, landOrJoin, requestFromSlug } from "~/.server/request-address";
import { groupPath } from "~/lib/group-address";

import type { Route } from "./+types/rehearsal-link";

/**
 * A proposed rehearsal's link (plan/phase-30.md): a member lands on its card on
 * the schedule, where they answer Yes, No or Maybe; a visitor holding the
 * group's invite code joins first, then lands there.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const group = groupFromAddress(request, params.groupAddress);
  // Visitors are sent on before the address is looked up, so it reveals nothing.
  if (!(await findViewer(request, group))) landOrJoin(request, group, false);
  const scheduleRequest = requestFromSlug(group, params.requestSlug);
  const rehearsal = findRehearsalBySlug(group, scheduleRequest.id, params.rehearsalSlug);
  if (!rehearsal) throw data(null, { status: 404 });
  throw redirect(`${groupPath(group)}/schedule#rehearsal-${rehearsal.id}`);
}
