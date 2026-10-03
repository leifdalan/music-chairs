import { useEffect, useRef } from "react";
import { Form, useLocation, useRouteLoaderData } from "react-router";

import type { HeaderProfile } from "~/.server/profile";
import { INSTRUMENT_MAX } from "~/lib/profile";

import { SubmitButton } from "./submit-button";

/**
 * The viewer's own menu in the header's top-right corner (plan/phase-12.md):
 * their Gravatar over their initials, and a panel with their name and
 * instrumentation in this group, the Gravatar link, and signing in or out. A
 * plain disclosure, so it opens without JavaScript; it closes on navigation.
 */
export function ProfileMenu() {
  const root = useRouteLoaderData("root") as { profile?: HeaderProfile } | undefined;
  const location = useLocation();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [location.key]);
  const profile = root?.profile;
  // Error pages may have no root data; the header then shows no menu.
  if (!profile) return null;
  const here = location.pathname + location.search;
  return (
    <details className="profile-menu" ref={menu}>
      <summary aria-label="Your profile and sign-in">
        <span className="avatar" aria-hidden="true">
          <span className="avatar-initials">{profile.initials}</span>
          {profile.gravatar ? <img src={profile.gravatar} alt="" width={36} height={36} /> : null}
        </span>
      </summary>
      <div className="profile-panel">
        {profile.member ? (
          <Form
            method="post"
            action={`/g/${profile.member.groupId}/profile`}
            className="stack"
            key={`${profile.member.groupId}-${profile.member.displayName}-${profile.member.instrument}`}
          >
            <input type="hidden" name="returnTo" value={here} />
            <div className="field">
              <label htmlFor="profile-name">Your name in this group</label>
              <input
                id="profile-name"
                name="displayName"
                type="text"
                required
                autoComplete="off"
                defaultValue={profile.member.displayName}
              />
            </div>
            <div className="field">
              <label htmlFor="profile-instrument">Instrumentation</label>
              <input
                id="profile-instrument"
                name="instrument"
                type="text"
                autoComplete="off"
                placeholder="for example cello, piano"
                maxLength={INSTRUMENT_MAX}
                defaultValue={profile.member.instrument}
              />
            </div>
            <SubmitButton feedbackKey="profile-save">Save</SubmitButton>
          </Form>
        ) : null}
        {profile.signedIn ? (
          <>
            <p className="hint">Signed in as {profile.signedIn.email}</p>
            <a href="https://gravatar.com/profile" target="_blank" rel="noreferrer">
              Change picture on gravatar.com
            </a>
            <Form method="post" action="/auth/sign-out">
              <SubmitButton feedbackKey="profile-sign-out" className="secondary">
                Sign out
              </SubmitButton>
            </Form>
          </>
        ) : profile.canSignIn ? (
          <a
            className="button-link secondary"
            href={`/auth/google?returnTo=${encodeURIComponent(here)}`}
          >
            Sign in with Google
          </a>
        ) : null}
      </div>
    </details>
  );
}
