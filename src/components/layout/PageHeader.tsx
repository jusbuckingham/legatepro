import * as React from "react";

export type PageHeaderSize = "md" | "lg";

export type PageHeaderProps = {
  /** Small label above the title (e.g., "Estate", "Invoices") */
  eyebrow?: React.ReactNode;
  title: string;
  description?: string;
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
  const titleClass =
    size === "lg"
      ? "text-2xl sm:text-3xl font-semibold tracking-tight"
      : "text-xl sm:text-2xl font-semibold tracking-tight";

  return (
    <div
      className={[
        "w-full",
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        "pb-1",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {eyebrow}
          </div>
        ) : null}

        <h1 className={titleClass}>{title}</h1>

        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      {actions ? (
        <div className="shrink-0 pt-1 sm:pt-0">
          <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
            {actions}
          </div>
        </div>
      ) : null}
    </div>
  );
}