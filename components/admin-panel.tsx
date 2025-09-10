/**
 * Admin Panel Component
 *
 * This component provides administrative functions like data import/export
 * and clearing data. It displays statistics about the current data state.
 */
"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useEvents } from "@/hooks/use-events"
import { useTips } from "@/hooks/use-tips"
import { Download, Upload, Trash2, AlertTriangle, Key, RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import { v4 as uuidv4 } from "uuid"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { fetchConfig, clearConfigCache } from "@/lib/config-fetcher"
import AWS from "aws-sdk"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { initialConfig } from "@/lib/config-init"

/**
 * AdminPanel component
 * Provides tools for managing application data, including import/export and reset functionality
 */
export function AdminPanel() {
  // Access data stores
  const { events, setEvents } = useEvents()
  const { tips } = useTips()
  const { toast } = useToast()

  // State for confirmation dialogs
  const [showRestoreDefaultsDialog, setShowRestoreDefaultsDialog] = useState(false)
  // Add state for cache invalidation
  const [isInvalidating, setIsInvalidating] = useState(false)
  // Add state for restore operation
  const [isRestoring, setIsRestoring] = useState(false)

  // Add state for AWS credentials dialog
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false)
  const [credentials, setCredentials] = useState({
    accessKeyId: "",
    secretAccessKey: "",
  })
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false)
  const [invalidationError, setInvalidationError] = useState<string | null>(null)
  const [invalidationResult, setInvalidationResult] = useState<string | null>(null)
  const [invalidationId, setInvalidationId] = useState<string | null>(null)

  // Check for stored credentials on component mount
  useEffect(() => {
    const storedAccessKeyId = localStorage.getItem("aws_access_key_id")
    const storedSecretAccessKey = localStorage.getItem("aws_secret_access_key")

    if (storedAccessKeyId && storedSecretAccessKey) {
      setCredentials({
        accessKeyId: storedAccessKeyId,
        secretAccessKey: storedSecretAccessKey,
      })
      setHasStoredCredentials(true)
    }
  }, [])

  /**
   * Save AWS credentials to localStorage
   */
  const saveCredentials = () => {
    localStorage.setItem("aws_access_key_id", credentials.accessKeyId)
    localStorage.setItem("aws_secret_access_key", credentials.secretAccessKey)
    setHasStoredCredentials(true)
    setShowCredentialsDialog(false)
  }

  /**
   * Prepare data for export by ensuring empty end times are preserved
   */
  const prepareDataForExport = (events: any[]) => {
    return events.map((event) => {
      // Create a deep copy of the event to avoid modifying the original
      const eventCopy = JSON.parse(JSON.stringify(event))

      // Ensure empty end times are explicitly set to empty strings
      if (!eventCopy.endTime) {
        eventCopy.endTime = ""
      }

      // Handle variations
      if (eventCopy.variations) {
        Object.keys(eventCopy.variations).forEach((day) => {
          if (eventCopy.variations[day] && !eventCopy.variations[day].endTime) {
            eventCopy.variations[day].endTime = ""
          }
        })
      }

      return eventCopy
    })
  }

  /**
   * Export all data to a JSON file
   * Creates a downloadable JSON file with events and tips data
   */
  const exportData = () => {
    // Create a data object with all application data
    const data = {
      events: prepareDataForExport(events),
      tips,
      exportDate: new Date().toISOString(),
    }

    // Create a blob and download link
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `daily-agenda-export-${new Date().toISOString()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /**
   * Import data from a JSON file
   * Reads the selected file and imports events and tips data
   */
  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string)
        const importSummary = []

        if (data.events) {
          setEvents(data.events)
          importSummary.push(`${data.events.length} events`)
        }

        if (data.tips) {
          // Ensure all tips have IDs
          const tipsWithIds = data.tips.map((tip: any) => ({
            ...tip,
            id: tip.id || uuidv4(),
          }))
          useTips.setState({ tips: tipsWithIds })
          importSummary.push(`${data.tips.length} tips`)
        }

        // Show success toast with import summary
        toast({
          title: "Import Successful",
          description: `Imported ${importSummary.join(" and ")}`,
          variant: "success",
        })
      } catch (error) {
        // Error importing data
        toast({
          title: "Import Failed",
          description: "There was an error importing your data. Please check the file format.",
          variant: "destructive",
        })
      }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  /**
   * Reset all data to defaults from config-init.json
   */
  const handleRestoreDefaults = async () => {
    setIsRestoring(true)

    try {
      // Clear the config cache first
      clearConfigCache()

      // Clear the data
      useEvents.setState({ events: [] })
      useTips.setState({ tips: [] })

      // Reset the initialized flags in the stores to force reinitialization
      useEvents.setState({ initialized: false })
      useTips.setState({ initialized: false })

      // Try to fetch the config, but use initialConfig as a fallback
      let config
      try {
        config = await fetchConfig(true)
      } catch (error) {
        console.error("Error fetching config, using initialConfig:", error)
        config = initialConfig
      }

      // Set the data directly
      useEvents.setState({
        events: config.events || initialConfig.events,
        filteredEvents: config.events || initialConfig.events,
        initialized: true,
      })

      useTips.setState({
        tips: config.tips || initialConfig.tips,
        filteredTips: config.tips || initialConfig.tips,
        initialized: true,
      })

      // Show success toast
      toast({
        title: "Default Data Restored",
        description: "The application has been reset to its default state.",
        variant: "success",
      })
    } catch (error) {
      console.error("Error restoring defaults:", error)

      // Show error toast
      toast({
        title: "Error Restoring Defaults",
        description: "There was an error restoring the default data. Please try again or refresh the page.",
        variant: "destructive",
      })
    } finally {
      setIsRestoring(false)
      setShowRestoreDefaultsDialog(false)
    }
  }

  /**
   * Handle cache invalidation with AWS credentials
   */
  const handleInvalidateCache = async () => {
    // If no credentials are stored, show the credentials dialog
    if (!hasStoredCredentials) {
      setShowCredentialsDialog(true)
      return
    }

    setIsInvalidating(true)
    setInvalidationError(null)
    setInvalidationResult(null)
    setInvalidationId(null)

    try {
      // Configure AWS with stored credentials
      AWS.config.update({
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        region: "us-east-1", // CloudFront is global but API calls go through us-east-1
      })

      // Create CloudFront service object
      const cloudfront = new AWS.CloudFront()

      // Distribution ID for the CloudFront distribution
      const distributionId = "E2YA1IN0GY7BLP"

      // Create invalidation parameters
      const params = {
        DistributionId: distributionId,
        InvalidationBatch: {
          CallerReference: Date.now().toString(),
          Paths: {
            Quantity: 1,
            Items: ["/*"], // Invalidate all paths
          },
        },
      }

      // Create the invalidation
      const result = await cloudfront.createInvalidation(params).promise()

      // Store the invalidation ID for reference
      if (result.Invalidation?.Id) {
        setInvalidationId(result.Invalidation.Id)
      }

      // Show success message
      setInvalidationResult(`
        Cache invalidation successfully initiated!
        
        Invalidation ID: ${result.Invalidation?.Id || "Unknown"}
        Status: ${result.Invalidation?.Status || "Pending"}
        
        The invalidation is now processing and will take 5-15 minutes to complete.
        All cached content will be refreshed.
      `)

      // Show success toast
      toast({
        title: "Cache Invalidation Started",
        description: "CloudFront cache invalidation has been initiated successfully.",
        variant: "success",
      })

      // Clear the local cache as well
      clearConfigCache()
      await fetchConfig(true)
    } catch (error: any) {
      console.error("Error invalidating CloudFront cache:", error)

      // Set error message for display
      setInvalidationError(error.message || "Unknown error occurred")

      // If the error is related to credentials, prompt for new ones
      if (
        error.code === "InvalidClientTokenId" ||
        error.code === "SignatureDoesNotMatch" ||
        error.message?.includes("credentials") ||
        error.message?.includes("token")
      ) {
        setShowCredentialsDialog(true)
      }

      // Show error toast
      toast({
        title: "Cache Invalidation Failed",
        description: error.message || "Unknown error occurred",
        variant: "destructive",
      })
    } finally {
      setIsInvalidating(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Admin Panel</CardTitle>
        <CardDescription>Manage your data and application settings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4">
          {/* Import/Export Section */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={exportData} className="flex items-center">
              <Download className="mr-2 h-4 w-4" /> Export All Data
            </Button>
            <div className="relative">
              <Input
                type="file"
                accept=".json"
                onChange={importData}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Button variant="outline" className="w-full flex items-center">
                <Upload className="mr-2 h-4 w-4" /> Import Data
              </Button>
            </div>
          </div>

          {/* Danger Zone Section */}
          <div className="grid gap-2">
            <h3 className="text-lg font-medium">Danger Zone</h3>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="destructive"
                onClick={() => setShowRestoreDefaultsDialog(true)}
                className="flex items-center"
                disabled={isRestoring}
              >
                {isRestoring ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Restoring...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" /> Restore Default Data
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Statistics Section */}
          <div className="grid gap-2">
            <h3 className="text-lg font-medium">Statistics</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{events.length}</div>
                  <div className="text-sm text-muted-foreground">Total Events</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{tips.length}</div>
                  <div className="text-sm text-muted-foreground">Total Tips</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">
                    {
                      Object.values(
                        events.reduce((acc: Record<string, boolean>, event) => {
                          event.days.forEach((day) => {
                            acc[day] = true
                          })
                          return acc
                        }, {}),
                      ).length
                    }
                  </div>
                  <div className="text-sm text-muted-foreground">Days with Events</div>
                </CardContent>
              </Card>
            </div>
          </div>
          {/* Cache Management Section */}
          <div className="grid gap-2 mt-4">
            <h3 className="text-lg font-medium">Cache Management</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Invalidate the CloudFront cache to ensure visitors see the latest content.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={handleInvalidateCache}
                disabled={isInvalidating}
                className="w-full sm:w-auto flex items-center"
              >
                {isInvalidating ? "Invalidating Cache..." : "Invalidate CloudFront Cache"}
                <RefreshCw className={`ml-2 h-4 w-4 ${isInvalidating ? "animate-spin" : ""}`} />
              </Button>

              {hasStoredCredentials && (
                <Button
                  variant="outline"
                  onClick={() => setShowCredentialsDialog(true)}
                  className="w-full sm:w-auto flex items-center"
                >
                  <Key className="mr-2 h-4 w-4" /> Update AWS Credentials
                </Button>
              )}
            </div>

            {invalidationError && (
              <div className="mt-2 p-3 bg-destructive/10 border border-destructive/30 rounded-md flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-destructive">Error:</p>
                  <p className="text-destructive/90">{invalidationError}</p>
                </div>
              </div>
            )}

            {invalidationResult && (
              <div className="mt-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-md">
                <p className="font-medium text-blue-700 dark:text-blue-400 mb-2">Invalidation Status:</p>
                <pre className="text-sm whitespace-pre-wrap text-muted-foreground">{invalidationResult}</pre>
              </div>
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <div className="text-sm text-muted-foreground"></div>
      </CardFooter>

      {/* Confirmation Dialog */}
      <AlertDialog open={showRestoreDefaultsDialog} onOpenChange={setShowRestoreDefaultsDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Default Data</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restore the default data? This will replace all current events and tips with the
              original default data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestoreDefaults}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isRestoring}
            >
              {isRestoring ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Restoring...
                </>
              ) : (
                "Restore Defaults"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AWS Credentials Dialog */}
      <Dialog open={showCredentialsDialog} onOpenChange={setShowCredentialsDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>AWS Credentials</DialogTitle>
            <DialogDescription>
              Enter your AWS credentials to invalidate the CloudFront cache. These will be stored securely in your
              browser.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="accessKeyId">Access Key ID</Label>
              <Input
                id="accessKeyId"
                value={credentials.accessKeyId}
                onChange={(e) => setCredentials({ ...credentials, accessKeyId: e.target.value })}
                placeholder="AKIAIOSFODNN7EXAMPLE"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="secretAccessKey">Secret Access Key</Label>
              <Input
                id="secretAccessKey"
                type="password"
                value={credentials.secretAccessKey}
                onChange={(e) => setCredentials({ ...credentials, secretAccessKey: e.target.value })}
                placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCredentialsDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveCredentials} disabled={!credentials.accessKeyId || !credentials.secretAccessKey}>
              Save Credentials
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
