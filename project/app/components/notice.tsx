import type { ReactNode } from "react";

import type { NoticeTone } from "~/lib/notices";
import { BrandText } from "./brand";

/**
 * A notice on a working page (plan/phase-38.md): neutral information, a
 * yellow warning when something was done but not fully, or a problem in the
 * page's red when something failed or was refused, announced as an alert.
 */
export function Notice({
  tone,
  className,
  children,
}: {
  tone: NoticeTone;
  /** Marker classes beside the tone's. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      className={`notice notice-${tone}${className ? ` ${className}` : ""}`}
      role={tone === "problem" ? "alert" : "status"}
    >
      {typeof children === "string" ? <BrandText text={children} /> : children}
    </p>
  );
}
