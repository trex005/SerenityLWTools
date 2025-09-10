"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { MinusIcon, PlusIcon } from "lucide-react"
import { useState, useEffect } from "react"

interface CustomNumberInputProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
}

export function CustomNumberInput({
  value,
  onChange,
  min = 1,
  max = 100,
  step = 1,
  className = "",
}: CustomNumberInputProps) {
  const [localValue, setLocalValue] = useState(value.toString())

  // Update local value when prop changes
  useEffect(() => {
    setLocalValue(value.toString())
  }, [value])

  const increment = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const newValue = Math.min(max, value + step)
    onChange(newValue)
  }

  const decrement = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const newValue = Math.max(min, value - step)
    onChange(newValue)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    e.stopPropagation()

    // Always update the local display value
    setLocalValue(e.target.value)

    // Only update the actual value if it's a valid number
    const parsed = Number.parseInt(e.target.value, 10)
    if (!isNaN(parsed) && parsed >= min && parsed <= max) {
      onChange(parsed)
    }
  }

  const handleBlur = () => {
    // Reset to actual value if invalid
    const parsed = Number.parseInt(localValue, 10)
    if (isNaN(parsed) || parsed < min || parsed > max) {
      setLocalValue(value.toString())
    }
  }

  return (
    <div className={`flex items-center ${className}`} onClick={(e) => e.stopPropagation()}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8 rounded-r-none"
        onClick={decrement}
        disabled={value <= min}
      >
        <MinusIcon className="h-3 w-3" />
      </Button>
      <input
        type="text"
        value={localValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        className="h-8 w-12 border-y border-input bg-transparent px-2 py-1 text-center text-sm"
        onClick={(e) => e.stopPropagation()}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8 rounded-l-none"
        onClick={increment}
        disabled={value >= max}
      >
        <PlusIcon className="h-3 w-3" />
      </Button>
    </div>
  )
}
