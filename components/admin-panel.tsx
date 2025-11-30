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
import { useEvents, type Event } from "@/hooks/use-events"
import { useTips, type Tip } from "@/hooks/use-tips"
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
import {
  fetchConfig,
  clearConfigCache,
  buildChildDeltaFiles,
  fetchComposedForTag,
  type TagBundle,
} from "@/lib/config-fetcher"
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
import {
  scopedLocalStorage,
  listTagsWithStoredData,
  readScopedStateForTag,
  clearScopedDataForTags,
  TAG_DATA_STORAGE_KEYS,
} from "@/lib/scoped-storage"
import { getActiveTag } from "@/lib/config-tag"
import JSZip from "jszip"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { buildIdMap, composeWithOverrides, deriveOverridesFromFinal } from "@/lib/override-helpers"

const EVENTS_STORAGE_KEY = "daily-agenda-events"
const TIPS_STORAGE_KEY = "daily-agenda-tips"

type StoredEventsState = {
  overridesById?: Record<string, any>
  deletedEventIds?: string[]
  legacyEvents?: any[]
}

type StoredTipsState = {
  overridesById?: Record<string, any>
  deletedTipIds?: string[]
  legacyTips?: any[]
}

const loadStoredEventsForTag = async (tag: string): Promise<any[]> => {
  const persisted = readScopedStateForTag<{ state?: StoredEventsState }>(tag, EVENTS_STORAGE_KEY)
  const stored = persisted?.state
  if (!stored) return []
  const bundle = await fetchComposedForTag(tag, false, { includeAncestorLocalOverrides: true })
  const baseEvents = Array.isArray(bundle?.events) ? bundle.events : []
  const baseMap = buildIdMap(baseEvents)
  let overrides = stored.overridesById || {}
  let deletedIds = Array.isArray(stored.deletedEventIds) ? stored.deletedEventIds : []
  if (Array.isArray(stored.legacyEvents) && stored.legacyEvents.length > 0) {
    const derived = deriveOverridesFromFinal(stored.legacyEvents, baseMap)
    overrides = derived.overridesById
    deletedIds = derived.deletedIds
  }
  return composeWithOverrides(baseEvents, overrides, deletedIds)
}

const loadStoredTipsForTag = async (tag: string): Promise<any[]> => {
  const persisted = readScopedStateForTag<{ state?: StoredTipsState }>(tag, TIPS_STORAGE_KEY)
  const stored = persisted?.state
  if (!stored) return []
  const bundle = await fetchComposedForTag(tag, false, { includeAncestorLocalOverrides: true })
  const baseTips = Array.isArray(bundle?.tips) ? bundle.tips : []
  const baseMap = buildIdMap(baseTips)
  let overrides = stored.overridesById || {}
  let deletedIds = Array.isArray(stored.deletedTipIds) ? stored.deletedTipIds : []
  if (Array.isArray(stored.legacyTips) && stored.legacyTips.length > 0) {
    const derived = deriveOverridesFromFinal(stored.legacyTips, baseMap)
    overrides = derived.overridesById
    deletedIds = derived.deletedIds
  }
  return composeWithOverrides(baseTips, overrides, deletedIds)
}

/**
 * AdminPanel component
 * Provides tools for managing application data, including import/export and reset functionality
 */
