import { useCallback, useEffect, useRef, useState } from "react";
import { useRouteLoaderData } from "react-router";

const SHOW_MS = 4000;

type Toast = { id: string; message: string };

/**
 * The confirmation left by the last change, shown at the bottom of the screen
 * and faded after a few seconds. The live region is always mounted so screen
 * readers announce each new message.
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

  return (
    <div className="toast-region" aria-live="polite" role="status">
      {shown ? <ToastItem key={shown.id} toast={shown} onClose={close} /> : null}
    </div>
  );
}

/** One message; keyed by id, so its hover/focus hold ends with it. */
function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (held) return;
    const timer = setTimeout(onClose, SHOW_MS);
    return () => clearTimeout(timer);
  }, [held, onClose]);
  return (
    <div
      className="toast"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <span>{toast.message}</span>
      <button type="button" className="toast-dismiss" aria-label="Dismiss" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
