// Reading a group from its address (plan/phase-19.3.md). The short id decides;
// a page asked for under an out-of-date name (after a rename), or with the
// short id in capitals, is redirected to the current address.

import { data, redirect } from "react-router";

import { groupPath, shortIdOf } from "~/lib/group-address";

import { pagePath } from "./membership";
import { getStore, type Group } from "./store";

/** The group an address names, or null for one that names none. */
export function findGroupByAddress(address: string): Group | null {
  const shortId = shortIdOf(address);
  return shortId ? getStore().findGroupByShortId(shortId) : null;
}

/**
 * The group the route's `:groupAddress` names. Unknown → 404. A GET or HEAD
 * under any other spelling than the current address redirects there, keeping
 * the rest of the path and the query; data requests redirect to the page.
 * The 301 is not cached, so renaming a group back and forth cannot leave
 * browsers looping between old addresses. Other methods act without redirecting.
 */
export function groupFromAddress(request: Request, address: string | undefined): Group {
  const group = address ? findGroupByAddress(address) : null;
  if (!group || !address) throw data(null, { status: 404 });
  const current = groupPath(group);
  if (`/g/${address}` !== current && (request.method === "GET" || request.method === "HEAD")) {
    const page = new URL(pagePath(new URL(request.url)), request.url);
    // The pathname is still percent-encoded; the parameter is not, so cut by segment.
    const rest = page.pathname.replace(/^\/g\/[^/]*/, "");
    throw redirect(`${current}${rest}${page.search}`, {
      status: 301,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return group;
}
