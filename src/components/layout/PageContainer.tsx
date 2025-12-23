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
  const width =
    size === "narrow" ? "max-w-3xl" : "max-w-6xl";

  return (
    <div className={["w-full", "mx-auto", width, "px-4 sm:px-6", className].filter(Boolean).join(" ")}>
      <div className="py-6 sm:py-8 space-y-6">{children}</div>
    </div>
  );
}