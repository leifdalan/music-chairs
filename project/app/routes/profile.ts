import { redirect } from "react-router";

import { redirectWithToast } from "~/.server/flash";
import { findViewer, safeReturnTo } from "~/.server/membership";
import { groupFromAddress } from "~/.server/group-address";
import { getStore } from "~/.server/store";
import { groupPath } from "~/lib/group-address";
import { DISPLAY_NAME_MAX, validateName } from "~/lib/names";
import { validateInstrument } from "~/lib/profile";

import type { Route } from "./+types/profile";

/**
 * Saves the viewer's own name and instrumentation in a group, from the
 * profile menu. It always goes back to the page the menu was on, with a toast
 * saying it was saved or what was wrong, so it works without JavaScript.
 */
export async function action({ request, params }: Route.ActionArgs) {
  const store = getStore();
  const group = groupFromAddress(request, params.groupAddress);
  const viewer = await findViewer(request, group);
  if (!viewer) throw redirect(groupPath(group));
  const form = await request.formData();
  const back = safeReturnTo(form.get("returnTo"), request);
  const name = validateName(form.get("displayName"), "Your name", DISPLAY_NAME_MAX);
  const instrument = validateInstrument(form.get("instrument"));
  if (!name.ok) return redirectWithToast(back, name.error);
  if (!instrument.ok) return redirectWithToast(back, instrument.error);
  store.setProfile(group.id, viewer.id, { displayName: name.value, instrument: instrument.value });
  return redirectWithToast(back, "Profile saved");
}

export function loader({ request, params }: Route.LoaderArgs) {
  return redirect(groupPath(groupFromAddress(request, params.groupAddress)));
}
