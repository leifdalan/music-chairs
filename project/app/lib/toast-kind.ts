/**
 * What a toast says about a change (plan/phase-36.md): it worked (green), it
 * was done but not fully (yellow), or it was refused or failed (red).
 */
export type ToastKind = "success" | "warning" | "error";

/** A kind read back from a cookie; anything unknown reads as success. */
export function toastKind(value: unknown): ToastKind {
  return value === "warning" || value === "error" ? value : "success";
}
