import { createCookie } from "react-router";

import { getStore, type Group, type Member } from "./store";

type Memberships = Record<string, string>;

/**
 * The site's public origin from `MUSIC_CHAIRS_PUBLIC_URL` (for example
 * `https://rehearse.dalan.dev`), or null when unset, as in local development.
 * Behind the HTTPS proxy the request URL is the internal `http://127.0.0.1`
 * address, so links shown to people are built from this instead.
 */
export function publicOrigin(): string | null {
  const configured = process.env.MUSIC_CHAIRS_PUBLIC_URL;
  return configured ? new URL(configured).origin : null;
}

// Which member this device is in each group: group id → device token. Unsigned
// on purpose: device tokens are unguessable, never sent to the browser in page
// data, and the brief leaves name-only impersonation to social contract.
// `Secure` whenever the site is served over HTTPS.
const membershipCookie = createCookie("mc_members", {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 400,
  secure: publicOrigin()?.startsWith("https:") ?? false,
});

/** The group → device token map this device carries; empty when absent or unreadable. */
export async function readMemberships(request: Request): Promise<Memberships> {
  const value: unknown = await membershipCookie.parse(request.headers.get("Cookie"));
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/** A `Set-Cookie` value that adds this membership and keeps the device's others. */
export async function rememberMembership(
  request: Request,
  groupId: string,
  deviceToken: string,
): Promise<string> {
  const memberships = await readMemberships(request);
  return membershipCookie.serialize({ ...memberships, [groupId]: deviceToken });
}

/** The member this device is in `group`, or null for a visitor or a stale entry. */
export async function findViewer(request: Request, group: Group): Promise<Member | null> {
  const deviceToken = (await readMemberships(request))[group.id];
  return deviceToken ? getStore().findMemberByDevice(group.id, deviceToken) : null;
}
