import { useState, useSyncExternalStore } from "react";
import { data, Form, redirect, useNavigation } from "react-router";

import { rememberMembership } from "~/.server/membership";
import { getStore } from "~/.server/store";
import { TextField } from "~/components/text-field";
import { canonicalTimeZone } from "~/lib/availability";
import { DISPLAY_NAME_MAX, GROUP_NAME_MAX, validateName } from "~/lib/names";
import { pageMeta, siteName, siteTagline } from "~/lib/site";

import type { Route } from "./+types/home";

// The browser's zone, which the server can't know: null during the server
// render and hydration, then the detected zone.
const noSubscription = () => () => {};
function useBrowserTimeZone(): string | null {
  return useSyncExternalStore(
    noSubscription,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
}

export function meta() {
  return pageMeta();
}

// Built on the server so the server render and hydration list the same options.
export function loader() {
  return { timeZones: ["UTC", ...Intl.supportedValuesOf("timeZone")] };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
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
  const { group, organizer } = getStore().createGroup(groupName.value, displayName.value, timeZone);
  return redirect(`/g/${group.id}`, {
    headers: { "Set-Cookie": await rememberMembership(request, group.id, organizer.deviceToken) },
  });
}

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  // A second tap before the group page has loaded would create a second group,
  // so the button stays disabled through the redirect's loading phase too.
  const busy = useNavigation().state !== "idle";
  const browserZone = useBrowserTimeZone();
  const [chosenZone, setChosenZone] = useState<string | null>(null);
  const timeZone = chosenZone ?? (actionData?.values.timeZone || browserZone || "");
  const zones =
    browserZone && !loaderData.timeZones.includes(browserZone)
      ? [browserZone, ...loaderData.timeZones]
      : loaderData.timeZones;
  const zoneError = actionData?.errors.timeZone;
  return (
    <main>
      <h1>{siteName}</h1>
      <p>{siteTagline}</p>
      <section aria-labelledby="create-heading">
        <h2 id="create-heading">Start a group</h2>
        <Form method="post" className="stack">
          <TextField
            name="groupName"
            label="Group name"
            defaultValue={actionData?.values.groupName}
            error={actionData?.errors.groupName}
          />
          <TextField
            name="displayName"
            label="Your name"
            defaultValue={actionData?.values.displayName}
            error={actionData?.errors.displayName}
          />
          <div className="field">
            <label htmlFor="timeZone">Time zone</label>
            <select
              id="timeZone"
              name="timeZone"
              required
              value={timeZone}
              onChange={(event) => setChosenZone(event.target.value)}
              aria-invalid={zoneError ? true : undefined}
              aria-describedby={zoneError ? "timeZone-error" : "timeZone-hint"}
            >
              <option value="">Choose your time zone</option>
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            {zoneError ? (
              <p className="field-error" id="timeZone-error" role="alert">
                {zoneError}
              </p>
            ) : (
              <p className="hint" id="timeZone-hint">
                Everyone in the group enters and sees times in this zone.
              </p>
            )}
          </div>
          <button type="submit" disabled={busy}>
            Create group
          </button>
        </Form>
      </section>
    </main>
  );
}
