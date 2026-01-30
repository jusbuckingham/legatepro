
import * as React from "react";

type ClassValue = string | undefined | null | false;

/**
 * Lightweight utility for conditionally joining class names.
 * Keeps UI primitives dependency-free.
 */
function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  /**
   * Visual treatment presets.
   * - `default`: subtle border + elevated background (matches app surfaces)
   * - `muted`: softer background for nested surfaces
   */
  variant?: "default" | "muted";
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const base = "rounded-xl border shadow-sm";

    const variants: Record<Exclude<CardProps["variant"], undefined>, string> = {
      default: "border-slate-800 bg-slate-950/70",
      muted: "border-slate-800 bg-slate-900/40",
    };

    return (
      <>
        {/*
          NOTE: aria-* attributes (e.g., aria-label, role) are intentionally
          passed through via props for maximum flexibility.
        */}
        <div
          ref={ref}
          className={cx(base, variants[variant], className)}
          {...props}
        />
      </>
    );
  }
);
Card.displayName = "Card";

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cx("space-y-1 border-b border-slate-800 p-4", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cx("text-sm font-semibold text-slate-50", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cx("text-xs text-slate-400", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cx("p-4", className)} {...props} />
));
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cx(
      "flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 p-4",
      className,
    )}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";