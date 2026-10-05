// Readable group addresses (plan/phase-19.3.md): `/g/<name-slug>-<short id>`.
// The slug follows the group's current name; only the short id identifies it.

/** Lowercase letters and digits without lookalikes (no 0, 1, l, o): 32 characters. */
export const SHORT_ID_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyz";
export const SHORT_ID_LENGTH = 8;

const SLUG_MAX = 40;
// Letters that NFKD normalization does not split into a base letter and an accent.
const LETTERS: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  ł: "l",
  đ: "d",
  þ: "th",
};

/** A group name as the readable part of its address: "Café Trío" → "cafe-trio"; nothing Latin → "group". */
export function slugify(name: string): string {
  const plain = name
    .toLowerCase()
    .replace(/[ßæœøłđþ]/g, (letter) => LETTERS[letter])
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (plain.length <= SLUG_MAX) return plain || "group";
  const cut = plain.slice(0, SLUG_MAX);
  // Cut at a word boundary when one is in reach.
  const boundary = cut.lastIndexOf("-");
  return (boundary > 0 ? cut.slice(0, boundary) : cut).replace(/-+$/, "");
}

/** The path of a group's page; its other pages extend it (`/schedule`, `/availability`, …). */
export function groupPath(group: { name: string; shortId: string }): string {
  return `/g/${slugify(group.name)}-${group.shortId}`;
}

/** The short id an address ends with, or null when it has none. */
export function shortIdOf(address: string): string | null {
  const hyphen = address.lastIndexOf("-");
  if (hyphen < 0) return null;
  const suffix = address.slice(hyphen + 1).toLowerCase();
  if (suffix.length !== SHORT_ID_LENGTH) return null;
  return [...suffix].every((character) => SHORT_ID_ALPHABET.includes(character)) ? suffix : null;
}
