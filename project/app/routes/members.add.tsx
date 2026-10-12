import { data, Form, Link, redirect } from "react-router";

import { groupFromAddress } from "~/.server/group-address";
import { redirectWithToast } from "~/.server/flash";
import {
  CONTACTS_SCOPES,
  GoogleAccessRevoked,
  accessRevoked,
  googleConfig,
  listContacts,
  type Contact,
} from "~/.server/google";
import { findViewer, readAccount } from "~/.server/membership";
import { getStore, type Group } from "~/.server/store";
import { SubmitButton } from "~/components/submit-button";
import { groupPath } from "~/lib/group-address";
import { CONTACTS_NOTICE_KEYS, noticeText, type NoticeHandle } from "~/lib/notices";
import { parsePerson } from "~/lib/contacts";
import { DISPLAY_NAME_MAX, validateName } from "~/lib/names";
import { sameName } from "~/lib/profile";
import { pageMeta } from "~/lib/site";
import { buttonVariants } from "~/components/ui/button";

import type { Route } from "./+types/members.add";
import { useActionResult, withFailures } from "~/lib/client-failure";
import { PageFailure } from "~/components/failure-alert";

export function meta({ loaderData }: Route.MetaArgs) {
  return pageMeta(loaderData ? `Add members · ${loaderData.groupName}` : "Not found");
}

/** The group, for its organizers only: visitors go to the group page, members get 403. */
async function organizerGroup(request: Request, address: string): Promise<Group> {
  const group = groupFromAddress(request, address);
  const viewer = await findViewer(request, group);
  if (!viewer) throw redirect(groupPath(group));
  if (viewer.role !== "organizer") throw data(null, { status: 403 });
  return group;
}

type Suggestions =
  | { state: "sign-in" }
  | { state: "connect"; connectUrl: string; revoked?: boolean }
  | { state: "error" }
  | { state: "ready"; contacts: Contact[] };

/**
 * The organizer's own contacts as suggestions, read only here (never on the
 * group page) and only after they allowed it. Failures log no addresses.
 */
async function suggestions(request: Request, group: Group): Promise<Suggestions | null> {
  if (googleConfig() === null) return null;
  const account = await readAccount(request);
  if (!account) return { state: "sign-in" };
  const connectUrl = `/auth/google/calendar?scope=contacts&returnTo=${encodeURIComponent(`${groupPath(group)}/members/add`)}`;
  const reconnect = () =>
    ({ state: "connect", connectUrl, revoked: accessRevoked(account.id) }) as const;
  if (!getStore().findGrant(account.id)?.scopes.includes(CONTACTS_SCOPES.saved)) {
    return reconnect();
  }
  try {
    return { state: "ready", contacts: await listContacts(account.id) };
  } catch (error) {
    if (error instanceof GoogleAccessRevoked) return reconnect();
    // Whatever went wrong, the page still opens, saying so (plan/phase-34.md).
    console.warn("music-chairs: reading Google contacts failed");
    return { state: "error" };
  }
}

/** Google contacts notices show above the suggestions they're about. */
export const handle: NoticeHandle = { notices: CONTACTS_NOTICE_KEYS };

