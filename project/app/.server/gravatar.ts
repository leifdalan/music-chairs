import { createHash } from "node:crypto";

/**
 * Gravatar pictures, fetched by the server and served from the site itself
 * (plan/phase-40.md, the operator's ruling): the browser never contacts
 * gravatar.com, and Gravatar sees the server's request, not the person's.
 */

/** SHA-256 of the trimmed, lowercased address, as Gravatar names a picture; null without one. */
export function gravatarHash(email: string | null | undefined): string | null {
  const address = (email ?? "").trim().toLowerCase();
  return address ? createHash("sha256").update(address).digest("hex") : null;
}

/**
 * The header picture's address on this site, or null without an email. `v`
 * changes with the email, so a browser's cached picture never outlives it;
 * `g` names the group whose member the header shows.
 */
export function gravatarUrl(
  email: string | null | undefined,
  groupAddress: string | null = null,
): string | null {
  const hash = gravatarHash(email);
  if (!hash) return null;
  const query = new URLSearchParams();
  if (groupAddress) query.set("g", groupAddress);
  query.set("v", hash.slice(0, 16));
  return `/avatar?${query.toString()}`;
}

export type Picture = { body: Uint8Array<ArrayBuffer>; type: string; maxAge: number };

/** A transparent 1×1 GIF: the initials underneath show through. */
export const BLANK: Picture = {
  body: Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (char) =>
    char.charCodeAt(0),
  ),
  type: "image/gif",
  maxAge: 600,
};

const DAY = 24 * 60 * 60;
const MAX_BYTES = 100 * 1024;
const MAX_ENTRIES = 500;
const TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/** Pictures by hash, oldest first, with when each stops being fresh. */
const cache = new Map<string, { picture: Picture; until: number }>();
const fetching = new Map<string, Promise<Picture>>();

/** Forgets every cached picture (tests). */
export function forgetPictures(): void {
  cache.clear();
  fetching.clear();
}

async function fetchPicture(hash: string): Promise<Picture> {
  try {
    const response = await fetch(`https://gravatar.com/avatar/${hash}?s=96&d=blank`, {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    const type = (response.headers.get("Content-Type") ?? "").split(";")[0].trim();
    if (response.status !== 200 || !TYPES.has(type)) return BLANK;
    // Refused before reading when it says it is too big.
    if (Number(response.headers.get("Content-Length") ?? 0) > MAX_BYTES) return BLANK;
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > MAX_BYTES) return BLANK;
    return { body, type, maxAge: DAY };
  } catch {
    return BLANK;
  }
}

/**
 * The picture for an email: from the cache while fresh (a day for a picture,
 * ten minutes after a failure), else fetched once however many ask at once.
 */
export async function gravatarPicture(email: string | null | undefined): Promise<Picture> {
  const hash = gravatarHash(email);
  if (!hash) return BLANK;
  const now = Date.now();
  const kept = cache.get(hash);
  if (kept && kept.until > now) return kept.picture;
  const pending = fetching.get(hash);
  if (pending) return pending;
  const loading = fetchPicture(hash).then((picture) => {
    cache.delete(hash);
    cache.set(hash, { picture, until: Date.now() + picture.maxAge * 1000 });
    while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    fetching.delete(hash);
    return picture;
  });
  fetching.set(hash, loading);
  return loading;
}