export function AdminPanel() {
  // Access data stores
  const { events, setEvents } = useEvents()
  const { tips, setTips: setTipsStore } = useTips()
  const { toast } = useToast()

  // Function to reset regenerate agenda decision
  const resetRegenerateDecision = () => {
    if (typeof window !== "undefined") {
      scopedLocalStorage.removeItem("regenerate-agenda-decision")
      toast({
        title: "Setting Reset",
        description: "Regenerate agenda decision has been reset. The dialog will appear again on next date change.",
        variant: "success",
      })
    }
  }

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
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [selectedTag, setSelectedTag] = useState<string>(() => getActiveTag())
  const [isBulkExportingAllTags, setIsBulkExportingAllTags] = useState(false)
  const [isClearingAllTagData, setIsClearingAllTagData] = useState(false)

  // Check for stored credentials on component mount
  useEffect(() => {
    const storedAccessKeyId = scopedLocalStorage.getItem("aws_access_key_id")
    const storedSecretAccessKey = scopedLocalStorage.getItem("aws_secret_access_key")

    if (storedAccessKeyId && storedSecretAccessKey) {
      setCredentials({
        accessKeyId: storedAccessKeyId,
        secretAccessKey: storedSecretAccessKey,
      })
      setHasStoredCredentials(true)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const tags = listTagsWithStoredData()
    setAvailableTags(tags)
    const currentTag = getActiveTag()
    if (tags.length === 0) {
      setSelectedTag(currentTag)
    } else if (tags.includes(currentTag)) {
      setSelectedTag(currentTag)
    } else {
      setSelectedTag(tags[0])
    }
  }, [events, tips])

  /**
   * Save AWS credentials to localStorage
   */
  const saveCredentials = () => {
    scopedLocalStorage.setItem("aws_access_key_id", credentials.accessKeyId)
    scopedLocalStorage.setItem("aws_secret_access_key", credentials.secretAccessKey)
    setHasStoredCredentials(true)
    setShowCredentialsDialog(false)
  }

  /**
   * Prepare data for export by ensuring empty end times are preserved
   */
  const prepareDataForExport = (events: any[], options?: { stripArchivedFlag?: boolean }) => {
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

      if (options?.stripArchivedFlag) {
        delete eventCopy.archived
      }

      return eventCopy
    })
  }

  /**
   * Helper to generate a timestamp suitable for filenames
   */
  const buildTimestamp = () => new Date().toISOString().replace(/[:.]/g, "-")

  /**
   * Download helper that handles blob creation and cleanup
   */
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  const navigateToTag = (tag: string) => {
    if (typeof window === "undefined") return
    const currentUrl = new URL(window.location.href)
    currentUrl.searchParams.set("tag", tag)
    const query = currentUrl.searchParams.toString()
    const nextUrl = `${currentUrl.pathname}${query ? `?${query}` : ""}${currentUrl.hash}`
    window.location.href = nextUrl
  }

  const handleExportAllTags = async () => {
    const tagsToExport = listTagsWithStoredData()
    if (tagsToExport.length === 0) {
      toast({
        title: "No stored tags",
        description: "There are no tags with stored events or tips to export.",
      })
      return
    }

    setIsBulkExportingAllTags(true)
    setAvailableTags(tagsToExport)

    try {
      const timestamp = buildTimestamp()
      const zip = new JSZip()

      for (const tag of tagsToExport) {
        const tagFolder = zip.folder(tag)
        if (!tagFolder) {
          continue
        }

        const [tagEvents, tagTips] = await Promise.all([
          loadStoredEventsForTag(tag),
          loadStoredTipsForTag(tag),
        ])
        const deltas = await buildChildDeltaFiles(tagEvents, tagTips, tag)

        tagFolder.file("conf.json", JSON.stringify(deltas.config, null, 2))
        tagFolder.file("events.json", JSON.stringify(deltas.events, null, 2))
        tagFolder.file("tips.json", JSON.stringify(deltas.tips, null, 2))
      }

      const blob = await zip.generateAsync({ type: "blob" })
      downloadBlob(blob, `all-tags_${timestamp}.zip`)
      toast({
        title: "Bulk export complete",
        description: `Exported ${tagsToExport.length} ${tagsToExport.length === 1 ? "tag" : "tags"} into a single archive.`,
        variant: "success",
      })
    } catch (error) {
      console.error("Bulk export failed:", error)
      toast({
        title: "Bulk export failed",
        description: "Could not export all tags. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsBulkExportingAllTags(false)
    }
  }

  const handleClearAllTagData = () => {
    const tagsToClear = listTagsWithStoredData()
    if (tagsToClear.length === 0) {
      toast({
        title: "Nothing to clear",
        description: "No stored events or tips were found for any tags.",
      })
      return
    }

    setIsClearingAllTagData(true)

    try {
      clearScopedDataForTags(TAG_DATA_STORAGE_KEYS, tagsToClear)

      useEvents.getState().resetToDefaults()
      useTips.getState().resetToDefaults()

      const updatedTags = listTagsWithStoredData()
      setAvailableTags(updatedTags)
      const clearedTagsCount = tagsToClear.length

      toast({
        title: "Stored data cleared",
        description: `Removed stored events and tips for ${clearedTagsCount} ${clearedTagsCount === 1 ? "tag" : "tags"}.`,
        variant: "success",
      })

      setSelectedTag(getActiveTag())
    } catch (error) {
      console.error("Failed to clear stored tag data:", error)
      toast({
        title: "Clear failed",
        description: "Could not clear stored events and tips. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsClearingAllTagData(false)
    }
  }

  type ExportOption = "config" | "events" | "tips" | "all"
  const exportChoices: Array<{ value: ExportOption; label: string }> = [
    { value: "events", label: "Events" },
    { value: "tips", label: "Tips" },
    { value: "config", label: "Config" },
    { value: "all", label: "All (zip)" },
  ]

  const [exportOption, setExportOption] = useState<ExportOption>("all")
  const [isExportingData, setIsExportingData] = useState(false)

  // Child-delta payloads are computed vs parent chain
  type DeltaBundle = {
    config: any
    events: any
    tips: any
  }

  const exportJsonFile = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    downloadBlob(blob, filename)
  }

  const exportSelectedFile = async (
    selection: Exclude<ExportOption, "all">,
    tag: string,
    timestamp: string,
    deltas: DeltaBundle,
  ) => {
    switch (selection) {
      case "config": {
        exportJsonFile(deltas.config, `conf_${tag}_${timestamp}.json`)
        break
      }
      case "events": {
        exportJsonFile(deltas.events, `events_${tag}_${timestamp}.json`)
        break
      }
      case "tips": {
        exportJsonFile(deltas.tips, `tips_${tag}_${timestamp}.json`)
        break
      }
    }
  }

  const exportAllFiles = async (tag: string, timestamp: string, deltas: DeltaBundle) => {
    const zip = new JSZip()
    zip.file("conf.json", JSON.stringify(deltas.config, null, 2))
    zip.file("events.json", JSON.stringify(deltas.events, null, 2))
    zip.file("tips.json", JSON.stringify(deltas.tips, null, 2))

    const blob = await zip.generateAsync({ type: "blob" })
    downloadBlob(blob, `all_${tag}_${timestamp}.zip`)
  }

  const handleExport = async () => {
    const tag = getActiveTag()
    const timestamp = buildTimestamp()

    setIsExportingData(true)
    try {
      // Build child-only deltas against parent chain
      const deltas = await buildChildDeltaFiles(events, tips, tag)

      if (exportOption === "all") {
        await exportAllFiles(tag, timestamp, deltas)
      } else {
        await exportSelectedFile(exportOption, tag, timestamp, deltas)
      }
      toast({
        title: "Export complete",
        description: `Saved ${
          exportOption === "all"
            ? "all files"
            : exportChoices.find((choice) => choice.value === exportOption)?.label ?? exportOption
        } for ${tag}.`,
        variant: "success",
      })
    } catch (error) {
      console.error("Export failed:", error)
      toast({
        title: "Export failed",
        description: "Something went wrong while exporting. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsExportingData(false)
    }
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
          setEvents(data.events, { fromBase: false })
          importSummary.push(`${data.events.length} events`)
        }

        if (data.tips) {
          // Ensure all tips have IDs
          const tipsWithIds = data.tips.map((tip: any) => ({
            ...tip,
            id: tip.id || uuidv4(),
          }))
          setTipsStore(tipsWithIds, { fromBase: false })
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
      useEvents.setState({
        events: [],
        filteredEvents: [],
        baseEvents: [],
        baseEventsMap: {},
        overridesById: {},
        deletedEventIds: [],
        legacyEvents: null,
        initialized: false,
      })
      useTips.setState({
        tips: [],
        filteredTips: [],
        baseTips: [],
        baseTipsMap: {},
        overridesById: {},
        deletedTipIds: [],
        legacyTips: null,
        initialized: false,
      })

      // Try to fetch the config, but use initialConfig as a fallback
      let fetchedConfig: TagBundle | null = null
      try {
        fetchedConfig = await fetchConfig(true, { includeAncestorLocalOverrides: true })
      } catch (error) {
        console.error("Error fetching config, using initialConfig:", error)
      }

      const resolvedTag = fetchedConfig?.tag || getActiveTag()
      const resolvedEvents: Event[] = Array.isArray(fetchedConfig?.events)
        ? (fetchedConfig.events as Event[])
        : (initialConfig.events as Event[])
      const resolvedTips: Tip[] = Array.isArray(fetchedConfig?.tips)
        ? (fetchedConfig.tips as Tip[])
        : (initialConfig.tips as Tip[])

      // Set the data directly
      useEvents.getState().setEvents(resolvedEvents, { fromBase: true })
      useEvents.setState({ initialized: true, activeTag: resolvedTag })

      setTipsStore(resolvedTips, { fromBase: true })
      useTips.setState({ initialized: true, activeTag: resolvedTag })

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
            <div className="flex flex-col sm:flex-row gap-2">
              <Select
                value={exportOption}
                onValueChange={(value) => setExportOption(value as ExportOption)}
              >
                <SelectTrigger className="sm:w-48">
                  <SelectValue placeholder="Choose export" />
                </SelectTrigger>
                <SelectContent>
                  {exportChoices.map((choice) => (
                    <SelectItem key={choice.value} value={choice.value}>
                      {choice.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleExport}
                className="flex items-center"
                disabled={isExportingData}
              >
                <Download className="mr-2 h-4 w-4" />
                {isExportingData ? "Exporting..." : "Export"}
              </Button>
            </div>
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

          {availableTags.length > 1 && (
            <div className="grid gap-2">
              <h3 className="text-lg font-medium">Multi-Tag Controls</h3>
              <p className="text-sm text-muted-foreground">
                Manage stored data across {availableTags.length} tags detected in this browser.
              </p>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                <Select
                  value={selectedTag}
                  onValueChange={(value) => {
                    setSelectedTag(value)
                    navigateToTag(value)
                  }}
                >
                  <SelectTrigger className="sm:w-56">
                    <SelectValue placeholder="Select tag" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTags.map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {tag}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleExportAllTags}
                  className="flex items-center"
                  disabled={isBulkExportingAllTags}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {isBulkExportingAllTags ? "Exporting all tags..." : "Export All Tags"}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleClearAllTagData}
                  className="flex items-center"
                  disabled={isClearingAllTagData}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {isClearingAllTagData ? "Clearing..." : "Clear Stored Data"}
                </Button>
              </div>
            </div>
          )}

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
              <Button
                variant="outline"
                onClick={resetRegenerateDecision}
                className="flex items-center"
              >
                <RefreshCw className="mr-2 h-4 w-4" /> Reset Regenerate Setting
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
