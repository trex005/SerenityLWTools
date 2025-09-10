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

  const hash = window.location.hash
  if (!hash || !hash.startsWith("#tip-")) return

  console.log("Setting up tip hash navigation polling")

  // Set up polling to check if the tips tab is active
  const checkInterval = 250 // Check every 250ms
  let attempts = 0
  const maxAttempts = 40 // 10 seconds max (40 * 250ms)

  const intervalId = setInterval(() => {
    attempts++

    // Get the currently active tab
    const activeTabElement = document.querySelector('[role="tablist"] [data-state="active"]')
    const isIntelTabActive = activeTabElement?.textContent?.includes("Intel")

    console.log(`Checking if Intel tab is active (attempt ${attempts}): ${isIntelTabActive}`)

    if (isIntelTabActive) {
      // Intel tab is active, process the hash
      console.log("Intel tab is active, processing hash navigation")

      // Switch to the tips tab (should already be active, but just to be sure)
      setActiveTab("tips")

      // Force refresh the tips component
      forceRefreshTips()

      // Mark as processed and clear the interval
      hashProcessed = true
      clearInterval(intervalId)
    } else if (attempts >= maxAttempts) {
      // Give up after max attempts
      console.log("Giving up on hash navigation after max attempts")
      clearInterval(intervalId)
    } else {
      // Not active yet, switch to the tips tab
      console.log("Intel tab not active yet, switching to it")
      setActiveTab("tips")
    }
  }, checkInterval)

  // Clean up the interval if the page is unloaded
  window.addEventListener("beforeunload", () => {
    clearInterval(intervalId)
  })

  return () => {
    clearInterval(intervalId)
  }
}

/**
 * Reset the hash processed flag
 * Call this when you want to process the hash again
 */
export function resetHashProcessed() {
  hashProcessed = false
}
