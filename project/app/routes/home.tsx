import { data, Form, redirect, useNavigation } from "react-router";

import { rememberMembership } from "~/.server/membership";
import { getStore } from "~/.server/store";
import { TextField } from "~/components/text-field";
import { DISPLAY_NAME_MAX, GROUP_NAME_MAX, validateName } from "~/lib/names";
import { pageMeta, siteName, siteTagline } from "~/lib/site";

import type { Route } from "./+types/home";

export function meta() {
  return pageMeta();
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const groupName = validateName(form.get("groupName"), "Group name", GROUP_NAME_MAX);
  const displayName = validateName(form.get("displayName"), "Your name", DISPLAY_NAME_MAX);
  if (!groupName.ok || !displayName.ok) {
    return data(
      {
        errors: {
          groupName: groupName.ok ? undefined : groupName.error,
          displayName: displayName.ok ? undefined : displayName.error,
        },
        values: {
          groupName: String(form.get("groupName") ?? ""),
          displayName: String(form.get("displayName") ?? ""),
        },
      },
      { status: 400 },
    );
  }
  const { group, organizer } = getStore().createGroup(groupName.value, displayName.value);
  return redirect(`/g/${group.id}`, {
    headers: { "Set-Cookie": await rememberMembership(request, group.id, organizer.id) },
  });
}

export default function Home({ actionData }: Route.ComponentProps) {
  // A second tap before the group page has loaded would create a second group,
  // so the button stays disabled through the redirect's loading phase too.
  const busy = useNavigation().state !== "idle";
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
          <button type="submit" disabled={busy}>
            Create group
          </button>
        </Form>
      </section>
    </main>
  );
}
