import { useEffect, useRef } from "react";
import { Form, useLocation, useRouteLoaderData } from "react-router";

import type { HeaderProfile } from "~/.server/profile";
import { DISCONNECT_PROMPT } from "~/lib/privacy";
import { INSTRUMENT_MAX } from "~/lib/profile";
import { buttonVariants } from "~/components/ui/button";

import { ConfirmForm } from "./confirm-form";
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
            action={`${profile.member.groupHref}/profile`}
            className="stack"
            key={`${profile.member.groupHref}-${profile.member.displayName}-${profile.member.instrument}`}
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
              <SubmitButton feedbackKey="profile-sign-out" variant="outline">
                Sign out
              </SubmitButton>
            </Form>
            <ConfirmForm
              action={`/auth/google/disconnect?returnTo=${encodeURIComponent(here)}`}
              fields={{}}
              trigger="Disconnect Google"
              title={DISCONNECT_PROMPT.title}
              body={DISCONNECT_PROMPT.body}
              label={DISCONNECT_PROMPT.label}
              feedbackKey="profile-disconnect"
              triggerSize="sm"
            />
          </>
        ) : profile.canSignIn ? (
          <a
            className={buttonVariants({ variant: "outline" })}
            href={`/auth/google?returnTo=${encodeURIComponent(here)}`}
          >
            Sign in with Google
          </a>
        ) : null}
      </div>
    </details>
  );
}
