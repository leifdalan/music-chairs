import { randomUUID } from "node:crypto";

import { createCookie, redirect } from "react-router";

import { publicOrigin } from "./membership";

/** A short confirmation shown once after a change (plan/phase-8.md, Decisions). */
export type Toast = { id: string; message: string };

const secure = publicOrigin()?.startsWith("https:") ?? false;

// One-shot: set by the action that made the change, read and cleared by the
// root loader on the page the redirect lands on. Text is chosen by the server
// (plus the member's own answer or the group's name), never raw form input.
const toastCookie = createCookie(secure ? "__Host-mc_toast" : "mc_toast", {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60,
  secure,
});

/**
 * A redirect that also leaves `message` for the next page. The toast cookie is
 * appended after any headers passed in, so a membership cookie stays first.
 */
export async function redirectWithToast(
  url: string,
  message: string,
  init: { headers?: HeadersInit } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.append("Set-Cookie", await toastCookie.serialize({ id: randomUUID(), message }));
  return redirect(url, { headers });
}

/** The waiting toast, and the `Set-Cookie` that clears it (null when there was none). */
export async function readToast(
  request: Request,
): Promise<{ toast: Toast | null; clear: string | null }> {
  const value: unknown = await toastCookie.parse(request.headers.get("Cookie"));
  if (!value || typeof value !== "object") return { toast: null, clear: null };
  const { id, message } = value as Record<string, unknown>;
  const clear = await toastCookie.serialize("", { maxAge: 0 });
  return typeof id === "string" && typeof message === "string"
    ? { toast: { id, message }, clear }
    : { toast: null, clear };
}
