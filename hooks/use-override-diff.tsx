"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { computeDiffIndexForTag, type DiffIndex } from "@/lib/config-diff"
import { useEvents } from "@/hooks/use-events"
import { useTips } from "@/hooks/use-tips"

type OverrideDiffValue = {
  diffIndex: DiffIndex | null
  loading: boolean
  refresh: () => void
}

const OverrideDiffContext = createContext<OverrideDiffValue | null>(null)

export function OverrideDiffProvider({ children }: { children: ReactNode }) {
  const events = useEvents((state) => state.events)
  const activeTag = useEvents((state) => state.activeTag)
  const tips = useTips((state) => state.tips)
  const [diffIndex, setDiffIndex] = useState<DiffIndex | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    const loadDiff = async () => {
      setLoading(true)
      try {
        const result = await computeDiffIndexForTag(events, tips, activeTag)
        if (!cancelled) {
          setDiffIndex(result)
        }
      } catch (error) {
        console.error("Failed to compute override diff index", error)
        if (!cancelled) {
          setDiffIndex(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadDiff()
    return () => {
      cancelled = true
    }
  }, [events, tips, activeTag, refreshToken])

  const value = useMemo<OverrideDiffValue>(
    () => ({
      diffIndex,
      loading,
      refresh: () => setRefreshToken((token) => token + 1),
    }),
    [diffIndex, loading],
  )

  return <OverrideDiffContext.Provider value={value}>{children}</OverrideDiffContext.Provider>
}

export const useOverrideDiff = (): OverrideDiffValue => {
  const context = useContext(OverrideDiffContext)
  if (!context) {
    return {
      diffIndex: null,
      loading: false,
      refresh: () => {},
    }
  }
  return context
}
