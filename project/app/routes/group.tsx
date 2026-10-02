import { useRef, useState } from "react";
import { data, Link } from "react-router";

import { findViewer } from "~/.server/membership";
import { getStore } from "~/.server/store";
import { pageMeta } from "~/lib/site";

import type { Route } from "./+types/group";

export function meta({ loaderData }: Route.MetaArgs) {
  return pageMeta(loaderData ? loaderData.groupName : "Not found");
}

// Member ids identify a device's membership (see `.server/membership.ts`), so
// they never leave the server: the page receives names and roles only.
export async function loader({ request, params }: Route.LoaderArgs) {
  const store = getStore();
  const group = store.findGroup(params.groupId);
  if (!group) throw data(null, { status: 404 });
  const viewer = await findViewer(request, group);
  return {
    groupName: group.name,
    timeZone: group.timeZone,
    members: store.listMembers(group.id).map((member) => ({
      displayName: member.displayName,
      role: member.role,
      isViewer: member.id === viewer?.id,
    })),
    viewer: viewer ? { displayName: viewer.displayName, role: viewer.role } : null,
    inviteUrl:
      viewer?.role === "organizer" ? new URL(`/join/${group.inviteToken}`, request.url).href : null,
  };
}

export default function GroupPage({ loaderData }: Route.ComponentProps) {
  const { groupName, timeZone, members, viewer, inviteUrl } = loaderData;
  return (
    <main>
      <h1>{groupName}</h1>
      <p className="hint">Times in {timeZone}</p>
      {viewer ? (
        <>
          <p className="hint">
            You are <strong>{viewer.displayName}</strong> ({viewer.role}).
          </p>
          <p>
            <Link to="availability" relative="path" className="button-link">
              My availability
            </Link>
          </p>
        </>
      ) : (
        <p className="notice">
          You haven't joined this group on this device. Ask an organizer for the invite link.
        </p>
      )}
      {inviteUrl ? <InvitePanel inviteUrl={inviteUrl} /> : null}
      <section aria-labelledby="members-heading">
        <h2 id="members-heading">Members ({members.length})</h2>
        <ul className="members">
          {members.map((member, index) => (
            <li key={index}>
              <span className="member-name">
                {member.displayName}
                {member.isViewer ? " (you)" : ""}
              </span>
              <span className={`role role-${member.role}`}>{member.role}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
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
