/**
 * Utility Functions
 *
 * This file contains utility functions used throughout the application.
 * Currently it only contains a function for merging class names.
 */
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * cn (class names) function
 *
 * A utility function for merging Tailwind CSS classes and conditional classes
 * using clsx and tailwind-merge. This helps avoid class conflicts when
 * conditionally applying Tailwind classes.
 *
 * Example usage:
 * const buttonClasses = cn(
 *   "base-class",
 *   variant === "primary" ? "bg-blue-500" : "bg-gray-200",
 *   isLarge && "text-lg",
 * )
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
