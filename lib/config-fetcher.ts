/**
 * Fetches the configuration from the public directory or from the CONFIG_URL if available
 * This allows us to update the configuration without rebuilding the app
 */
import { initialConfig } from "./config-init"

// Module-level cache for the fetched config
let cachedConfig: any = null
let lastFetchTime = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes in milliseconds
let fetchPromise: Promise<any> | null = null

// Get the CONFIG_URL from environment variables if available
const CONFIG_URL = process.env.CONFIG_URL || null

/**
 * Fetches the configuration from the public directory or from CONFIG_URL if available
 * @param force If true, bypass cache and fetch a fresh copy
 * @param retryCount Number of retries attempted (for internal use)
 */
export async function fetchConfig(force = false, retryCount = 0): Promise<any> {
  console.log(`Fetching config (force=${force}, retryCount=${retryCount})`)

  // Check if we have a valid cached config and we're not forcing a refresh
  const now = Date.now()
  if (!force && cachedConfig && now - lastFetchTime < CACHE_TTL) {
    console.log("Using cached configuration")
    return cachedConfig
  }

  // If a fetch is already in progress and we're not forcing a refresh, return the existing promise
  if (fetchPromise && !force) {
    console.log("Using existing fetch promise")
    return fetchPromise
  }

  // If we're forcing a refresh and there's an existing fetch in progress,
  // cancel it by setting fetchPromise to null
  if (force && fetchPromise) {
    console.log("Cancelling existing fetch promise")
    fetchPromise = null
  }

  // Create a new fetch promise
  fetchPromise = (async () => {
    try {
      let data: any = null

      // Try to fetch from CONFIG_URL first if available
      if (CONFIG_URL) {
        console.log(`Attempting to fetch from CONFIG_URL: ${CONFIG_URL}`)
        try {
          const response = await fetch(`${CONFIG_URL}?t=${Date.now()}`, {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache, no-store, must-revalidate",
              Pragma: "no-cache",
              Expires: "0",
            },
          })

          if (response.ok) {
            // Check if the response is JSON before trying to parse it
            const contentType = response.headers.get("content-type")
            if (contentType && contentType.includes("application/json")) {
              data = await response.json()
              console.log("Successfully fetched from CONFIG_URL")
            } else {
              console.warn(`CONFIG_URL returned non-JSON content: ${contentType}`)
            }
          } else {
            console.warn(`Failed to fetch from CONFIG_URL: ${response.status} ${response.statusText}`)
          }
        } catch (error) {
          //console.error("Error fetching from CONFIG_URL:", error)
        }
      }

      // If CONFIG_URL fetch failed or wasn't available, try the local file
      if (!data) {
        console.log("Attempting to fetch from local public directory")
        const cacheBuster = Date.now()

        // Try both possible paths for the config file
        const configPaths = [`/config-init.json?t=${cacheBuster}`, `/public/config-init.json?t=${cacheBuster}`]

        let response = null
        let successPath = null

        // Try each path until one works
        for (const path of configPaths) {
          try {
            console.log(`Trying path: ${path}`)
            const resp = await fetch(path, {
              cache: "no-store",
              headers: {
                "Cache-Control": "no-cache, no-store, must-revalidate",
                Pragma: "no-cache",
                Expires: "0",
              },
            })

            if (resp.ok) {
              response = resp
              successPath = path
              break
            } else {
              console.warn(`Failed to fetch from ${path}: ${resp.status} ${resp.statusText}`)
            }
          } catch (error) {
            console.warn(`Error fetching from ${path}:`, error)
          }
        }

        if (!response) {
          console.warn("All fetch attempts failed, using initial config")
          return initialConfig
        }

        try {
          // Check if the response is JSON before trying to parse it
          const contentType = response.headers.get("content-type")
          if (contentType && contentType.includes("application/json")) {
            data = await response.json()
            console.log(`Successfully fetched from ${successPath}`)
          } else {
            console.warn(`Response is not JSON (${contentType}), using initial config`)
            // If we get HTML or other non-JSON content, use the initial config
            return initialConfig
          }
        } catch (parseError) {
          console.error("Error parsing JSON:", parseError)
          return initialConfig
        }
      }

      // Validate that the data has the expected structure
      if (!data || !data.events || !Array.isArray(data.events)) {
        console.warn("Invalid configuration format, falling back to initial config")
        return initialConfig
      }

      // Successfully loaded configuration
      console.log("Configuration loaded successfully")

      // Check if we're in a browser environment and in admin mode
      const isBrowser = typeof window !== "undefined"
      const isAdmin = isBrowser && localStorage.getItem("isAdmin") === "true"

      // Only update the cache if in admin mode or not in a browser
      if (isAdmin || !isBrowser) {
        cachedConfig = data
        lastFetchTime = now
      }

      return data
    } catch (error) {
      console.error("Error fetching configuration:", error)
      return initialConfig
    } finally {
      // Clear the promise when done
      fetchPromise = null
    }
  })()

  return fetchPromise
}

// Function to explicitly clear the cache
export function clearConfigCache() {
  console.log("Clearing config cache")
  cachedConfig = null
  lastFetchTime = 0
  fetchPromise = null
}

// Preload the configuration without using hooks
if (typeof window !== "undefined") {
  setTimeout(() => {
    fetchConfig().catch((error) => {
      console.error("Error during initial config fetch:", error)
    })
  }, 100)
}
