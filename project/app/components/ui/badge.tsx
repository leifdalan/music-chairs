// Adapted from shadcn/ui's new-york-v4 Badge (ui.shadcn.com, MIT), without Radix
// Slot: a small status label.
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";

export const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        success: "border-transparent bg-success text-success-foreground",
        outline: "text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

/** A small status label, e.g. "Complete" or "Answered". */
export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
