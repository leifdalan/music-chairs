import { redirect } from "react-router";

import { stopWritingFor } from "~/.server/calendar-sync";
import { confirmationNeeded } from "~/.server/confirm";
import { redirectWithToast } from "~/.server/flash";
import { forgetAccessToken, revokeGrant } from "~/.server/google";
import { readAccount, safeReturnTo } from "~/.server/membership";
import { getStore } from "~/.server/store";
import { ConfirmPanel } from "~/components/confirm-form";
import { DISCONNECT_PROMPT } from "~/lib/privacy";
import { pageMeta } from "~/lib/site";

import type { Route } from "./+types/auth.google.disconnect";

export function meta() {
  return pageMeta("Disconnect Google");
}

/** The page the person came from, carried in `?returnTo=` so Cancel can go back too. */
function back(request: Request): string {
  return safeReturnTo(new URL(request.url).searchParams.get("returnTo"), request);
}

/**
 * Disconnect Google (plan/phase-14.md): for the signed-in account, removes the
 * upcoming events the app wrote while it still can, withdraws the grant at
 * Google, then forgets the grant and everything recorded with it. The session,
 * the account and its memberships stay.
 */
export async function action({ request }: Route.ActionArgs) {
  const account = await readAccount(request);
  if (!account) return redirectWithToast("/", "You're not signed in");
  const form = await request.formData();
  const prompt = confirmationNeeded(form, DISCONNECT_PROMPT);
  if (prompt) return prompt;
  const store = getStore();
  const grant = store.findGrant(account.id);
  if (!grant) {
    store.disconnectGoogle(account.id);
    return redirectWithToast(
      back(request),
      "music-chairs holds no Google permissions for you. To remove the sign-in itself, use myaccount.google.com.",
    );
  }
  const allRemoved = await stopWritingFor(account.id);
  const revoked = await revokeGrant(grant.refreshToken);
  store.disconnectGoogle(account.id);
  forgetAccessToken(account.id);
  const notes = [
    allRemoved ? null : "some upcoming rehearsals may still be in your Google Calendar",
    revoked ? null : "Google didn't answer, so remove music-chairs at myaccount.google.com too",
  ].filter((note) => note !== null);
  return redirectWithToast(
    back(request),
    notes.length === 0
      ? "Disconnected from Google"
      : `Disconnected from Google here, but ${notes.join(", and ")}.`,
  );
}

export function loader({ request }: Route.LoaderArgs) {
  return redirect(back(request));
}

/** Shown only for the confirm page (no JavaScript, or a post without the confirmation). */
export default function Disconnect({ actionData }: Route.ComponentProps) {
  const prompt = actionData && "confirm" in actionData ? actionData.confirm : null;
  return <main>{prompt ? <ConfirmPanel prompt={prompt} /> : null}</main>;
}
