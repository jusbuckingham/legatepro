import * as React from "react";

export type PageContainerProps = {
  children: React.ReactNode;
  className?: string;
  /** Use for tighter pages like forms */
  size?: "default" | "narrow";
};

export default function PageContainer({
  children,
  className,
  size = "default",
}: PageContainerProps) {
  const maxWidthClass =
    size === "narrow" ? "max-w-3xl" : "max-w-6xl";

  const containerClassName = [
    "w-full",
    "mx-auto",
    maxWidthClass,
    "px-4 sm:px-6",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClassName}>
      <div className="space-y-6 py-6 sm:py-8">{children}</div>
    </div>
  );
}