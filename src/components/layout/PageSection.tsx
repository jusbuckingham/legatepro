import * as React from "react";

export type PageSectionProps = {
  id?: string;
  title?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

/**
 * Lightweight, consistent section wrapper for pages.
 * Use for vertical rhythm: header (optional) + content.
 */
export default function PageSection({
  id,
  title,
  description,
  actions,
  children,
  className,
}: PageSectionProps) {
  const hasHeader = Boolean(title || description || actions);
  const sectionClassName = ["w-full", "space-y-6", className].filter(Boolean).join(" ");
  const titleId = id && title ? `${id}-title` : undefined;

  return (
    <section id={id} aria-labelledby={titleId} className={sectionClassName}>
      {hasHeader ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title ? (
              <h2
                id={titleId}
                className="text-base font-semibold leading-tight tracking-tight sm:text-lg"
              >
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
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
        </div>
      ) : null}

      <div className="space-y-6">{children}</div>
    </section>
  );
}