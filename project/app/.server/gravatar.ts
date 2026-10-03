import { createHash } from "node:crypto";

/**
 * The Gravatar picture for an email (SHA-256 of the trimmed, lowercased
 * address). `d=blank` returns a transparent image when there is no Gravatar,
 * so the initials underneath show through.
 */
export function gravatarUrl(email: string | null | undefined): string | null {
  const address = (email ?? "").trim().toLowerCase();
  if (!address) return null;
  const hash = createHash("sha256").update(address).digest("hex");
  return `https://gravatar.com/avatar/${hash}?s=96&d=blank`;
}
