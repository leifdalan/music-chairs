export const GROUP_NAME_MAX = 80;
export const DISPLAY_NAME_MAX = 40;

export type NameResult = { ok: true; value: string } | { ok: false; error: string };

/**
 * Validates a group or display name from a form field: trims it, refuses an
 * empty or whitespace-only value, and caps its length in Unicode code points.
 */
export function validateName(raw: unknown, label: string, maxLength: number): NameResult {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value === "") {
    return { ok: false, error: `${label} is required.` };
  }
  if (Array.from(value).length > maxLength) {
    return { ok: false, error: `${label} must be at most ${maxLength} characters.` };
  }
  return { ok: true, value };
}
