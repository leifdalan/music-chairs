import { useState, useSyncExternalStore } from "react";
import { data, Form, Link } from "react-router";

import { googleConfig } from "~/.server/google";
import { redirectWithToast } from "~/.server/flash";
import { readAccount, rememberMembership } from "~/.server/membership";
import { getStore } from "~/.server/store";
import { SubmitButton } from "~/components/submit-button";
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

const NOTICES: Record<string, string> = {
  "signin-cancelled": "Google sign-in was cancelled.",
  "signin-failed": "Google sign-in didn't work. Please try again.",
};

// Time zones are built on the server so the server render and hydration list
// the same options. A signed-in visitor also gets their groups back.
export async function loader({ request }: Route.LoaderArgs) {
  const account = await readAccount(request);
  const notice = new URL(request.url).searchParams.get("notice");
  return {
    timeZones: ["UTC", ...Intl.supportedValuesOf("timeZone")],
    signInAvailable: googleConfig() !== null,
    account: account ? { name: account.name, email: account.email } : null,
    groups: account
      ? getStore()
          .listAccountMemberships(account.id)
          .map(({ group, member }) => ({
            id: group.id,
            name: group.name,
            displayName: member.displayName,
          }))
      : [],
    notice: notice ? (NOTICES[notice] ?? null) : null,
  };
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
  const account = await readAccount(request);
  const { group, organizer } = getStore().createGroup(
    groupName.value,
    displayName.value,
    timeZone,
    account?.id ?? null,
  );
  return redirectWithToast(`/g/${group.id}`, "Group created", {
    headers: { "Set-Cookie": await rememberMembership(request, group.id, organizer.deviceToken) },
  });
}

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  // A second tap before the group page has loaded would create a second group;
  // SubmitButton keeps the pressed button inert until the next page has loaded.
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
      {loaderData.notice ? (
        <p className="notice" role="status">
          {loaderData.notice}
        </p>
      ) : null}
      <AccountPanel
        account={loaderData.account}
        groups={loaderData.groups}
        signInAvailable={loaderData.signInAvailable}
      />
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
          <SubmitButton feedbackKey="create-group">Create group</SubmitButton>
        </Form>
      </section>
    </main>
  );
}

function AccountPanel({
  account,
  groups,
  signInAvailable,
}: {
  account: { name: string; email: string } | null;
  groups: { id: string; name: string; displayName: string }[];
  signInAvailable: boolean;
}) {
  if (!account) {
    return signInAvailable ? (
      <section className="account" aria-labelledby="account-heading">
        <h2 id="account-heading">Already in a group?</h2>
        <p className="hint">Sign in to open the groups you linked to your Google account.</p>
        <a className="button-link secondary" href="/auth/google">
          Sign in with Google
        </a>
      </section>
    ) : null;
  }
  return (
    <section className="account" aria-labelledby="account-heading">
      <h2 id="account-heading">Your groups</h2>
      <p className="hint">
        Signed in with Google as <strong>{account.email}</strong>.
      </p>
      {groups.length > 0 ? (
        <ul className="your-groups">
          {groups.map((group) => (
            <li key={group.id}>
              <Link to={`/g/${group.id}`}>{group.name}</Link>{" "}
              <span className="hint">as {group.displayName}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">
          No groups linked yet. Open a group you joined and sign in from there to link it.
        </p>
      )}
      <Form method="post" action="/auth/sign-out">
        <SubmitButton feedbackKey="sign-out" className="secondary small">
          Sign out
        </SubmitButton>
      </Form>
    </section>
  );
}
