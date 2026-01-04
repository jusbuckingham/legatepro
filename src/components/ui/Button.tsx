

"use client";

import * as React from "react";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive";

type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
};

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "border border-rose-500 bg-rose-500 text-white hover:bg-rose-400 hover:border-rose-400 focus-visible:ring-rose-500",
  secondary:
    "border border-slate-800 bg-slate-900/70 text-slate-100 hover:bg-slate-900 focus-visible:ring-slate-500",
  outline:
    "border border-slate-700 bg-transparent text-slate-100 hover:bg-slate-900/60 focus-visible:ring-slate-500",
  ghost:
    "border border-transparent bg-transparent text-slate-200 hover:bg-slate-900/60 focus-visible:ring-slate-500",
  destructive:
    "border border-rose-500/70 bg-rose-950/40 text-rose-100 hover:bg-rose-900/50 focus-visible:ring-rose-500",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-3.5 text-xs",
  lg: "h-10 px-4 text-sm",
};

function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className
      )}
    />
  );
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "secondary",
      size = "md",
      isLoading = false,
      disabled,
      type,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = Boolean(disabled || isLoading);

    return (
      <button
        ref={ref}
        type={type ?? "button"}
        disabled={isDisabled}
        aria-busy={isLoading || undefined}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md font-semibold tracking-wide",
          "transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
          "disabled:cursor-not-allowed disabled:opacity-60",
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className
        )}
        {...props}
      >
        {isLoading ? <Spinner /> : null}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;