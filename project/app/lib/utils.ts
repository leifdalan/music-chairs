// shadcn/ui's class-name helper (plan/phase-19.1.md): joins conditional classes and
// lets a later Tailwind utility override an earlier one.
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names, later Tailwind utilities winning over conflicting earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
