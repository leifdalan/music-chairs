import { redirect } from "react-router";

import { redirectWithToast } from "~/.server/flash";
import { endSession } from "~/.server/membership";

import type { Route } from "./+types/auth.sign-out";
import { withFailures } from "~/lib/client-failure";

/** Ends this device's Google session. Memberships joined on this device stay. */
export async function action({ request }: Route.ActionArgs) {
  return redirectWithToast("/", "Signed out", {
    headers: { "Set-Cookie": await endSession(request) },
  });
}

// In the browser a failed save stays on the page with Retry (plan/phase-34.md).
export async function clientAction(args: Route.ClientActionArgs) {
  return withFailures(args);
}

export function loader() {
  return redirect("/");
}
