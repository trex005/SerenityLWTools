/**
 * Event Dialog Component
 *
 * This component provides a form for creating and editing events.
 * It handles all the event properties, including day-specific variations.
 */
"use client"

import type React from "react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState, useEffect, useMemo } from "react"
import { useEvents } from "@/hooks/use-events"
import { v4 as uuidv4 } from "uuid"
// Add import for RecurrenceEditor at the top of the file
import { RecurrenceEditor } from "@/components/recurrence-editor"
import { format } from "date-fns"
import { useOverrideDiff } from "@/hooks/use-override-diff"
import { useToast } from "@/hooks/use-toast"

// Add this at the top of the file, right after the imports
// Only prevent default for specific events, don't stop propagation

interface EventDialogProps {
  event?: any // The event to edit (undefined for new events)
  open: boolean // Whether the dialog is open
  onOpenChange: (open: boolean) => void // Function to handle dialog open/close
  initialDay?: string // Initial day for new events
  initialDate?: Date // Initial date for new events
}

/**
 * EventDialog component
 * Provides a form for creating and editing events with support for day-specific variations
 */
export function EventDialog({ event, open, onOpenChange, initialDay = "monday", initialDate }: EventDialogProps) {
  // Access event store functions
  const { addEvent, updateEvent, resetEventOverrides } = useEvents()
  const { diffIndex } = useOverrideDiff()
  const { toast } = useToast()

  // Check if we're editing an existing event
  const isEditing = !!event

  // Days of the week
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  const overrideInfo = event?.id ? diffIndex?.events[event.id] : null
  const overrideKeys = overrideInfo?.overrideKeys ?? []
  const overrideKeySet = useMemo(() => new Set(overrideKeys), [overrideKeys])
  const hasOverrides = overrideKeys.length > 0
  const parentHasData = overrideInfo?.parentExists ?? false

  const formatOverrideKey = (key: string) =>
    key
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase())

  const renderOverridePill = (keys: string | string[]) => {
    const list = Array.isArray(keys) ? keys : [keys]
    return list.some((key) => overrideKeySet.has(key)) ? (
      <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
        Override
      </span>
    ) : null
  }

  // State for form data
  const [formData, setFormData] = useState({
    id: "",
    title: "",
    description: "",
    remindTomorrow: false,
    remindEndOfDay: false,
    includeInBriefing: true,
    includeOnWebsite: true,
    isAllDay: true,
    startTime: "09:00",
    endTime: "",
    days: [] as string[],
    includeInExport: {} as Record<string, boolean>,
    variations: {} as Record<string, any>,
    order: {} as Record<string, number>,
    archived: false, // Add the archived property
    recurrence: null,
  })

  // State for UI elements
  const [activeTab, setActiveTab] = useState("settings")
  const [hasVariation, setHasVariation] = useState<Record<string, boolean>>({})
  const [includeInExportByDefault, setIncludeInExportByDefault] = useState(true)
  const [includeEndTime, setIncludeEndTime] = useState(false)
  const [includeEndTimeVariation, setIncludeEndTimeVariation] = useState<Record<string, boolean>>({})
  const [isResetting, setIsResetting] = useState(false)

  // Flag to prevent infinite loops
  const [isInitialized, setIsInitialized] = useState(false)

  // Modify the initialization of form data to initialize recurrence
  useEffect(() => {
    if (!open) {
      // Reset initialization flag when dialog closes
      setIsInitialized(false)
      return
    }

    // Only initialize once per dialog open
    if (isInitialized) return

    // EventDialog opened

    if (isEditing && event) {
      // Editing an existing event
      // Initializing form with existing event

      // Convert the includeInExport from the old format (object) to the new format (object)
      let includeInExport: Record<string, boolean> = {}

      if (typeof event.includeInExport === "object" && event.includeInExport !== null) {
        // If it's an object (old format), use it directly
        includeInExport = { ...event.includeInExport }
      } else {
        // If it's a boolean, create an object with the boolean value for all days
        const boolValue = !!event.includeInExport
        event.days.forEach((d: string) => {
          includeInExport[d] = boolValue
        })
      }

      // Check if event has an end time
      const hasEndTime = event.endTime && event.endTime.trim() !== ""
      setIncludeEndTime(hasEndTime)

      // Initialize includeEndTimeVariation state based on existing variations
      const endTimeVariations: Record<string, boolean> = {}
      days.forEach((day) => {
        if (event.variations && event.variations[day]) {
          endTimeVariations[day] = !!(event.variations[day].endTime && event.variations[day].endTime.trim() !== "")
        } else {
          endTimeVariations[day] = hasEndTime
        }
      })
      setIncludeEndTimeVariation(endTimeVariations)

      // Initialize hasVariation state based on existing variations
      const variations: Record<string, boolean> = {}
      days.forEach((day) => {
        variations[day] = !!(event.variations && event.variations[day])
      })
      setHasVariation(variations)

      // Set the checkbox state based on the actual value
      // Use the first day's value or default to true
      setIncludeInExportByDefault(Object.values(includeInExport).length > 0 ? Object.values(includeInExport)[0] : true)

      // Ensure the event has a valid recurrence with daysOfWeek
      const recurrence = event.recurrence || {
        type: "daily", // Change default from "none" to "daily"
        daysOfWeek: [...event.days],
        interval: 1,
      }

      // Add this code to default to "weekly" if multiple days are assigned
      // If the event has multiple days assigned, default to "weekly" instead of "daily"
      // Just ensure recurrence has daysOfWeek, but don't change the type
      if (!recurrence.daysOfWeek || recurrence.daysOfWeek.length === 0) {
        recurrence.daysOfWeek = [...event.days]
      }

      if (!recurrence.daysOfWeek || recurrence.daysOfWeek.length === 0) {
        recurrence.daysOfWeek = [...event.days]
      }

      // Set form data last to avoid triggering re-renders
      setFormData({
        ...event,
        includeInBriefing: event.includeInBriefing ?? true,
        includeOnWebsite: event.includeOnWebsite ?? true,
        includeInExport,
        // If no end time, set to empty string
        endTime: hasEndTime ? event.endTime : "",
        // Ensure archived property is set
        archived: event.archived ?? false,
        // Ensure recurrence is properly set
        recurrence: recurrence,
      })
    } else {
      // Creating a new event
      // Initializing form for new event
      // For new events, initialize with the initial day selected
      const initialIncludeInExport: Record<string, boolean> = {}
      initialIncludeInExport[initialDay] = true

      // If we have an initial date, use it for the recurrence start date
      const startDate = initialDate ? format(initialDate, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx") : undefined

      setFormData({
        id: uuidv4(),
        title: "",
        description: "",
        remindTomorrow: false,
        remindEndOfDay: false,
        includeInBriefing: true,
        includeOnWebsite: true,
        isAllDay: true,
        startTime: "09:00",
        endTime: "",
        days: [initialDay], // Keep for backward compatibility
        includeInExport: initialIncludeInExport,
        variations: {},
        order: {},
        archived: false,
        recurrence: {
          type: "daily", // Change default from "none" to "daily"
          daysOfWeek: ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"], // Default to all days
          interval: 1,
          startDate: startDate, // Use the initialDate if provided
          endDate: undefined,
        },
      })
      setIncludeInExportByDefault(true)
      setIncludeEndTime(false)
      setIncludeEndTimeVariation({})
    }

    // Mark as initialized to prevent re-running
    setIsInitialized(true)
  }, [open, event, isEditing, initialDay, initialDate, days, isInitialized])

  /**
   * Handle input change for text inputs
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  /**
   * Handle toggling days that this event occurs on
   */
  const handleDayToggle = (day: string) => {
    setFormData((prev) => {
      const newDays = prev.days.includes(day) ? prev.days.filter((d) => d !== day) : [...prev.days, day]

      // Also update includeInExport when adding a day
      const newIncludeInExport = { ...prev.includeInExport }

      if (!prev.days.includes(day) && !newIncludeInExport[day]) {
        newIncludeInExport[day] = includeInExportByDefault
      }

      return {
        ...prev,
        days: newDays,
        includeInExport: newIncludeInExport,
      }
    })
  }

  /**
   * Handle toggling whether an event is all-day
   */
  const handleAllDayToggle = (checked: boolean, day?: string) => {
    if (day && hasVariation[day]) {
      // Update variation for specific day
      setFormData((prev) => ({
        ...prev,
        variations: {
          ...prev.variations,
          [day]: {
            ...prev.variations[day],
            isAllDay: checked,
          },
        },
      }))
    } else {
      // Update main event
      setFormData((prev) => ({ ...prev, isAllDay: checked }))
    }
  }

  /**
   * Handle toggling day-specific variations
   */
  const handleVariationToggle = (day: string, checked: boolean) => {
    setHasVariation((prev) => ({ ...prev, [day]: checked }))

    if (!checked && formData.variations[day]) {
      // Remove variation if toggled off
      const newVariations = { ...formData.variations }
      delete newVariations[day]
      setFormData((prev) => ({ ...prev, variations: newVariations }))
    } else if (checked && !formData.variations[day]) {
      // Initialize variation if toggled on
      setFormData((prev) => ({
        ...prev,
        variations: {
          ...prev.variations,
          [day]: {
            description: prev.description,
            isAllDay: prev.isAllDay,
            startTime: prev.startTime,
            endTime: includeEndTime ? prev.endTime : "",
          },
        },
      }))
    }
  }

  /**
   * Handle changing variation properties
   */
  const handleVariationChange = (day: string, field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      variations: {
        ...prev.variations,
        [day]: {
          ...prev.variations[day],
          [field]: value,
        },
      },
    }))
  }

  /**
   * Handle toggling the includeInExport setting
   */
  const handleIncludeInExportToggle = (checked: boolean) => {
    setIncludeInExportByDefault(checked)
    setFormData((prev) => {
      // Update all selected days with the new value
      const newIncludeInExport = { ...prev.includeInExport }
      prev.days.forEach((day) => {
        newIncludeInExport[day] = checked
      })

      return {
        ...prev,
        includeInExport: newIncludeInExport,
      }
    })
  }

  /**
   * Handle toggling whether to include an end time
   */
  const handleIncludeEndTimeToggle = (checked: boolean, day?: string) => {
    if (day && hasVariation[day]) {
      // Update for specific day variation
      setIncludeEndTimeVariation((prev) => ({
        ...prev,
        [day]: checked,
      }))

      // Clear or set the end time in the variation
      setFormData((prev) => ({
        ...prev,
        variations: {
          ...prev.variations,
          [day]: {
            ...prev.variations[day],
            endTime: checked ? prev.variations[day]?.endTime || "10:00" : "",
          },
        },
      }))
    } else {
      // Update for common settings
      setIncludeEndTime(checked)
      setFormData((prev) => ({
        ...prev,
        endTime: checked ? prev.endTime || "10:00" : "",
      }))
    }
  }

  /**
   * Handle changing time properties
   */
  const handleTimeChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  /**
   * Handle changing variation time properties
   */
  const handleVariationTimeChange = (day: string, field: string, value: string) => {
    handleVariationChange(day, field, value)
  }

  // Handle recurrence change - now the primary way to select days
  const handleRecurrenceChange = (recurrence: any) => {
    // Create a deep copy to avoid reference issues
    const newRecurrence = recurrence
      ? JSON.parse(JSON.stringify(recurrence))
      : {
          type: "none",
          daysOfWeek: ["monday"],
        }

    // Update the form data
    setFormData((prev) => {
      // Sync days array with recurrence.daysOfWeek for backward compatibility
      const newDays = [...newRecurrence.daysOfWeek]

      // Add any new days to includeInExport
      const newIncludeInExport = { ...prev.includeInExport }
      newRecurrence.daysOfWeek.forEach((day: string) => {
        if (newIncludeInExport[day] === undefined) {
          newIncludeInExport[day] = includeInExportByDefault
        }
      })

      return {
        ...prev,
        days: newDays, // Keep days in sync with daysOfWeek
        recurrence: newRecurrence,
        includeInExport: newIncludeInExport,
      }
    })
  }

  // In the handleSubmit function, ensure days is in sync with recurrence.daysOfWeek
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Ensure recurrence exists and has daysOfWeek
    const recurrence = formData.recurrence || {
      type: "none",
      daysOfWeek: formData.days || ["monday"],
    }

    if (!recurrence.daysOfWeek || recurrence.daysOfWeek.length === 0) {
      recurrence.daysOfWeek = formData.days || ["monday"]
    }

    // Ensure days is in sync with recurrence.daysOfWeek
    const syncedFormData = {
      ...formData,
      days: [...recurrence.daysOfWeek],
      recurrence,
    }


    if (isEditing) {
      // Updating event
      updateEvent(syncedFormData)
    } else {
      // Adding new event
      addEvent(syncedFormData)
    }

    onOpenChange(false)
  }

  /**
   * Generate time options for dropdowns
   */
  const generateHourOptions = () => {
    return Array.from({ length: 24 }, (_, i) => {
      const hour = i.toString().padStart(2, "0")
      return { value: hour, label: hour }
    })
  }

  const generateMinuteOptions = () => {
    return Array.from({ length: 12 }, (_, i) => {
      const minute = (i * 5).toString().padStart(2, "0")
      return { value: minute, label: minute }
    })
  }

  const hourOptions = generateHourOptions()
  const minuteOptions = generateMinuteOptions()

  /**
   * Helper function to split time string into hour and minute
   */
  const splitTime = (timeString: string) => {
    const [hour = "09", minute = "00"] = (timeString || "09:00").split(":")
    return { hour, minute }
  }

  /**
   * Helper function to get the effective end time for a day variation
   */
  const getEffectiveEndTime = (day: string) => {
    if (formData.variations && formData.variations[day]) {
      return formData.variations[day].endTime || ""
    }
    return formData.endTime || ""
  }

  /**
   * Helper function to check if a day variation has an end time
   */
  const hasEndTimeVariation = (day: string) => {
    return includeEndTimeVariation[day] || false
  }

  const handleResetOverrides = async () => {
    if (!event?.id || !parentHasData) {
      toast({
        title: "No parent version",
        description: "This event does not inherit from another tag.",
        variant: "destructive",
      })
      return
    }

    setIsResetting(true)
    try {
      const success = await resetEventOverrides(event.id)
      if (success) {
        toast({
          title: "Overrides removed",
          description: "The event now matches the parent configuration.",
          variant: "success",
        })
        setIsInitialized(false)
        onOpenChange(false)
      } else {
        toast({
          title: "Reset unavailable",
          description: "Could not find a parent version to restore.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Failed to reset overrides", error)
      toast({
        title: "Reset failed",
        description: "An unexpected error occurred while resetting this event.",
        variant: "destructive",
      })
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Event" : "Add New Event"}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Modify the details of your existing event."
                : "Create a new event by filling out the details below."}
            </DialogDescription>
          </DialogHeader>

          {hasOverrides && (
            <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Overridden fields for this tag</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-amber-900">
                {overrideKeys.map((key) => (
                  <li key={key}>{formatOverrideKey(key)}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-4 py-4">
            {/* Event Title */}
            <div className="grid gap-2">
              <Label htmlFor="title" className="flex items-center gap-2">
                Event Title
                {renderOverridePill("title")}
              </Label>
              <Input
                id="title"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                placeholder="Enter event title"
                required
              />
            </div>

            {/* Tabs for Common Settings, Recurrence, and Day-specific Settings */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full justify-start mb-2 overflow-x-auto">
                <TabsTrigger value="settings" className="capitalize">
                  Settings
                </TabsTrigger>
                {formData.recurrence?.daysOfWeek
                  .slice()
                  .sort((a, b) => days.indexOf(a) - days.indexOf(b))
                  .map((day) => (
                    <TabsTrigger key={day} value={day} className="capitalize">
                      {day}
                    </TabsTrigger>
                  ))}
              </TabsList>

              {/* Settings Tab (merged Common and Frequency) */}
              <TabsContent value="settings" className="space-y-6">
                {/* Event Timing Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Timing</h3>
                  <div className="grid gap-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="isAllDay"
                        checked={formData.isAllDay}
                        onCheckedChange={(checked) => handleAllDayToggle(checked)}
                      />
                      <Label htmlFor="isAllDay" className="flex items-center gap-2">
                        All-day event
                        {renderOverridePill("isAllDay")}
                      </Label>
                    </div>
                  </div>

                  {/* Time Settings (if not all-day) */}
                  {!formData.isAllDay && (
                    <div className="grid grid-cols-1 gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-1/3">
                          <Label htmlFor="startTime" className="mb-2 flex items-center gap-2">
                            Start Time
                            {renderOverridePill("startTime")}
                          </Label>
                          <div className="flex gap-2">
                            <Select
                              value={splitTime(formData.startTime).hour}
                              onValueChange={(value) =>
                                handleTimeChange("startTime", `${value}:${splitTime(formData.startTime).minute}`)
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Hour" />
                              </SelectTrigger>
                              <SelectContent>
                                {hourOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <span className="flex items-center">:</span>
                            <Select
                              value={splitTime(formData.startTime).minute}
                              onValueChange={(value) =>
                                handleTimeChange("startTime", `${splitTime(formData.startTime).hour}:${value}`)
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Minute" />
                              </SelectTrigger>
                              <SelectContent>
                                {minuteOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="w-2/3">
                          <div className="flex items-center space-x-2 mb-2">
                            <Checkbox
                              id="includeEndTime"
                              checked={includeEndTime}
                              onCheckedChange={(checked) => handleIncludeEndTimeToggle(!!checked)}
                            />
                            <Label htmlFor="includeEndTime" className="flex items-center gap-2">
                              Include end time
                              {renderOverridePill("endTime")}
                            </Label>
                          </div>

                          {includeEndTime && (
                            <div className="flex gap-2">
                              <Select
                                value={splitTime(formData.endTime).hour}
                                onValueChange={(value) =>
                                  handleTimeChange("endTime", `${value}:${splitTime(formData.endTime).minute}`)
                                }
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Hour" />
                                </SelectTrigger>
                                <SelectContent>
                                  {hourOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <span className="flex items-center">:</span>
                              <Select
                                value={splitTime(formData.endTime).minute}
                                onValueChange={(value) =>
                                  handleTimeChange("endTime", `${splitTime(formData.endTime).hour}:${value}`)
                                }
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Minute" />
                                </SelectTrigger>
                                <SelectContent>
                                  {minuteOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Frequency Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Frequency</h3>
                  <div className="grid gap-2">
                    <RecurrenceEditor value={formData.recurrence} onChange={handleRecurrenceChange} isNewEvent={!isEditing} />
                  </div>
                </div>

                {/* Description Field */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Details</h3>
                  <div className="grid gap-2">
                    <Label htmlFor="description" className="flex items-center gap-2">
                      Description
                      {renderOverridePill("description")}
                    </Label>
                    <Textarea
                      id="description"
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      placeholder="Enter event description"
                      className="min-h-[120px] resize-none"
                      onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement
                        target.style.height = "auto"
                        target.style.height = `${target.scrollHeight}px`
                      }}
                      ref={(el) => {
                        if (el) {
                          el.style.height = "auto"
                          el.style.height = `${el.scrollHeight}px`
                        }
                      }}
                    />
                  </div>

                  {/* Inclusion Settings */}
                  <div className="grid gap-2">
                    <Label className="flex items-center gap-2">
                      Include in
                      {renderOverridePill(["includeInExport", "includeOnWebsite", "includeInBriefing"])}
                    </Label>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="includeScheduled"
                          checked={includeInExportByDefault}
                          onCheckedChange={(checked) => handleIncludeInExportToggle(!!checked)}
                        />
                        <Label htmlFor="includeScheduled" className="flex items-center gap-2">
                          Scheduled
                          {renderOverridePill("includeInExport")}
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="includeWebsite"
                          checked={formData.includeOnWebsite !== false}
                          onCheckedChange={(checked) =>
                            setFormData((prev) => ({
                              ...prev,
                              includeOnWebsite: !!checked,
                            }))
                          }
                        />
                        <Label htmlFor="includeWebsite" className="flex items-center gap-2">
                          Website
                          {renderOverridePill("includeOnWebsite")}
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="includeBriefing"
                          checked={formData.includeInBriefing ?? true}
                          onCheckedChange={(checked) =>
                            setFormData((prev) => ({
                              ...prev,
                              includeInBriefing: !!checked,
                            }))
                          }
                        />
                        <Label htmlFor="includeBriefing" className="flex items-center gap-2">
                          Briefing
                          {renderOverridePill("includeInBriefing")}
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="includePreviousDayReminder"
                          checked={formData.remindTomorrow}
                          onCheckedChange={(checked) =>
                            setFormData((prev) => ({
                              ...prev,
                              remindTomorrow: !!checked,
                            }))
                          }
                        />
                        <Label htmlFor="includePreviousDayReminder" className="flex items-center gap-2">
                          Previous day reminders
                          {renderOverridePill("remindTomorrow")}
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="includeEndOfDayReminder"
                          checked={formData.remindEndOfDay}
                          onCheckedChange={(checked) =>
                            setFormData((prev) => ({
                              ...prev,
                              remindEndOfDay: !!checked,
                            }))
                          }
                        />
                        <Label htmlFor="includeEndOfDayReminder" className="flex items-center gap-2">
                          End of day reminders
                          {renderOverridePill("remindEndOfDay")}
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Day-specific Settings Tabs */}
              {formData.recurrence?.daysOfWeek.map((day) => (
                <TabsContent key={day} value={day} className="space-y-4">
                  <div className="grid gap-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id={`variation-${day}`}
                        checked={!!hasVariation[day]}
                        onCheckedChange={(checked) => handleVariationToggle(day, checked)}
                      />
                      <Label htmlFor={`variation-${day}`} className="flex items-center gap-2">
                        Use day-specific settings
                        {renderOverridePill("variations")}
                      </Label>
                    </div>
                  </div>

                  {/* Day-specific Settings (if enabled) */}
                  {hasVariation[day] && (
                    <>
                      <div className="grid gap-2">
                        <div className="flex items-center space-x-2">
                          <Switch
                            id={`isAllDay-${day}`}
                            checked={formData.variations[day]?.isAllDay ?? formData.isAllDay}
                            onCheckedChange={(checked) => handleAllDayToggle(checked, day)}
                          />
                          <Label htmlFor={`isAllDay-${day}`}>All-day event</Label>
                        </div>
                      </div>

                      {/* Day-specific Time Settings (if not all-day) */}
                      {!(formData.variations[day]?.isAllDay ?? formData.isAllDay) && (
                        <div className="grid grid-cols-1 gap-4">
                          <div className="flex items-center gap-4">
                            <div className="w-1/3">
                              <Label htmlFor={`startTime-${day}`} className="mb-2 flex items-center gap-2">
                                Start Time
                                {renderOverridePill("variations")}
                              </Label>
                              <div className="flex gap-2">
                                <Select
                                  value={splitTime(formData.variations[day]?.startTime || formData.startTime).hour}
                                  onValueChange={(value) => {
                                    const currentTime = formData.variations[day]?.startTime || formData.startTime
                                    const newTime = `${value}:${splitTime(currentTime).minute}`
                                    handleVariationTimeChange(day, "startTime", newTime)
                                  }}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Hour" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {hourOptions.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <span className="flex items-center">:</span>
                                <Select
                                  value={splitTime(formData.variations[day]?.startTime || formData.startTime).minute}
                                  onValueChange={(value) => {
                                    const currentTime = formData.variations[day]?.startTime || formData.startTime
                                    const newTime = `${splitTime(currentTime).hour}:${value}`
                                    handleVariationTimeChange(day, "startTime", newTime)
                                  }}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Minute" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {minuteOptions.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <div className="w-2/3">
                              <div className="flex items-center space-x-2 mb-2">
                                <Checkbox
                                  id={`includeEndTime-${day}`}
                                  checked={hasEndTimeVariation(day)}
                                  onCheckedChange={(checked) => handleIncludeEndTimeToggle(!!checked, day)}
                                />
                                <Label htmlFor={`includeEndTime-${day}`} className="flex items-center gap-2">
                                  Include end time
                                  {renderOverridePill("variations")}
                                </Label>
                              </div>

                              {hasEndTimeVariation(day) && (
                                <div className="flex gap-2">
                                  <Select
                                    value={splitTime(getEffectiveEndTime(day)).hour}
                                    onValueChange={(value) => {
                                      const currentTime = getEffectiveEndTime(day)
                                      const newTime = `${value}:${splitTime(currentTime).minute}`
                                      handleVariationTimeChange(day, "endTime", newTime)
                                    }}
                                  >
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder="Hour" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {hourOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <span className="flex items-center">:</span>
                                  <Select
                                    value={splitTime(getEffectiveEndTime(day)).minute}
                                    onValueChange={(value) => {
                                      const currentTime = getEffectiveEndTime(day)
                                      const newTime = `${splitTime(currentTime).hour}:${value}`
                                      handleVariationTimeChange(day, "endTime", newTime)
                                    }}
                                  >
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder="Minute" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {minuteOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Day-specific Description */}
                      <div className="grid gap-2">
                        <Label htmlFor={`description-${day}`} className="flex items-center gap-2">
                          Description
                          {renderOverridePill("variations")}
                        </Label>
                        <Textarea
                          id={`description-${day}`}
                          value={formData.variations[day]?.description ?? formData.description}
                          onChange={(e) => handleVariationChange(day, "description", e.target.value)}
                          placeholder="Enter day-specific description"
                          className="min-h-[120px] resize-none"
                          onInput={(e) => {
                            const target = e.target as HTMLTextAreaElement
                            target.style.height = "auto"
                            target.style.height = `${target.scrollHeight}px`
                          }}
                          ref={(el) => {
                            if (el) {
                              el.style.height = "auto"
                              el.style.height = `${el.scrollHeight}px`
                            }
                          }}
                        />
                      </div>
                    </>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </div>

          <DialogFooter>
            {hasOverrides && parentHasData && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleResetOverrides}
                disabled={isResetting}
                className="mr-auto text-amber-900 hover:bg-amber-100"
              >
                {isResetting ? "Resetting..." : "Reset overrides"}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onOpenChange(false)
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              onClick={(e) => {
                // Only prevent default, don't stop propagation
                e.preventDefault()
                handleSubmit(e)
              }}
            >
              {isEditing ? "Save Changes" : "Add Event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
