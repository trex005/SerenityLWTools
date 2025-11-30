"use client"

import { useEffect, useState } from "react"
import { create } from "zustand"
import { scopedLocalStorage } from "@/lib/scoped-storage"

interface AdminState {
  adminMode: boolean
  hasAdminAccess: boolean
  setadminMode: (value: boolean) => void
  setHasAdminAccess: (value: boolean) => void
}

export const useAdminStore = create<AdminState>((set) => ({
  adminMode: false,
  hasAdminAccess: false,
  setadminMode: (value) => set({ adminMode: value }),
  setHasAdminAccess: (value) => set({ hasAdminAccess: value }),
}))

// Admin password - in a real app, this would be more secure
const ADMIN_PASSWORD = "admin123"

export function useAdminState() {
  const { adminMode, hasAdminAccess, setadminMode, setHasAdminAccess } = useAdminStore()
  const [initialized, setInitialized] = useState(false)

  // Check localStorage on component mount
  useEffect(() => {
    const storedAdminStatus = scopedLocalStorage.getItem("adminMode")
    const storedAdminAccess = scopedLocalStorage.getItem("hasAdminAccess")

    if (storedAdminStatus === "true" && !adminMode) {
      setadminMode(true)
    }

    if (storedAdminAccess === "true" && !hasAdminAccess) {
      setHasAdminAccess(true)
    }

    setInitialized(true)
  }, [adminMode, hasAdminAccess, setadminMode, setHasAdminAccess])

  // Function to verify admin password
  const verifyAdminPassword = (password: string) => {
    const isCorrect = password === ADMIN_PASSWORD
    if (isCorrect) {
      setadminMode(true)
      setHasAdminAccess(true)
      scopedLocalStorage.setItem("adminMode", "true")
      scopedLocalStorage.setItem("hasAdminAccess", "true")
    }
    return isCorrect
  }

  // Function to enter admin mode without password (if previously authenticated)
  const enterAdminMode = () => {
    if (hasAdminAccess) {
      setadminMode(true)
      scopedLocalStorage.setItem("adminMode", "true")
      return true
    }
    return false
  }

  // Function to exit admin mode
  const exitAdminMode = () => {
    setadminMode(false)
    scopedLocalStorage.removeItem("adminMode")
    // Note: We don't remove hasAdminAccess
  }

  return {
    adminMode,
    hasAdminAccess,
    verifyAdminPassword,
    enterAdminMode,
    exitAdminMode,
    initialized,
  }
}
