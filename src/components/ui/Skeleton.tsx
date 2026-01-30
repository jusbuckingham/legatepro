/****
 * Simple skeleton/loading placeholder.
 *
 * Usage:
 *   <Skeleton className="h-6 w-40" />
 */

import * as React from "react";
import { cn } from "@/lib/utils";

type SkeletonProps = React.HTMLAttributes<HTMLDivElement> & {
  /**
   * Accessible label for screen readers.
   * Defaults to "Loading".
   */
  "aria-label"?: string;
};

export function Skeleton({
  className,
  "aria-label": ariaLabel = "Loading",
  ...props
}: SkeletonProps) {
  return (
    <div
      aria-busy="true"
      aria-label={ariaLabel}
      role="status"
      className={cn(
        "animate-pulse rounded-md bg-muted/40 dark:bg-muted/30",
        className,
      )}
      {...props}
    />
  );
}

export default Skeleton;