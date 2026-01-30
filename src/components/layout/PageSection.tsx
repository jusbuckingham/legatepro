import * as React from "react";

export type PageSectionProps = {
  /** Optional DOM id for deep-linking and accessibility */
  id?: string;
  /** Section heading */
  title?: string;
  /** Optional supporting description under the title */
  description?: React.ReactNode;
  /** Right-aligned actions (buttons, links, menus) */
  actions?: React.ReactNode;
  /** Main section content */
  children: React.ReactNode;
  /** Optional additional classes applied to the section wrapper */
  className?: string;
};

/**
 * PageSection
 *
 * Lightweight, consistent section wrapper for pages.
 * Provides vertical rhythm with an optional header (title / description / actions)
 * followed by content.
 *
 * Intended to be used inside PageContainer or page-level layouts.
 */
const PageSection = React.forwardRef<HTMLElement, PageSectionProps>(
  function PageSection(
    { id, title, description, actions, children, className },
    ref,
  ) {
    const hasHeader = Boolean(title || description || actions);
    const titleId = id && title ? `${id}-title` : undefined;

    const sectionClassName = ["w-full", "space-y-6", className]
      .filter(Boolean)
      .join(" ");

    return (
      <section
        ref={ref}
        id={id}
        aria-labelledby={titleId}
        className={sectionClassName}
      >
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
  },
);

export default PageSection;