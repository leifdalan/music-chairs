// What an organizer types or picks in "Add members" (plan/phase-13.md): a
// name, or a contact suggestion written "Name <email>".

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** Whether `value` looks like an email address. */
export function isEmail(value: string): boolean {
  return EMAIL.test(value);
}

const NAME_NEEDED = "Add a name too, like Sam Smith <sam@example.com>.";

export type Person =
  { ok: true; name: string; email: string | null } | { ok: false; error: string };

/**
 * Reads "Name <email>" (a picked contact) or a bare name. The name is left
 * for the caller to validate; an email address in place of the name is refused.
 */
export function parsePerson(text: unknown): Person {
  const value = typeof text === "string" ? text.trim() : "";
  const withEmail = /^(.*?)\s*<([^<>]*)>$/.exec(value);
  if (withEmail) {
    const email = withEmail[2].trim();
    if (!isEmail(email)) return { ok: false, error: "That email address doesn't look right." };
    const name = withEmail[1].trim();
    // A display name is shown to the whole group; the email only to organizers.
    if (!name || isEmail(name)) return { ok: false, error: NAME_NEEDED };
    return { ok: true, name, email: email.toLowerCase() };
  }
  if (isEmail(value)) return { ok: false, error: NAME_NEEDED };
  return { ok: true, name: value, email: null };
}
