// Adapted from shadcn/ui's new-york-v4 Button (ui.shadcn.com, MIT): no Radix
// Slot (links take `buttonVariants` directly), every size at least 44px tall,
// and focus drawn by app.css's one :focus-visible rule. Emits data-variant.
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap no-underline transition-colors disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        // Dark mode's --destructive is a light red for error text on the dark page;
        // white button text needs a darker red (about 6:1).
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 dark:bg-[oklch(0.5_0.19_25)] dark:hover:bg-[oklch(0.45_0.19_25)]",
        outline:
          "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline underline-offset-4",
      },
      size: {
        default: "min-h-11 px-4 py-2 has-[>svg]:px-3",
        sm: "min-h-11 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "min-h-11 px-6 text-base has-[>svg]:px-4",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

/** A shadcn button: `variant` sets its weight in the page, `size` its padding. */
export function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      data-slot="button"
      data-variant={variant}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
