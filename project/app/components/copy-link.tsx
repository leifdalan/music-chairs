import { useRef, useState, type ReactNode } from "react";

import { buttonVariants } from "~/components/ui/button";

/**
 * A link to share (plan/phase-30.md): the link itself, read-only and selected
 * on focus, a "Copy link" button, anything else (`children`) and a status line
 * saying whether it was copied. Its container lays these out.
 */
export function CopyLink({
  url,
  label,
  variant = "default",
  children,
}: {
  url: string;
  /** The link field's accessible name. */
  label: string;
  /** "outline" where the page or card already has its own main action. */
  variant?: "default" | "outline";
  children?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      // The Clipboard API exists only in secure contexts; over plain HTTP
      // (a phone on the local network) this throws and the fallback runs.
      await navigator.clipboard.writeText(url);
      setStatus("Link copied.");
    } catch {
      input.current?.focus();
      // iOS Safari ignores select() on read-only inputs; a range works there.
      input.current?.setSelectionRange(0, url.length);
      setStatus("Couldn't copy automatically. Press and hold the link above to copy it.");
    }
  }
  return (
    <>
      <input
        ref={input}
        aria-label={label}
        type="text"
        readOnly
        value={url}
        onFocus={(event) => event.currentTarget.select()}
      />
      <button type="button" className={buttonVariants({ variant })} onClick={copy}>
        Copy link
      </button>
      {children}
      <p className="hint" role="status">
        {status}
      </p>
    </>
  );
}
