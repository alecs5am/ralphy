import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names with clsx + tailwind-merge. The standard shadcn/ui
 * helper: conditional classes via clsx, then conflict-resolution via
 * tailwind-merge so the last Tailwind utility for a property wins.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
