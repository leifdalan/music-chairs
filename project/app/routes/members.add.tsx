import { data, Form, Link, redirect } from "react-router";

import { redirectWithToast } from "~/.server/flash";
import {
  CONTACTS_SCOPES,
  GoogleAccessRevoked,
  GoogleApiError,
  googleConfig,
  listContacts,
  type Contact,
} from "~/.server/google";
import { findViewer, readAccount } from "~/.server/membership";
import { getStore, type Group } from "~/.server/store";
import { SubmitButton } from "~/components/submit-button";
import { calendarNotice } from "~/lib/calendar-notices";
import { parsePerson } from "~/lib/contacts";
import { DISPLAY_NAME_MAX, validateName } from "~/lib/names";
import { sameName } from "~/lib/profile";
import { pageMeta } from "~/lib/site";
import { buttonVariants } from "~/components/ui/button";

import type { Route } from "./+types/members.add";

export function meta({ loaderData }: Route.MetaArgs) {
  return pageMeta(loaderData ? `Add members · ${loaderData.groupName}` : "Not found");
}

/** The group, for its organizers only: visitors go to the group page, members get 403. */
async function organizerGroup(request: Request, groupId: string): Promise<Group> {
  const group = getStore().findGroup(groupId);
  if (!group) throw data(null, { status: 404 });
  const viewer = await findViewer(request, group);
  if (!viewer) throw redirect(`/g/${group.id}`);
  if (viewer.role !== "organizer") throw data(null, { status: 403 });
  return group;
}

type Suggestions =
  | { state: "sign-in" }
  | { state: "connect"; connectUrl: string }
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
  const connectUrl = `/auth/google/calendar?scope=contacts&returnTo=${encodeURIComponent(`/g/${group.id}/members/add`)}`;
  if (!getStore().findGrant(account.id)?.scopes.includes(CONTACTS_SCOPES.saved)) {
    return { state: "connect", connectUrl };
  }
  try {
    return { state: "ready", contacts: await listContacts(account.id) };
  } catch (error) {
    if (error instanceof GoogleAccessRevoked) return { state: "connect", connectUrl };
    if (!(error instanceof GoogleApiError)) throw error;
    console.warn("music-chairs: reading Google contacts failed");
    return { state: "error" };
  }
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const group = await organizerGroup(request, params.groupId);
  return {
    groupId: group.id,
    groupName: group.name,
    notice: calendarNotice(request),
    suggestions: await suggestions(request, group),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const group = await organizerGroup(request, params.groupId);
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
  return redirectWithToast(`/g/${group.id}/members/add`, `Added ${name.value}`);
}

export default function AddMembers({ loaderData, actionData }: Route.ComponentProps) {
  const { groupId, groupName, notice, suggestions: offered } = loaderData;
  const contacts = offered?.state === "ready" ? offered.contacts : [];
  return (
    <main>
      <p className="eyebrow">
        <Link to={`/g/${groupId}`}>{groupName}</Link>
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
      {offered?.state === "connect" ? (
        <p>
          <a className={buttonVariants({ variant: "outline" })} href={offered.connectUrl}>
            Use your Google contacts
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
      <Form method="post" className="stack" replace>
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
            defaultValue={actionData?.value}
            aria-invalid={actionData?.error ? true : undefined}
            aria-describedby={actionData?.error ? "person-error" : undefined}
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
          {actionData?.error ? (
            <p className="field-error" id="person-error" role="alert">
              {actionData.error}
            </p>
          ) : null}
        </div>
        <SubmitButton feedbackKey="add-member">Add</SubmitButton>
      </Form>
      <p>
        <Link to={`/g/${groupId}`}>Back to the group</Link>
      </p>
    </main>
  );
}
