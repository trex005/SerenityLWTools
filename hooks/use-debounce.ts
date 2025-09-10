"use client"

/**
 * Custom hook for debouncing values
 *
 * This hook delays updating a value until a specified delay has passed
 * since the last change, useful for search inputs to avoid excessive
 * processing while the user is still typing.
 */
import { useState, useEffect } from "react"

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    // Set a timeout to update the debounced value after the specified delay
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    // Clear the timeout if the value changes before the delay expires
    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}
