import { Link } from "react-router";

import { GOOGLE_USER_DATA_POLICY, LIMITED_USE, POLICY } from "~/lib/privacy";
import { pageMeta, siteName } from "~/lib/site";

export function meta() {
  return pageMeta("Privacy policy");
}

/**
 * The privacy policy (plan/phase-14.md), public and without a loader. Every
 * statement here describes what the code does; change them together.
 */
export default function Privacy() {
  return (
    <main className="policy">
      <h1>Privacy policy</h1>
      <p className="hint">Last updated {POLICY.updated}.</p>

      <h2>Who runs {siteName}</h2>
      <p>
        {POLICY.operator} It helps small music ensembles collect when members are free, find
        rehearsal times that suit everyone, and confirm who is coming. Questions, and requests to
        see or delete your data, go to <a href={`mailto:${POLICY.contact}`}>{POLICY.contact}</a>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          What you and your group enter: group names, your name and instrumentation, your
          availability, scheduling requests and your answers, rehearsals and who is coming.
        </li>
        <li>
          Cookies on your device that remember which groups you joined there and, if you signed in
          with Google, your sign-in. There are no advertising or analytics cookies.
        </li>
        <li>
          If you sign in with Google: your Google account&apos;s identifier, name, email address and
          whether Google has verified that address, the Google permissions you granted, and a token
          that lets {siteName} use them while you are away (for example to keep your calendar up to
          date).
        </li>
        <li>
          If you let {siteName} add rehearsals to your Google Calendar: the ids of the events it
          added, so it can update or remove them later.
        </li>
        <li>
          If you use the private calendar link on the schedule page: a secret address for it. Anyone
          holding that link, such as the calendar app you add it to, can see your group&apos;s name
          and its confirmed rehearsals&apos; times and places; you choose whom to give it to.
        </li>
        <li>
          If you are an organizer and add someone from your contacts: that person&apos;s name and
          email address, kept until they claim their place.
        </li>
      </ul>

      <h2>The Google permissions we ask for</h2>
      <p>
        Signing in with Google is optional; you can use {siteName} with just a name. When you sign
        in, Google shows you what we ask for and you can untick the Calendar permissions. Contacts
        are asked for only when an organizer chooses to use them.
      </p>
      <table className="policy-scopes">
        <thead>
          <tr>
            <th scope="col">Permission</th>
            <th scope="col">What we do with it</th>
          </tr>
        </thead>
        <tbody>
          {POLICY.googleScopes.map((row) => (
            <tr key={row.scope}>
              <td>
                {row.name}
                <br />
                <code>{row.scope}</code>
              </td>
              <td>{row.purpose}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Contacts are read only on the organizer&apos;s Add members page, held in the server&apos;s
        memory for at most ten minutes so suggestions stay quick, and never written to disk or to
        logs. Only the person the organizer picks is saved: their name as the new member&apos;s
        name, and their email address until they claim their place.
      </p>

      <h2>How we use it</h2>
      <p>
        Only to run {siteName}&apos;s features for you and your groups. We never sell your data,
        never use it for advertising, and never use it to train AI models.
      </p>
      <p>
        {LIMITED_USE} You can read that policy at{" "}
        <a href={GOOGLE_USER_DATA_POLICY}>developers.google.com</a>.
      </p>

      <h2>Who it is shared with</h2>
      <ul>
        <li>
          Amazon Web Services, which hosts our server and its backups in the United States
          (us-west-2).
        </li>
        <li>Google, for the Google features you choose to use.</li>
        <li>
          Gravatar (gravatar.com): to show your picture in the top-right corner, your browser sends
          Gravatar a hash of your Google email address. Only you see your own picture there.
        </li>
      </ul>
      <p>Nobody else receives your data.</p>

      <h2>Who in your group sees what</h2>
      <ul>
        <li>
          Everyone in a group sees its members&apos; names and instrumentation, and whether each one
          signed in with Google.
        </li>
        <li>
          Organizers always see who is free when; they choose whether other members see names or
          only how many people are free.
        </li>
        <li>
          The Google email address you signed in with is shown to you and to the group&apos;s
          organizers. An email address an organizer added from contacts is shown only to organizers.
        </li>
        <li>The busy times from your Google Calendar are shown only to you.</li>
      </ul>

      <h2>How it is protected</h2>
      <ul>
        <li>The site works only over HTTPS.</li>
        <li>
          Sign-ins are stored only as one-way hashes. Cookies are HTTP-only, sent only over HTTPS
          and only to this site.
        </li>
        <li>Google tokens stay on the server and are never sent to your browser.</li>
        <li>
          Nightly backups are encrypted and private; the server can add backups but cannot read
          them.
        </li>
        <li>Only the operator can reach the server.</li>
      </ul>

      <h2>How long we keep it</h2>
      <ul>
        <li>
          Group data stays until an organizer removes the member or deletes the group; removing a
          member deletes their availability, answers and the calendar events {siteName} added.
        </li>
        <li>
          Your Google account record (name, email address, verified flag) stays until you ask us to
          delete it.
        </li>
        <li>
          The Google permission and its token stay until you use <strong>Disconnect Google</strong>.
          If you remove {siteName} in your Google account instead, or Google stops accepting the
          token, they stay until {siteName} next tries to use them.
        </li>
        <li>
          A sign-in ends 90 days after you last used it. Cookies last up to 400 days in your
          browser; signing out removes the sign-in cookie.
        </li>
        <li>Backups are kept for up to 37 days and may hold deleted data until then.</li>
        <li>
          Server logs record the addresses of the pages requested, not names, email addresses or
          contacts, and are kept for 30 days.
        </li>
      </ul>

      <h2>Removing your data and disconnecting Google</h2>
      <ul>
        <li>Organizers can remove a member or delete a whole group from the group page.</li>
        <li>
          <strong>Disconnect Google</strong>, in the menu behind your picture, stops adding
          rehearsals to your calendar, removes the upcoming ones {siteName} added, and withdraws its
          Google permissions. You stay in your groups.
        </li>
        <li>
          You can also remove {siteName} in your Google account: myaccount.google.com → Security →
          Your connections to third-party apps &amp; services.
        </li>
        <li>
          To have your Google account record and everything else about you deleted, email{" "}
          <a href={`mailto:${POLICY.contact}`}>{POLICY.contact}</a>.
        </li>
      </ul>

      <h2>Changes</h2>
      <p>
        If this policy changes, this page will say so and show the new date. Last updated{" "}
        {POLICY.updated}.
      </p>
      <p>
        <Link to="/">Back to {siteName}</Link>
      </p>
    </main>
  );
}
