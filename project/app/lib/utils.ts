// shadcn/ui's class-name helper (plan/phase-19.1.md): joins conditional
// classes. Nothing relies on one utility overriding another (plan/phase-40.md):
// a pressed button's saving and saved looks are `data-state` rules in app.css.
import { clsx, type ClassValue } from "clsx";

/** Joins class names. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
