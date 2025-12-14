/**
 * Utility for handling hash-based navigation
 * This uses a polling approach to check if the tips tab is active
 */

// Track if we've already processed the hash
let hashProcessed = false

/**
 * Process a tip hash in the URL
 * @param setActiveTab Function to set the active tab
 * @param forceRefreshTips Function to force refresh the tips component
 */
export function setupTipHashNavigation(setActiveTab: (tab: string) => void, forceRefreshTips: () => void) {
  // Skip if we've already processed this hash
  if (hashProcessed || typeof window === "undefined") return

  const tipId = getTipIdFromLocation()
  if (!tipId) return

  console.log(`Switching to tips for tip navigation: ${tipId}`)
  setActiveTab("tips")
  forceRefreshTips()
  hashProcessed = true
}

/**
 * Reset the hash processed flag
 * Call this when you want to process the hash again
 */
export function resetHashProcessed() {
  hashProcessed = false
}

/**
 * Extract the tip identifier from the URL hash or /t/{id} path
 */
export function getTipIdFromLocation(): string | null {
  if (typeof window === "undefined") return null

  const hash = window.location.hash
  if (hash && hash.startsWith("#tip-")) {
    return decodeURIComponent(hash.substring(5))
  }

  const pathname = window.location.pathname || ""
  if (pathname.startsWith("/t/")) {
    const trimmed = pathname.replace(/^\/t\//, "").replace(/\/$/, "")
    if (trimmed) {
      return decodeURIComponent(trimmed)
    }
  }

  return null
}
