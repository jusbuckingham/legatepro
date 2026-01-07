/****
 * Simple skeleton/loading placeholder.
 *
 * Usage:
 *   <Skeleton className="h-6 w-40" />
 */

import React from "react";

type SkeletonProps = {
  className?: string;
  "aria-label"?: string;
};

export function Skeleton({ className = "", "aria-label": ariaLabel }: SkeletonProps) {
  return (
    <div
      aria-label={ariaLabel ?? "Loading"}
      aria-busy="true"
      className={`animate-pulse rounded-md bg-gray-200 ${className}`.trim()}
    />
  );
}

export default Skeleton;
