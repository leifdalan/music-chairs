import { useRef, useState } from "react";
import { data, Form, Link, redirect } from "react-router";

import { redirectWithToast } from "~/.server/flash";
import { googleConfig } from "~/.server/google";
import { findViewer, publicOrigin, readAccount } from "~/.server/membership";
import { getStore } from "~/.server/store";
import { ProblemAlert } from "~/components/problem-alert";
import { SubmitButton } from "~/components/submit-button";
import { formatDate, todayInZone } from "~/lib/availability";
import { pageMeta } from "~/lib/site";

import type { Route } from "./+types/group";

export function meta({ loaderData }: Route.MetaArgs) {
  return pageMeta(loaderData ? loaderData.groupName : "Not found");
}

/** The sentence for a `notice` left by Google sign-in, if any. */
async function signInNotice(request: Request, groupId: string, viewerName: string | undefined) {
  const notice = new URL(request.url).searchParams.get("notice");
  if (notice === "linked") return "Linked to your Google account.";
  if (notice !== "account-taken") return null;
  const account = await readAccount(request);
  const taken = account ? getStore().findMemberByAccount(groupId, account.id) : null;
  return taken
    ? `This Google account is already ${taken.displayName} in this group, so ${viewerName ?? "this device's member"} stays name-only.`
    : null;
}

