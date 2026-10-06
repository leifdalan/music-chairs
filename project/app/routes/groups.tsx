import { Form, Link } from "react-router";

import { createGroupAction, timeZoneChoices } from "~/.server/create-group";
import { readAccount } from "~/.server/membership";
import { visitorGroups } from "~/.server/memberships";
import { getStore } from "~/.server/store";
import { ConfirmForm } from "~/components/confirm-form";
import { CreateGroupForm } from "~/components/create-group-form";
import { SubmitButton } from "~/components/submit-button";
import { buttonVariants } from "~/components/ui/button";
import { groupPath } from "~/lib/group-address";
import { deletionPrompt, LAST_ORGANIZER, leavePrompt } from "~/lib/group-prompts";
import { GROUP_NAME_MAX } from "~/lib/names";
import { pageMeta } from "~/lib/site";

import type { Route } from "./+types/groups";

export function meta() {
  return pageMeta("Your groups");
}

// The visitor's groups (plan/phase-19.2.md): this device's and the signed-in
// account's. Only what the page shows leaves the server: no group or member
// ids, device tokens, emails or invite links; each group is known by its path.
export async function loader({ request }: Route.LoaderArgs) {
  const store = getStore();
  const memberships = await visitorGroups(request, await readAccount(request));
  return {
    timeZones: timeZoneChoices(),
    groups: memberships
      .map(({ group, member }) => ({
        path: groupPath(group),
        name: group.name,
        timeZone: group.timeZone,
        role: member.role,
        displayName: member.displayName,
        lastOrganizer:
          member.role === "organizer" &&
          store.listMembers(group.id).filter((other) => other.role === "organizer").length <= 1,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function action({ request }: Route.ActionArgs) {
  return createGroupAction(request, await request.formData());
}

type GroupItem = Route.ComponentProps["loaderData"]["groups"][number];

export default function Groups({ loaderData, actionData }: Route.ComponentProps) {
  const { groups } = loaderData;
  return (
    <main>
      <h1>Your groups</h1>
      {groups.length === 0 ? (
        <p className="hint">
          No groups yet. Start one below, or open an invite link from your group's organizer.
        </p>
      ) : (
        <ul className="group-cards">
          {groups.map((group) => (
            <GroupCard key={group.path} group={group} />
          ))}
        </ul>
      )}
      <CreateGroupForm timeZones={loaderData.timeZones} result={actionData} />
    </main>
  );
}

/** One group: where to go in it, and renaming, leaving and deleting it. Each form posts to the group's page. */
function GroupCard({ group }: { group: GroupItem }) {
  const organizer = group.role === "organizer";
  return (
    <li className="group-card">
      <h2>
        <Link to={group.path}>{group.name}</Link>
      </h2>
      <p className="hint">
        You are {group.displayName} ({group.role}).
      </p>
      <p className="group-links">
        <Link to={`${group.path}/schedule`} className={buttonVariants({ size: "sm" })}>
          Schedule
        </Link>
        <Link
          to={`${group.path}/availability`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          My availability
        </Link>
      </p>
      <details>
        <summary>Manage this group</summary>
        <div className="stack">
          {organizer ? (
            <Form method="post" action={group.path} className="rename-form">
              <input type="hidden" name="intent" value="update-group" />
              <input type="hidden" name="timeZone" value={group.timeZone} />
              <input type="hidden" name="returnTo" value="/groups" />
              <div className="field">
                <label htmlFor={`rename-${group.path.slice(3)}`}>Group name</label>
                <input
                  id={`rename-${group.path.slice(3)}`}
                  name="name"
                  type="text"
                  required
                  maxLength={GROUP_NAME_MAX}
                  autoComplete="off"
                  defaultValue={group.name}
                />
              </div>
              <SubmitButton
                feedbackKey={`rename-${group.path.slice(3)}`}
                variant="outline"
                size="sm"
              >
                Rename
              </SubmitButton>
            </Form>
          ) : null}
          <div className="group-actions">
            {group.lastOrganizer ? (
              <p className="hint">You can't leave: {LAST_ORGANIZER}</p>
            ) : (
              <ConfirmForm
                action={group.path}
                fields={{ intent: "leave", returnTo: "/groups" }}
                trigger="Leave group"
                triggerSize="sm"
                {...leavePrompt(group.name)}
                feedbackKey={`leave-${group.path.slice(3)}`}
              />
            )}
            {organizer ? (
              <ConfirmForm
                action={group.path}
                fields={{ intent: "delete-group", returnTo: "/groups" }}
                trigger="Delete group"
                triggerVariant="outline-destructive"
                triggerSize="sm"
                {...deletionPrompt(group.name)}
                feedbackKey={`delete-${group.path.slice(3)}`}
              />
            ) : null}
          </div>
        </div>
      </details>
    </li>
  );
}
