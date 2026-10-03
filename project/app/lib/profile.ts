// A member's own profile (plan/phase-12.md): initials, instrumentation, and
// how typed names are compared. The Gravatar address is built on the server
// (`~/.server/gravatar`).

/** The longest instrumentation, in code points. */
export const INSTRUMENT_MAX = 60;

/** Up to two initials from a name; "?" when there is none. */
export function initials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]];
  return letters.map((word) => Array.from(word)[0].toLocaleUpperCase("en")).join("");
}

/**
 * Whether two typed names are the same person's name: compared after Unicode
 * NFC normalization, trimming, collapsing inner spaces and lowercasing.
 */
export function sameName(a: string, b: string): boolean {
  const normal = (name: string) =>
    name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
  return normal(a) === normal(b);
}

/** Trims instrumentation and checks its length; empty is allowed. */
export function validateInstrument(
  raw: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (Array.from(value).length > INSTRUMENT_MAX) {
    return { ok: false, error: `Instrumentation must be at most ${INSTRUMENT_MAX} characters.` };
  }
  return { ok: true, value };
}
