import { useLayoutEffect, useState } from "react";
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
 * it stays until dismissed or replaced by the next outcome. Every failed save
 * shows here, at the bottom of the screen with the toasts (plan/phase-38.md).
 */
export function FailureAlert({
  failure,
  onRetry,
  busy = false,
  check,
}: {
  failure: Failure;
  onRetry: () => void;
  /** The retried save is in flight. */
  busy?: boolean;
  /** Where to see whether a create went through, instead of reloading in place. */
  check?: { href: string; label: string };
}) {
  const [dismissed, setDismissed] = useState<Failure | null>(null);
  const [retried, setRetried] = useState<Failure | null>(null);
  const revalidator = useRevalidator();
  const navigating = useNavigation().state !== "idle";
  // The card mustn't hide what has focus (plan/phase-38.md): the page, which
  // gains bottom space while a failure shows, scrolls just enough to show it
  // above the card. Not for what floats itself (the stack, a dialog).
  useLayoutEffect(() => {
    if (dismissed === failure) return;
    const focused = document.activeElement;
    const stack = document.getElementById("failure-slot")?.parentElement;
    if (!(focused instanceof HTMLElement) || focused === document.body || !stack) return;
    if (stack.contains(focused) || focused.closest("dialog")) return;
    const by = scrollToClear(
      focused.getBoundingClientRect().bottom,
      stack.getBoundingClientRect().top,
    );
    if (by > 0) window.scrollBy({ top: by });
  }, [failure, dismissed]);
  if (dismissed === failure) return null;
  const saving = retried === failure && (busy || navigating || revalidator.state !== "idle");
  const alert = (
    <div className="field-error problem-alert failure-alert" role="alert">
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
  // A failure only ever arrives in the browser, where the root's slot is; the
  // error page has no slot, so a card there stays where it was rendered.
  const slot = typeof document !== "undefined" && document.getElementById("failure-slot");
  return slot ? createPortal(alert, slot) : alert;
}

/** How far to scroll so something ending at `bottom` sits clear above the floating cards' `top`. */
export function scrollToClear(bottom: number, top: number): number {
  const GAP = 8;
  return Math.max(0, Math.ceil(bottom - top + GAP));
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
      check={check}
      onRetry={() =>
        retrySubmit(failure, (form) => {
          void submit(form, { method: "post", replace: true, preventScrollReset: true });
        })
      }
    />
  );
}
