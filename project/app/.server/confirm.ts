// The server half of "are you sure" (plan/phase-11.md, Decisions): a
// destructive action runs only with `confirmed=1`. Without it the action
// answers with a prompt instead, which the page shows as a confirm panel that
// re-posts the same fields; that is also the path without JavaScript.

/** What the confirm panel shows and re-posts. */
export type ConfirmPrompt = {
  title: string;
  /** What will be lost. */
  body: string;
  /** The red button's label. */
  label: string;
  /** The submitted fields, to post again with `confirmed=1`. */
  fields: [string, string][];
};

/**
 * Null when the form carries the confirmation; otherwise the prompt to show.
 * Call it only after authorizing, validating and finding the target, so a
 * prompt never stands in for a refusal.
 */
export function confirmationNeeded(
  form: FormData,
  prompt: Omit<ConfirmPrompt, "fields">,
): { confirm: ConfirmPrompt } | null {
  if (form.get("confirmed") === "1") return null;
  const fields: [string, string][] = [];
  for (const [name, value] of form.entries()) {
    if (name !== "confirmed" && typeof value === "string") fields.push([name, value]);
  }
  return { confirm: { ...prompt, fields } };
}
