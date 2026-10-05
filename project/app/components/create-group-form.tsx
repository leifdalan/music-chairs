import { useState, useSyncExternalStore } from "react";
import { Form } from "react-router";

import { SubmitButton } from "./submit-button";
import { TextField } from "./text-field";

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

export type CreateGroupResult = {
  errors: { groupName?: string; displayName?: string; timeZone?: string };
  values: { groupName: string; displayName: string; timeZone: string };
};

/**
 * "Start a group" (plan/phase-19.2.md): on the home page for a visitor with
 * no groups, and on the groups page. It posts to the page it is on.
 */
export function CreateGroupForm({
  timeZones,
  result,
}: {
  timeZones: string[];
  result: CreateGroupResult | undefined;
}) {
  // A second tap before the group page has loaded would create a second group;
  // SubmitButton keeps the pressed button inert until the next page has loaded.
  const browserZone = useBrowserTimeZone();
  const [chosenZone, setChosenZone] = useState<string | null>(null);
  const timeZone = chosenZone ?? (result?.values.timeZone || browserZone || "");
  const zones =
    browserZone && !timeZones.includes(browserZone) ? [browserZone, ...timeZones] : timeZones;
  const zoneError = result?.errors.timeZone;
  return (
    <section aria-labelledby="create-heading">
      <h2 id="create-heading">Start a group</h2>
      <Form method="post" className="stack">
        <TextField
          name="groupName"
          label="Group name"
          defaultValue={result?.values.groupName}
          error={result?.errors.groupName}
        />
        <TextField
          name="displayName"
          label="Your name"
          defaultValue={result?.values.displayName}
          error={result?.errors.displayName}
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
        <SubmitButton feedbackKey="create-group">Create group</SubmitButton>
      </Form>
    </section>
  );
}