export async function loader({ request, params }: Route.LoaderArgs) {
  const group = await organizerGroup(request, params.groupAddress);
  return {
    groupHref: groupPath(group),
    groupName: group.name,
    notice: noticeText(request, CONTACTS_NOTICE_KEYS),
    suggestions: await suggestions(request, group),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const group = await organizerGroup(request, params.groupAddress);
  const store = getStore();
  const form = await request.formData();
  const value = String(form.get("person") ?? "");
  const refuse = (error: string) => data({ error, value }, { status: 400 });
  const person = parsePerson(form.get("person"));
  if (!person.ok) return refuse(person.error);
  const name = validateName(person.name, "Name", DISPLAY_NAME_MAX);
  if (!name.ok) return refuse(name.error);
  const members = store.listMembers(group.id);
  const sameNamed = members.find((member) => sameName(member.displayName, name.value));
  if (sameNamed) {
    return refuse(
      `Someone called ${sameNamed.displayName} is already in the group. Rename one first.`,
    );
  }
  if (
    person.email &&
    members.some(
      (member) =>
        member.invitedEmail === person.email || member.googleEmail?.toLowerCase() === person.email,
    )
  ) {
    return refuse("Someone with that email is already in the group.");
  }
  try {
    store.addInvitedMember(group.id, name.value, person.email);
  } catch (error) {
    // A second submission lost the race to the one-invitation-per-email rule.
    const invited = store
      .listMembers(group.id)
      .some((member) => member.invitedEmail === person.email);
    if (person.email && invited) return refuse("Someone with that email is already in the group.");
    throw error;
  }
  return redirectWithToast(`${groupPath(group)}/members/add`, `Added ${name.value}`);
}

// In the browser a failed save stays on the page with Retry (plan/phase-34.md);
// sending these again could make something twice, so they offer Reload instead.
export async function clientAction(args: Route.ClientActionArgs) {
  return withFailures(args, { creates: ["(default)"] });
}

export default function AddMembers({ loaderData, actionData }: Route.ComponentProps) {
  // A failed save keeps the last result's errors and values (plan/phase-34.md).
  const { result: kept, failure } = useActionResult(actionData);
  const { groupHref, groupName, notice, suggestions: offered } = loaderData;
  const contacts = offered?.state === "ready" ? offered.contacts : [];
  return (
    <main>
      <PageFailure failure={failure} />
      <p className="eyebrow">
        <Link to={groupHref}>{groupName}</Link>
      </p>
      <h1>Add members</h1>
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      <p className="hint">
        Type a name: that person gets in by typing the same name on the invite link. Or pick someone
        from your Google contacts: they get in by signing in with that Google account.
      </p>
      {offered?.state === "connect" && offered.revoked ? (
        <p className="field-error" role="alert">
          Google contacts access was removed, so there are no suggestions. Reconnect to see them
          again.
        </p>
      ) : null}
      {offered?.state === "connect" ? (
        <p>
          <a className={buttonVariants({ variant: "outline" })} href={offered.connectUrl}>
            {offered.revoked ? "Reconnect your Google contacts" : "Use your Google contacts"}
          </a>
        </p>
      ) : null}
      {offered?.state === "sign-in" ? (
        <p className="hint">Sign in with Google to pick people from your contacts.</p>
      ) : null}
      {offered?.state === "error" ? (
        <p className="field-error" role="alert">
          Couldn&apos;t read your Google contacts right now; you can still type a name.
        </p>
      ) : null}
      {offered?.state === "ready" && contacts.length === 0 ? (
        <p className="hint">No contacts with an email address were found; type a name instead.</p>
      ) : null}
      <Form method="post" className="stack" replace preventScrollReset>
        <div className="field">
          <label htmlFor="person">Name, or a contact</label>
          <input
            id="person"
            name="person"
            type="text"
            required
            autoComplete="off"
            list={contacts.length > 0 ? "contact-suggestions" : undefined}
            placeholder={contacts.length > 0 ? "Start typing a name" : "Sam Smith"}
            defaultValue={kept?.value}
            aria-invalid={kept?.error ? true : undefined}
            aria-describedby={kept?.error ? "person-error" : undefined}
          />
          {contacts.length > 0 ? (
            <datalist id="contact-suggestions">
              {contacts.map((contact) => (
                <option
                  key={contact.email}
                  value={`${contact.name} <${contact.email}>`.trimStart()}
                />
              ))}
            </datalist>
          ) : null}
          {kept?.error ? (
            <p className="field-error" id="person-error" role="alert">
              {kept.error}
            </p>
          ) : null}
        </div>
        <SubmitButton feedbackKey="add-member">Add</SubmitButton>
      </Form>
      <p>
        <Link to={groupHref} className="back-link">
          Back to the group
        </Link>
      </p>
    </main>
  );
}