// Device tokens identify a device's membership (see `.server/membership.ts`)
// and never leave the server. Organizers also get member ids, optional tags and
// linked Google emails for their controls; members and visitors get names,
// roles and whether each member signs in with Google. A member sees their own
// email only. Requests go to members only: each with whether the viewer has
// answered, and for organizers how many have.
export async function loader({ request, params }: Route.LoaderArgs) {
  const store = getStore();
  const group = store.findGroup(params.groupId);
  if (!group) throw data(null, { status: 404 });
  const viewer = await findViewer(request, group);
  const account = await readAccount(request);
  const isOrganizer = viewer?.role === "organizer";
  const today = todayInZone(group.timeZone, new Date());
  const memberCount = store.listMembers(group.id).length;
  const requests = viewer
    ? store
        .listRequests(group.id)
        .filter((item) => isOrganizer || (item.open && item.endDate >= today))
        .map((item) => ({
          id: item.id,
          name: item.name,
          startDate: item.startDate,
          endDate: item.endDate,
          current: item.open && item.endDate >= today,
          answered: store
            .listAnswers(group.id, item.id)
            .some((answer) => answer.memberId === viewer.id),
          answerCount: isOrganizer ? item.answerCount : null,
        }))
    : null;
  return {
    requests,
    memberCount: isOrganizer ? memberCount : null,
    groupId: group.id,
    groupName: group.name,
    timeZone: group.timeZone,
    members: store.listMembers(group.id).map((member) => ({
      displayName: member.displayName,
      role: member.role,
      isViewer: member.id === viewer?.id,
      google: member.googleEmail !== null,
      manage: isOrganizer
        ? { id: member.id, optional: member.optional, email: member.googleEmail }
        : null,
    })),
    viewer: viewer
      ? { displayName: viewer.displayName, role: viewer.role, email: viewer.googleEmail }
      : null,
    // Offer sign-in to a name-only member unless this browser's account is
    // already someone else here (signing in again could only be refused).
    signInAvailable:
      googleConfig() !== null &&
      !(viewer && account && store.findMemberByAccount(group.id, account.id)),
    notice: await signInNotice(request, group.id, viewer?.displayName),
    showNames: isOrganizer ? group.showNames : null,
    inviteUrl: isOrganizer
      ? new URL(`/join/${group.inviteToken}`, publicOrigin() ?? request.url).href
      : null,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const store = getStore();
  const group = store.findGroup(params.groupId);
  if (!group) throw data(null, { status: 404 });
  const viewer = await findViewer(request, group);
  if (!viewer) throw redirect(`/g/${group.id}`);
  if (viewer.role !== "organizer") throw data(null, { status: 403 });
  const form = await request.formData();
  const intent = form.get("intent");
  const memberId = String(form.get("memberId") ?? "");
  const on = form.get("value") === "on";
  const back = (message: string) => redirectWithToast(`/g/${group.id}`, message);
  if (intent === "set-privacy") {
    store.setShowNames(group.id, on);
    return back(on ? "Members now see who is free" : "Members now see counts only");
  }
  if (intent === "set-optional") {
    if (!store.setOptional(group.id, memberId, on)) throw data(null, { status: 404 });
    return back(on ? "Marked optional" : "Marked required");
  }
  if (intent === "set-role") {
    const result = store.setRole(group.id, memberId, on ? "organizer" : "member");
    if (result === "unknown") throw data(null, { status: 404 });
    if (result === "last-organizer") {
      return data(
        { problem: "A group needs at least one organizer. Make someone else an organizer first." },
        { status: 400 },
      );
    }
    return back(on ? "Made an organizer" : "Organizer removed");
  }
  return data({ problem: "Something went wrong with that request." }, { status: 400 });
}

export default function GroupPage({ loaderData, actionData }: Route.ComponentProps) {
  const {
    groupName,
    timeZone,
    members,
    viewer,
    showNames,
    inviteUrl,
    signInAvailable,
    notice,
    requests,
    memberCount,
  } = loaderData;
  return (
    <main>
      <h1>{groupName}</h1>
      <p className="hint">Times in {timeZone}</p>
      {viewer ? (
        <>
          <p className="hint">
            You are <strong>{viewer.displayName}</strong> ({viewer.role}).
            {viewer.email ? (
              <>
                {" "}
                Linked to Google as <strong>{viewer.email}</strong>.
              </>
            ) : null}
          </p>
          {!viewer.email && signInAvailable ? (
            <p className="hint">
              <a
                className="button-link secondary small"
                href={`/auth/google?returnTo=${encodeURIComponent(`/g/${loaderData.groupId}`)}`}
              >
                Sign in with Google
              </a>{" "}
              to open this group on your other devices.
            </p>
          ) : null}
          <p className="group-links">
            <Link to="schedule" relative="path" className="button-link">
              Schedule
            </Link>
            <Link to="availability" relative="path" className="button-link secondary">
              My availability
            </Link>
          </p>
        </>
      ) : (
        <p className="notice">
          You haven't joined this group on this device. Ask an organizer for the invite link.
        </p>
      )}
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      {actionData?.problem ? (
        <ProblemAlert message={actionData.problem} response={actionData} />
      ) : null}
      {requests ? <RequestsSection requests={requests} memberCount={memberCount} /> : null}
      {inviteUrl ? <InvitePanel inviteUrl={inviteUrl} /> : null}
      {showNames !== null ? (
        <section className="invite" aria-labelledby="privacy-heading">
          <h2 id="privacy-heading">What members see</h2>
          <p className="hint">
            {showNames
              ? "Members see who is free at each time."
              : "Members see only how many people are free at each time."}
          </p>
          <Toggle intent="set-privacy" setTo={!showNames}>
            {showNames ? "Show only counts" : "Show names to members"}
          </Toggle>
        </section>
      ) : null}
      <section aria-labelledby="members-heading">
        <h2 id="members-heading">Members ({members.length})</h2>
        <ul className="members">
          {members.map((member, index) => (
            <li key={index}>
              <span className="member-name">
                {member.displayName}
                {member.isViewer ? " (you)" : ""}
                {member.google ? (
                  <span className="google-mark" title="Signs in with Google">
                    {" "}
                    · Google
                  </span>
                ) : null}
                {member.manage?.email ? (
                  <span className="member-email"> {member.manage.email}</span>
                ) : null}
              </span>
              <span className={`role role-${member.role}`}>
                {member.role}
                {member.manage?.optional ? ", optional" : ""}
              </span>
              {member.manage ? (
                <div className="member-controls">
                  <Toggle
                    intent="set-optional"
                    memberId={member.manage.id}
                    setTo={!member.manage.optional}
                    label={`${member.manage.optional ? "Make required" : "Make optional"}: ${member.displayName}`}
                  >
                    {member.manage.optional ? "Make required" : "Make optional"}
                  </Toggle>
                  <Toggle
                    intent="set-role"
                    memberId={member.manage.id}
                    setTo={member.role !== "organizer"}
                    label={`${member.role === "organizer" ? "Remove organizer" : "Make organizer"}: ${member.displayName}`}
                  >
                    {member.role === "organizer" ? "Remove organizer" : "Make organizer"}
                  </Toggle>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

type RequestItem = NonNullable<Route.ComponentProps["loaderData"]["requests"]>[number];

/** Open requests for everyone in the group; organizers also start, count and repeat them. */
function RequestsSection({
  requests,
  memberCount,
}: {
  requests: RequestItem[];
  /** Organizers only. */
  memberCount: number | null;
}) {
  const organizer = memberCount !== null;
  const current = requests.filter((item) => item.current);
  const past = requests.filter((item) => !item.current);
  const span = (item: RequestItem) =>
    `${formatDate(item.startDate)} to ${formatDate(item.endDate)}`;
  return (
    <section aria-labelledby="requests-heading">
      <h2 id="requests-heading">Requests</h2>
      {current.length === 0 ? (
        <p className="hint">
          {organizer
            ? "Ask the band when they can rehearse between two dates."
            : "No open requests from your organizers."}
        </p>
      ) : (
        <ul className="requests">
          {current.map((item) => (
            <li key={item.id}>
              <Link to={`requests/${item.id}`} relative="path" className="request-name">
                {item.name}
              </Link>
              <span className="hint"> {span(item)}</span>
              <span className={item.answered ? "request-answered" : "request-unanswered"}>
                {item.answered ? "Answered" : "Not answered yet"}
              </span>
              {item.answerCount !== null ? (
                <span className="hint">
                  {item.answerCount} of {memberCount} answered
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {organizer ? (
        <>
          <p>
            <Link to="requests/new" relative="path" className="button-link secondary">
              New request
            </Link>
          </p>
          {past.length > 0 ? (
            <details>
              <summary>Past and closed requests ({past.length})</summary>
              <ul className="requests">
                {past.map((item) => (
                  <li key={item.id}>
                    <Link to={`requests/${item.id}`} relative="path" className="request-name">
                      {item.name}
                    </Link>
                    <span className="hint"> {span(item)}</span>
                    <Link
                      to={`requests/new?repeat=${item.id}`}
                      relative="path"
                      className="button-link secondary small"
                      aria-label={`Repeat request: ${item.name}`}
                    >
                      Repeat
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/** A one-button form that sets an organizer setting on or off (`setTo`). */
function Toggle({
  intent,
  memberId,
  setTo,
  label,
  children,
}: {
  intent: string;
  memberId?: string;
  setTo: boolean;
  /** Accessible name when the visible text alone doesn't say who it affects. */
  label?: string;
  children: string;
}) {
  return (
    <Form method="post" replace>
      <input type="hidden" name="intent" value={intent} />
      {memberId ? <input type="hidden" name="memberId" value={memberId} /> : null}
      <input type="hidden" name="value" value={setTo ? "on" : "off"} />
      <SubmitButton
        feedbackKey={`${intent}-${memberId ?? "group"}`}
        className="secondary small"
        label={label}
      >
        {children}
      </SubmitButton>
    </Form>
  );
}

function InvitePanel({ inviteUrl }: { inviteUrl: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      // The Clipboard API exists only in secure contexts; over plain HTTP
      // (a phone on the local network) this throws and the fallback runs.
      await navigator.clipboard.writeText(inviteUrl);
      setStatus("Link copied.");
    } catch {
      input.current?.focus();
      // iOS Safari ignores select() on read-only inputs; a range works there.
      input.current?.setSelectionRange(0, inviteUrl.length);
      setStatus("Couldn't copy automatically. Press and hold the link above to copy it.");
    }
  }
  return (
    <section className="invite" aria-labelledby="invite-heading">
      <h2 id="invite-heading">Invite link</h2>
      <p className="hint">Share this link with your band. Anyone with it can join by name.</p>
      <input
        ref={input}
        aria-label="Invite link"
        type="text"
        readOnly
        value={inviteUrl}
        onFocus={(event) => event.currentTarget.select()}
      />
      <button type="button" onClick={copy}>
        Copy link
      </button>
      <p className="hint" role="status">
        {status}
      </p>
    </section>
  );
}
