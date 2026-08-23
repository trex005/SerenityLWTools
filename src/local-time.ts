import { useSyncExternalStore } from "react"
import { scopedLocalStorage } from "@/lib/scoped-storage"

const STORAGE_KEY = "show-local-time"

const readInitial = (): boolean => {
  try {
    const saved = scopedLocalStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : true
  } catch {
    return true
  }
}

let value = readInitial()
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => value

export const useShowLocalTime = (): [boolean, (next: boolean) => void] => {
  const current = useSyncExternalStore(subscribe, getSnapshot)
  const set = (next: boolean) => {
    value = next
    try {
      scopedLocalStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Ignore storage failures
    }
    listeners.forEach((listener) => listener())
  }
  return [current, set]
}
