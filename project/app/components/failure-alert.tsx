import { useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigation, useRevalidator, useSubmit } from "react-router";

import { retrySubmit, type Failure } from "~/lib/client-failure";

import { ButtonLabels } from "./submit-button";
import { buttonVariants } from "./ui/button";

/**
 * A save that failed in the browser (plan/phase-34.md): "Not saved" (or
 * "Maybe not saved" when it may have reached the server) with the reason,
 * and Retry, which sends it again, or Reload when sending it again could
 * make something twice. Nothing is sent again on its own. Like `ProblemAlert`
 * it stays until dismissed or replaced by the next outcome.
 */
export function FailureAlert({
  failure,
  onRetry,
  busy = false,
  floating = false,
  check,
}: {
  failure: Failure;
  onRetry: () => void;
  /** The retried save is in flight. */
  busy?: boolean;
  /** Shown where toasts are, over the page, wherever the form was. */
  floating?: boolean;
  /** Where to see whether a create went through, instead of reloading in place. */
  check?: { href: string; label: string };
}) {
  const [dismissed, setDismissed] = useState<Failure | null>(null);
  const [retried, setRetried] = useState<Failure | null>(null);
  const revalidator = useRevalidator();
  const navigating = useNavigation().state !== "idle";
  if (dismissed === failure) return null;
  const saving = retried === failure && (busy || navigating || revalidator.state !== "idle");
  const alert = (
    <div
      className={`field-error problem-alert failure-alert${floating ? " floating" : ""}`}
      role="alert"
    >
      <p>
        <strong>{failure.certain ? "Not saved." : "Maybe not saved."}</strong> {failure.message}
      </p>
      <div className="failure-actions">
        {check && !failure.retry ? (
          <Link className={buttonVariants({ variant: "outline", size: "sm" })} to={check.href}>
            {check.label}
          </Link>
        ) : (
          <button
            type="button"
            className={buttonVariants({ variant: "outline", size: "sm" })}
            aria-disabled={saving || undefined}
            onClick={() => {
              if (saving) return;
              setRetried(failure);
              if (failure.retry) onRetry();
              else void revalidator.revalidate();
            }}
          >
            <ButtonLabels status={saving ? "saving" : null}>
              {failure.retry ? "Retry" : "Reload"}
            </ButtonLabels>
          </button>
        )}
        <button
          type="button"
          className="toast-dismiss"
          aria-label="Dismiss"
          onClick={() => setDismissed(failure)}
        >
          ×
        </button>
      </div>
    </div>
  );
  // A failure only ever arrives in the browser, where the root's slot is.
  const slot =
    floating && typeof document !== "undefined" && document.getElementById("failure-slot");
  return slot ? createPortal(alert, slot) : alert;
}

/**
 * A page's own form that failed in the browser (plan/phase-34.md): the page
 * stays as it was, and the failure shows over it with Retry, which sends the
 * form again as it now is.
 */
export function PageFailure({
  failure,
  check,
}: {
  failure: Failure | null;
  check?: { href: string; label: string };
}) {
  const submit = useSubmit();
  if (!failure) return null;
  return (
    <FailureAlert
      failure={failure}
      floating
      check={check}
      onRetry={() =>
        retrySubmit(failure, (form) => {
          void submit(form, { method: "post", replace: true, preventScrollReset: true });
        })
      }
    />
  );
}
