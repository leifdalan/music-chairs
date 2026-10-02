import { createCookie } from "react-router";

type Memberships = Record<string, string>;

// Which member this device is in each group: group id → member id. Unsigned on
// purpose: member ids are unguessable and never sent to the browser in page
// data, and the brief leaves name-only impersonation to social contract.
// `Secure` is added when the app is served over TLS (Phase 5).
const membershipCookie = createCookie("mc_members", {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 400,
});

/** The group → member map this device carries; empty when absent or unreadable. */
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
  memberId: string,
): Promise<string> {
  const memberships = await readMemberships(request);
  return membershipCookie.serialize({ ...memberships, [groupId]: memberId });
}
