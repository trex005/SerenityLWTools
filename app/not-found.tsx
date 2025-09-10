"use client"

import Link from "next/link"
import { useEffect } from "react"
import { BrandLogo } from "@/components/brand-logo"

export default function NotFound() {
  // Add a useEffect to log 404 errors (could be expanded to send to analytics)
  useEffect(() => {
    console.log("404 page not found:", window.location.pathname)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="mb-8">
        <BrandLogo size={32} />
      </div>

      <div className="w-full max-w-md text-center space-y-6">
        <h1 className="text-4xl font-bold">404 - Page Not Found</h1>

        <div className="p-6 bg-card rounded-lg shadow-lg">
          <p className="text-lg mb-4">The page you are looking for does not exist or has been moved.</p>

          <p className="text-muted-foreground mb-6">
            This is a static application, so all navigation should happen through the main interface.
          </p>

          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          >
            Return to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
