"use client"

/**
 * Main page component for the Serenity Last War Tools application
 * This serves as the entry point for the application and provides a tab-based interface
 * for navigating between operations, intel, and command sections.
 */

import { useAdminState } from "@/hooks/use-admin-state"
import { AdminInterface } from "@/components/admin-interface"
import { UserInterface } from "@/components/user-interface"
import { AdminAccessTrigger } from "@/components/admin-access-trigger"
import { useEffect, useState } from "react"
import { BrandLogo } from "@/components/brand-logo"

export default function Home() {
  const { isAdmin, initialized } = useAdminState()
  const [isLoading, setIsLoading] = useState(true)

  // Wait for admin state to be initialized from localStorage
  useEffect(() => {
    if (initialized) {
      setIsLoading(false)
    }
  }, [initialized])

  if (isLoading) {
    return (
      <main className="container mx-auto p-4 max-w-5xl">
        <div className="mb-6">
          <BrandLogo size={32} />
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </main>
    )
  }

  return (
    <main className="container mx-auto p-4 max-w-5xl">
      <div className="mb-6">
        <BrandLogo size={32} />
      </div>

      {isAdmin ? <AdminInterface /> : <UserInterface />}

      {/* Include the admin access trigger */}
      <AdminAccessTrigger />
    </main>
  )
}
