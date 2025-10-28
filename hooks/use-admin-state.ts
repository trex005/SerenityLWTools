"use client"

import { useEffect, useState } from "react"
import { create } from "zustand"
import { scopedLocalStorage } from "@/lib/scoped-storage"

interface AdminState {
  isAdmin: boolean
  hasAdminAccess: boolean
  setIsAdmin: (value: boolean) => void
  setHasAdminAccess: (value: boolean) => void
}

export const useAdminStore = create<AdminState>((set) => ({
  isAdmin: false,
  hasAdminAccess: false,
  setIsAdmin: (value) => set({ isAdmin: value }),
  setHasAdminAccess: (value) => set({ hasAdminAccess: value }),
}))

// Admin password - in a real app, this would be more secure
const ADMIN_PASSWORD = "admin123"

export function useAdminState() {
  const { isAdmin, hasAdminAccess, setIsAdmin, setHasAdminAccess } = useAdminStore()
  const [initialized, setInitialized] = useState(false)

  // Check localStorage on component mount
  useEffect(() => {
    const storedAdminStatus = scopedLocalStorage.getItem("isAdmin")
    const storedAdminAccess = scopedLocalStorage.getItem("hasAdminAccess")

    if (storedAdminStatus === "true" && !isAdmin) {
      setIsAdmin(true)
    }

    if (storedAdminAccess === "true" && !hasAdminAccess) {
      setHasAdminAccess(true)
    }

    setInitialized(true)
  }, [isAdmin, hasAdminAccess, setIsAdmin, setHasAdminAccess])

  // Function to verify admin password
  const verifyAdminPassword = (password: string) => {
    const isCorrect = password === ADMIN_PASSWORD
    if (isCorrect) {
      setIsAdmin(true)
      setHasAdminAccess(true)
      scopedLocalStorage.setItem("isAdmin", "true")
      scopedLocalStorage.setItem("hasAdminAccess", "true")
    }
    return isCorrect
  }

  // Function to enter admin mode without password (if previously authenticated)
  const enterAdminMode = () => {
    if (hasAdminAccess) {
      setIsAdmin(true)
      scopedLocalStorage.setItem("isAdmin", "true")
      return true
    }
    return false
  }

  // Function to exit admin mode
  const exitAdminMode = () => {
    setIsAdmin(false)
    scopedLocalStorage.removeItem("isAdmin")
    // Note: We don't remove hasAdminAccess
  }

  return {
    isAdmin,
    hasAdminAccess,
    verifyAdminPassword,
    enterAdminMode,
    exitAdminMode,
    initialized,
  }
}
