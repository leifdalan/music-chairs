import { useCallback, useEffect, useRef, useState } from "react";
import { useRouteLoaderData } from "react-router";

import type { ToastKind } from "~/lib/toast-kind";
import { BrandText } from "./brand";

const SHOW_MS = 4000;

type Toast = { id: string; message: string; kind: ToastKind };

/**
 * The confirmation left by the last change, shown at the bottom of the screen
 * and faded after a few seconds. The live region is always mounted so screen
 * readers announce each new message, once: success and warning in a polite
 * status region, an error in an alert region, never one inside the other
 * (plan/phase-40.md). Its colour says how it went
 * (plan/phase-36.md): green when the change worked, yellow when it was done
 * but not fully, red when it was refused or failed. A warning or an error
 * stays until dismissed, and an error is also an alert (plan/phase-34.md).
 */
export function Toaster() {
  const root = useRouteLoaderData("root") as { toast?: Toast | null } | undefined;
  const incoming = root?.toast ?? null;
  const [shown, setShown] = useState(incoming);
  const seen = useRef<string | null>(null);
  const close = useCallback(() => setShown(null), []);

  useEffect(() => {
    if (incoming && incoming.id !== seen.current) {
      seen.current = incoming.id;
      setShown(incoming);
    }
  }, [incoming]);

  // Both regions stay mounted, as direct children of the float stack.
  const error = shown?.kind === "error";
  return (
    <>
      <div className="toast-region" role="status" aria-live="polite">
        {shown && !error ? <ToastItem key={shown.id} toast={shown} onClose={close} /> : null}
      </div>
      <div className="toast-region" role="alert">
        {shown && error ? <ToastItem key={shown.id} toast={shown} onClose={close} /> : null}
      </div>
    </>
  );
}

/** One message; keyed by id, so its hover/focus hold ends with it. */
function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [held, setHeld] = useState(false);
  const stays = toast.kind !== "success";
  useEffect(() => {
    if (held || stays) return;
    const timer = setTimeout(onClose, SHOW_MS);
    return () => clearTimeout(timer);
  }, [held, stays, onClose]);
  return (
    <div
      className={`toast toast-${toast.kind}`}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <span>
        <BrandText text={toast.message} />
      </span>
      <button type="button" className="toast-dismiss" aria-label="Dismiss" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
