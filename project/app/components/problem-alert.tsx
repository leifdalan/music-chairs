import { useState } from "react";

/**
 * A refused change, explained at the top of its section. It stays until the
 * member dismisses it or makes another change (plan/phase-8.md, Decisions).
 * `response` is the action result it came from: dismissing hides that one
 * response, so the same refusal after another try shows again.
 */
export function ProblemAlert({ message, response }: { message: string; response: object }) {
  const [dismissed, setDismissed] = useState<object | null>(null);
  if (dismissed === response) return null;
  return (
    <p className="field-error problem-alert" role="alert">
      <span>{message}</span>
      <button
        type="button"
        className="toast-dismiss"
        aria-label="Dismiss"
        onClick={() => setDismissed(response)}
      >
        ×
      </button>
    </p>
  );
}
