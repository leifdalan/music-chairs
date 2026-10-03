import { redirect } from "react-router";

import { endSession } from "~/.server/membership";

import type { Route } from "./+types/auth.sign-out";

/** Ends this device's Google session. Memberships joined on this device stay. */
export async function action({ request }: Route.ActionArgs) {
  return redirect("/", { headers: { "Set-Cookie": await endSession(request) } });
}

export function loader() {
  return redirect("/");
}
