// Starting a group (plan/phase-2.md), from the home page or the groups page
// (plan/phase-19.2.md): each page's action runs this, so a rejected form shows
// its errors on the page it came from.

import { data } from "react-router";

import { canonicalTimeZone } from "~/lib/availability";
import { groupPath } from "~/lib/group-address";
import { DISPLAY_NAME_MAX, GROUP_NAME_MAX, validateName } from "~/lib/names";

import { redirectWithToast } from "./flash";
import { readAccount, rememberMembership } from "./membership";
import { getStore } from "./store";

/** Creates the group with the visitor as organizer and opens it, or returns the form's errors. */
export async function createGroupAction(request: Request, form: FormData) {
  const groupName = validateName(form.get("groupName"), "Group name", GROUP_NAME_MAX);
  const displayName = validateName(form.get("displayName"), "Your name", DISPLAY_NAME_MAX);
  const timeZone = canonicalTimeZone(form.get("timeZone"));
  if (!groupName.ok || !displayName.ok || !timeZone) {
    return data(
      {
        errors: {
          groupName: groupName.ok ? undefined : groupName.error,
          displayName: displayName.ok ? undefined : displayName.error,
          timeZone: timeZone ? undefined : "Choose the group's time zone.",
        },
        values: {
          groupName: String(form.get("groupName") ?? ""),
          displayName: String(form.get("displayName") ?? ""),
          timeZone: String(form.get("timeZone") ?? ""),
        },
      },
      { status: 400 },
    );
  }
  const account = await readAccount(request);
  const { group, organizer } = getStore().createGroup(
    groupName.value,
    displayName.value,
    timeZone,
    account?.id ?? null,
  );
  return redirectWithToast(groupPath(group), "Group created", {
    headers: { "Set-Cookie": await rememberMembership(request, group.id, organizer.deviceToken) },
  });
}

/** Every zone the create form offers, built on the server so the server render and hydration agree. */
export function timeZoneChoices(): string[] {
  return ["UTC", ...Intl.supportedValuesOf("timeZone")];
}
