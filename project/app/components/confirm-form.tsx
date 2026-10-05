import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Form, useLocation, useNavigation } from "react-router";

import type { ConfirmPrompt } from "~/.server/confirm";
import { buttonVariants, type ButtonSize, type ButtonVariant } from "~/components/ui/button";

import { SubmitButton } from "./submit-button";

const noSubscription = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/**
 * A form for a destructive action (plan/phase-11.md, Decisions). Its button
 * opens a dialog that says what will be lost, with Cancel (focused first) and
 * a red confirm button that posts the form with `confirmed=1`. Before the page
 * is interactive, or without JavaScript, the same button posts without it and
 * the server answers with a confirm panel instead.
 */
export function ConfirmForm({
  fields,
  trigger,
  title,
  body,
  label,
  feedbackKey,
  triggerVariant = "outline",
  triggerSize = "default",
  triggerLabel,
  className,
  action,
  children,
}: {
  /** Hidden fields posted with the action. */
  fields: Record<string, string>;
  trigger: ReactNode;
  title: string;
  body: string;
  label: string;
  feedbackKey: string;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  /** Accessible name when the trigger's text alone doesn't say what it affects. */
  triggerLabel?: string;
  /** Visible fields the action also needs (for example a last date). */
  children?: ReactNode;
  className?: string;
  /** Where the form posts, when not to the current page. */
  action?: string;
}) {
  const hydrated = useHydrated();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const busy = useNavigation().state !== "idle";
  // The dialog stays open, its button showing "Saving…", until the
  // submission settles; then it closes, whether the change succeeded or not.
  const submitted = useRef(false);
  useEffect(() => {
    if (busy || !submitted.current) return;
    submitted.current = false;
    dialog.current?.close();
  }, [busy]);
  return (
    <Form
      method="post"
      action={action}
      replace
      className={className ? `confirm-form ${className}` : "confirm-form"}
      onSubmit={() => {
        if (dialog.current?.open) submitted.current = true;
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <button
        type="submit"
        data-variant={triggerVariant}
        className={buttonVariants({ variant: triggerVariant, size: triggerSize })}
        aria-label={triggerLabel}
        disabled={busy}
        onClick={(event) => {
          if (!hydrated) return;
          event.preventDefault();
          // Problems with the form's own fields show before the dialog hides them.
          if (event.currentTarget.form?.reportValidity() === false) return;
          dialog.current?.showModal();
        }}
      >
        {trigger}
      </button>
      {hydrated ? (
        <dialog ref={dialog} className="confirm-dialog" aria-labelledby={titleId}>
          <h2 id={titleId}>{title}</h2>
          <p>{body}</p>
          <div className="confirm-actions">
            <button
              type="button"
              className={buttonVariants({ variant: "outline" })}
              autoFocus
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </button>
            <SubmitButton
              feedbackKey={feedbackKey}
              variant="destructive"
              name="confirmed"
              value="1"
            >
              {label}
            </SubmitButton>
          </div>
        </dialog>
      ) : null}
    </Form>
  );
}

/**
 * The confirm page: shown when the server answered a destructive action with
 * a prompt (no JavaScript, or a post without the confirmation). It posts the
 * same fields again with `confirmed=1`; Cancel reloads the page as it was.
 */
export function ConfirmPanel({ prompt }: { prompt: ConfirmPrompt }) {
  const titleId = useId();
  const location = useLocation();
  const cancelTo = location.pathname + location.search;
  return (
    <section className="confirm-panel" role="alertdialog" aria-labelledby={titleId}>
      <h2 id={titleId}>{prompt.title}</h2>
      <p>{prompt.body}</p>
      <Form method="post" replace className="confirm-actions">
        {prompt.fields.map(([name, value], index) => (
          <input key={`${name}-${index}`} type="hidden" name={name} value={value} />
        ))}
        <a className={buttonVariants({ variant: "outline" })} href={cancelTo}>
          Cancel
        </a>
        <SubmitButton feedbackKey="confirm-panel" variant="destructive" name="confirmed" value="1">
          {prompt.label}
        </SubmitButton>
      </Form>
    </section>
  );
}
