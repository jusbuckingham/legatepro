/**
 * Utility function for merging Tailwind + conditional class names.
 * Follows the standard shadcn/ui pattern.
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
