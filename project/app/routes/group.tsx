import { useRef, useState } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";

import { findViewer, publicOrigin } from "~/.server/membership";
import { getStore } from "~/.server/store";
import { pageMeta } from "~/lib/site";

import type { Route } from "./+types/group";

export function meta({ loaderData }: Route.MetaArgs) {
  return pageMeta(loaderData ? loaderData.groupName : "Not found");
}

// Device tokens identify a device's membership (see `.server/membership.ts`)
// and never leave the server. Organizers also get member ids and optional tags
// for their controls; members and visitors get names and roles only.
export async function loader({ request, params }: Route.LoaderArgs) {
  const store = getStore();
  const group = store.findGroup(params.groupId);
  if (!group) throw data(null, { status: 404 });
  const viewer = await findViewer(request, group);
  const isOrganizer = viewer?.role === "organizer";
  return {
    groupName: group.name,
    timeZone: group.timeZone,
    members: store.listMembers(group.id).map((member) => ({
      displayName: member.displayName,
      role: member.role,
      isViewer: member.id === viewer?.id,
      manage: isOrganizer ? { id: member.id, optional: member.optional } : null,
    })),
    viewer: viewer ? { displayName: viewer.displayName, role: viewer.role } : null,
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
  const back = redirect(`/g/${group.id}`);
  if (intent === "set-privacy") {
    store.setShowNames(group.id, on);
    return back;
  }
  if (intent === "set-optional") {
    if (!store.setOptional(group.id, memberId, on)) throw data(null, { status: 404 });
    return back;
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
    return back;
  }
  return data({ problem: "Something went wrong with that request." }, { status: 400 });
}

export default function GroupPage({ loaderData, actionData }: Route.ComponentProps) {
  const { groupName, timeZone, members, viewer, showNames, inviteUrl } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <main>
      <h1>{groupName}</h1>
      <p className="hint">Times in {timeZone}</p>
      {viewer ? (
        <>
          <p className="hint">
            You are <strong>{viewer.displayName}</strong> ({viewer.role}).
          </p>
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
      {actionData?.problem ? (
        <p className="field-error" role="alert">
          {actionData.problem}
        </p>
      ) : null}
      {inviteUrl ? <InvitePanel inviteUrl={inviteUrl} /> : null}
      {showNames !== null ? (
        <section className="invite" aria-labelledby="privacy-heading">
          <h2 id="privacy-heading">What members see</h2>
          <p className="hint">
            {showNames
              ? "Members see who is free at each time."
              : "Members see only how many people are free at each time."}
          </p>
          <Toggle intent="set-privacy" setTo={!showNames} busy={busy}>
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
                    busy={busy}
                  >
                    {member.manage.optional ? "Make required" : "Make optional"}
                  </Toggle>
                  <Toggle
                    intent="set-role"
                    memberId={member.manage.id}
                    setTo={member.role !== "organizer"}
                    label={`${member.role === "organizer" ? "Remove organizer" : "Make organizer"}: ${member.displayName}`}
                    busy={busy}
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

/** A one-button form that sets an organizer setting on or off (`setTo`). */
function Toggle({
  intent,
  memberId,
  setTo,
  label,
  busy,
  children,
}: {
  intent: string;
  memberId?: string;
  setTo: boolean;
  /** Accessible name when the visible text alone doesn't say who it affects. */
  label?: string;
  busy: boolean;
  children: string;
}) {
  return (
    <Form method="post" replace>
      <input type="hidden" name="intent" value={intent} />
      {memberId ? <input type="hidden" name="memberId" value={memberId} /> : null}
      <input type="hidden" name="value" value={setTo ? "on" : "off"} />
      <button type="submit" className="secondary small" disabled={busy} aria-label={label}>
        {children}
      </button>
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
