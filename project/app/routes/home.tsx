import { Form, Link } from "react-router";

import { createGroupAction, timeZoneChoices } from "~/.server/create-group";
import { googleConfig } from "~/.server/google";
import { readAccount } from "~/.server/membership";
import { visitorGroups } from "~/.server/memberships";
import { homeRequests, waitingProposals } from "~/.server/pending";
import { CalendarActions, ProgressFigures } from "~/components/calendar-actions";
import { CreateGroupForm } from "~/components/create-group-form";
import { SubmitButton } from "~/components/submit-button";
import { formatDate } from "~/lib/availability";
import { groupPath } from "~/lib/group-address";
import { calendarNotice } from "~/lib/calendar-notices";
import { pageMeta, siteName, siteTagline } from "~/lib/site";
import { buttonVariants } from "~/components/ui/button";

import type { Route } from "./+types/home";

export function meta() {
  return pageMeta();
}

const NOTICES: Record<string, string> = {
  "signin-cancelled": "Google sign-in was cancelled.",
  "signin-failed": "Google sign-in didn't work. Please try again.",
};

// Time zones are built on the server so the server render and hydration list
// the same options. The visitor's groups are this device's and, when signed
// in, the account's.
export async function loader({ request }: Route.LoaderArgs) {
  const account = await readAccount(request);
  const notice = new URL(request.url).searchParams.get("notice");
  const memberships = await visitorGroups(request, account);
  return {
    timeZones: timeZoneChoices(),
    signInAvailable: googleConfig() !== null,
    account: account ? { name: account.name, email: account.email } : null,
    groups: memberships.map(({ group, member }) => ({
      path: groupPath(group),
      name: group.name,
      displayName: member.displayName,
    })),
    // Google Calendar consent started from "Your requests" returns here too.
    notice: notice ? (NOTICES[notice] ?? calendarNotice(request)) : null,
    requests: await homeRequests(request, memberships),
    proposals: waitingProposals(memberships),
  };
}

export async function action({ request }: Route.ActionArgs) {
  return createGroupAction(request, await request.formData());
}

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  const { requests, proposals, groups } = loaderData;
  const waiting = requests.filter((item) => item.waitingUntil !== null);
  const inProgress = requests.filter((item) => item.progress !== null);
  return (
    <main>
      <h1>{siteName}</h1>
      <p>{siteTagline}</p>
      {loaderData.notice ? (
        <p className="notice" role="status">
          {loaderData.notice}
        </p>
      ) : null}
      {waiting.length > 0 || proposals.length > 0 ? (
        <section className="pending waiting" aria-labelledby="waiting-heading">
          <h2 id="waiting-heading">Waiting on you</h2>
          <ul className="pending-requests">
            {proposals.map((item) => (
              <li key={item.rehearsalId}>
                <Link to={`${item.groupHref}/schedule`}>
                  <span className="pending-name">Proposed: {item.summary}</span>
                  <span className="hint">
                    {item.groupName}
                    {item.requestName ? ` · ${item.requestName}` : ""} · Say if you can come
                  </span>
                </Link>
              </li>
            ))}
            {waiting.map((item) => (
              <li key={item.requestId}>
                <Link to={`${item.groupHref}/requests/${item.requestId}`}>
                  <span className="pending-name">{item.name}</span>
                  <span className="hint">
                    {item.groupName} · Add your free times by{" "}
                    {formatDate(item.waitingUntil as string)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {inProgress.length > 0 ? (
        <section className="pending" aria-labelledby="requests-heading">
          <h2 id="requests-heading">Your requests</h2>
          <ul className="pending-requests">
            {inProgress.map((item) => (
              <li key={item.requestId}>
                <Link to={`${item.groupHref}/requests/${item.requestId}`}>
                  <span className="pending-name">{item.name}</span>
                  <span className="hint">{item.groupName}</span>
                </Link>
                {item.progress ? (
                  <div className="request-rehearsals">
                    <ProgressFigures item={item.progress} />
                    {item.progress.proposed.length > 0 ? (
                      <ul className="proposed-list">
                        {item.progress.proposed.map((rehearsal) => (
                          <li key={rehearsal.id}>
                            <Link to={`${item.groupHref}/schedule`}>
                              Proposed: {rehearsal.summary}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {item.progress.complete ? (
                      <CalendarActions
                        groupHref={item.groupHref}
                        requestId={item.requestId}
                        requestName={item.name}
                        google={item.google}
                        until={item.until}
                        returnTo="/"
                      />
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {groups.length > 0 ? (
        <section className="account" aria-labelledby="groups-heading">
          <h2 id="groups-heading">Your groups</h2>
          <ul className="your-groups">
            {groups.map((group) => (
              <li key={group.path}>
                <Link to={group.path}>{group.name}</Link>{" "}
                <span className="hint">as {group.displayName}</span>
              </li>
            ))}
          </ul>
          <Link to="/groups" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Manage groups
          </Link>
        </section>
      ) : null}
      <section className="about" aria-labelledby="about-heading">
        <h2 id="about-heading">What {siteName} does</h2>
        <ul>
          <li>Members say when they are free, once or every week.</li>
          <li>Organizers see the times that suit everyone and propose rehearsals.</li>
          <li>Everyone confirms whether they are coming.</li>
        </ul>
        <p className="hint">
          You can join with just a name. Signing in with Google is optional: it lets {siteName} grey
          out times your Google Calendar is busy, add confirmed rehearsals to your calendar, and,
          for organizers adding members, suggest people from your contacts. See the{" "}
          <Link to="/privacy">privacy policy</Link> for what is kept and why.
        </p>
      </section>
      <AccountPanel account={loaderData.account} signInAvailable={loaderData.signInAvailable} />
      {groups.length === 0 ? (
        <CreateGroupForm timeZones={loaderData.timeZones} result={actionData} />
      ) : null}
    </main>
  );
}

function AccountPanel({
  account,
  signInAvailable,
}: {
  account: { name: string; email: string } | null;
  signInAvailable: boolean;
}) {
  if (!account) {
    return signInAvailable ? (
      <section className="account" aria-labelledby="account-heading">
        <h2 id="account-heading">Already in a group?</h2>
        <p className="hint">Sign in to open the groups you linked to your Google account.</p>
        <a className={buttonVariants({ variant: "outline" })} href="/auth/google">
          Sign in with Google
        </a>
      </section>
    ) : null;
  }
  return (
    <section className="account" aria-labelledby="account-heading">
      <h2 id="account-heading">Your Google account</h2>
      <p className="hint">
        Signed in with Google as <strong>{account.email}</strong>. Open a group you joined and sign
        in from there to link it.
      </p>
      <Form method="post" action="/auth/sign-out">
        <SubmitButton feedbackKey="sign-out" variant="outline" size="sm">
          Sign out
        </SubmitButton>
      </Form>
    </section>
  );
}
