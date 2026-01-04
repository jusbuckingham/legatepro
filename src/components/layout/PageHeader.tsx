import * as React from "react";

function cx(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

export type PageHeaderSize = "md" | "lg";

export type PageHeaderProps = {
  /** Small label above the title (e.g., "Estate", "Invoices") */
  eyebrow?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  size?: PageHeaderSize;
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