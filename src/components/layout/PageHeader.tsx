import * as React from "react";

/**
 * Lightweight utility for conditionally joining class names.
 * Keeps this component dependency-free.
 */
function cx(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

export type PageHeaderSize = "md" | "lg";

export type PageHeaderProps = {
  /** Optional small label above the title (e.g. section or resource name) */
  eyebrow?: React.ReactNode;
  /** Primary page heading */
  title: string;
  /** Optional supporting text shown beneath the title */
  description?: React.ReactNode;
  /** Right-aligned actions (buttons, links, etc.) */
  actions?: React.ReactNode;
  /** Visual size of the header title */
  size?: PageHeaderSize;
  /** Optional className for layout overrides */
  className?: string;
};

export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  size = "lg",
  className,
}: PageHeaderProps) {
  // Adjust typography scale based on header size
  const titleSizeClass =
    size === "lg"
      ? "text-2xl sm:text-3xl font-semibold tracking-tight"
      : "text-xl sm:text-2xl font-semibold tracking-tight";

  return (
    <header
      className={cx(
        "w-full",
        "mb-6",
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        {/* Eyebrow / section label */}
        {eyebrow ? (
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {eyebrow}
          </div>
        ) : null}

        <h1 className={titleSizeClass}>{title}</h1>

        {description ? (
          <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      {/* Action buttons / controls */}
      {actions ? (
        <div className="shrink-0">
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {actions}
          </div>
        </div>
      ) : null}
    </header>
  );
}