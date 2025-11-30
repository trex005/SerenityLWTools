/**
 * Day Agenda Component
 *
 * This component displays and manages events for a specific day.
 * It includes drag-and-drop functionality for reordering all-day events.
 */
"use client"

import { useState, useEffect } from "react"
import { EventCard } from "@/components/event-card"
import { useEvents } from "@/hooks/use-events"
import { useOverrideDiff } from "@/hooks/use-override-diff"
import type { DiffInfo } from "@/lib/config-diff"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
// Add import for recurrence utilities
import { shouldShowRecurringEvent } from "@/lib/recurrence-utils"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { formatInAppTimezone, getDayOfWeek } from "@/lib/date-utils"

// Update the props interface and use the setShowLocalTime function
interface DayAgendaProps {
  day: string
  date: Date
  showLocalTime?: boolean
  setShowLocalTime?: (value: boolean) => void
}

/**
 * DayAgenda component displays events for a specific day of the week
 * It separates all-day events from time-specific events and allows for
 * drag-and-drop reordering of all-day events
 */
// Update the function signature to include the new prop
export function DayAgenda({ day, date, showLocalTime = false, setShowLocalTime }: DayAgendaProps) {
  // Access events data from store
  const { events, reorderEvents } = useEvents()
  const { diffIndex } = useOverrideDiff()
  const eventOverrideIndex = diffIndex?.events ?? {}

  // State to manage all-day and time-specific events
  const [allDayEvents, setAllDayEvents] = useState<any[]>([])
  const [timeEvents, setTimeEvents] = useState<any[]>([])

  // State to track which event is being dragged
  const [activeId, setActiveId] = useState<string | null>(null)

  // Configure drag-and-drop sensors with permissive settings for better usability
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Simple activation constraint for more intuitive dragging
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  /**
   * Effect to filter and organize events for the current day
   * It separates all-day events from time-specific events and sorts them appropriately
   */
  useEffect(() => {
    const dateKey = formatInAppTimezone(date, "yyyy-MM-dd")

    // Filter events for the current day that are not archived and match recurrence pattern
    // We need to respect the recurrence pattern even in admin view, but still show events that
    // would be excluded by date-specific overrides
    const dayEvents = events.filter((event) => {
      // First check if the event is archived
      if (event.archived) return false

      // Check if this day is in the event's days array (basic day check)
      const dayOfWeek = getDayOfWeek(date)
      const isOnThisDay = event.days.includes(dayOfWeek)

      if (!isOnThisDay) return false

      // Now check the recurrence pattern - pass adminModeView=true to show all events in admin view
      return shouldShowRecurringEvent(event, date, true)
    })

    // Split into all-day and time-specific events
    const allDay = dayEvents
      .filter((event) => {
        // Check if there's a date-specific override
        if (event.dateOverrides && event.dateOverrides[dateKey] && event.dateOverrides[dateKey].isAllDay !== undefined) {
          return event.dateOverrides[dateKey].isAllDay
        }

        // Check if there's a day-specific variation
        if (event.variations && event.variations[day] && event.variations[day].isAllDay !== undefined) {
          return event.variations[day].isAllDay
        }

        // Fall back to the main event property
        return event.isAllDay
      })
      .sort((a, b) => {
        // Sort by custom order if available
        const orderA = a.order && a.order[day] !== undefined ? a.order[day] : 999
        const orderB = b.order && b.order[day] !== undefined ? b.order[day] : 999
        return orderA - orderB
      })

    const timed = dayEvents
      .filter((event) => {
        // Check if there's a date-specific override
        if (event.dateOverrides && event.dateOverrides[dateKey] && event.dateOverrides[dateKey].isAllDay !== undefined) {
          return !event.dateOverrides[dateKey].isAllDay
        }

        // Check if there's a day-specific variation
        if (event.variations && event.variations[day] && event.variations[day].isAllDay !== undefined) {
          return !event.variations[day].isAllDay
        }

        // Fall back to the main event property
        return !event.isAllDay
      })
      .sort((a, b) => {
        // Get the effective start time (considering date overrides and variations)
        const getStartTime = (event: any) => {
          // Check for date override first
          if (event.dateOverrides && event.dateOverrides[dateKey] && event.dateOverrides[dateKey].startTime) {
            return event.dateOverrides[dateKey].startTime
          }

          // Then check for day variation
          if (event.variations && event.variations[day] && event.variations[day].startTime) {
            return event.variations[day].startTime
          }

          // Fall back to main event property
          return event.startTime || "00:00"
        }

        return getStartTime(a).localeCompare(getStartTime(b))
      })

    setTimeEvents(timed)
    setAllDayEvents(allDay)
  }, [events, day, date])

  /**
   * Handler for when drag starts
   * Records the ID of the event being dragged
   */
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    setActiveId(active.id as string)
  }

  /**
   * Handler for when drag ends
   * Updates the order of all-day events based on the new positions
   */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    // Safety check to ensure over is defined
    if (!over) return

    // Check if items are different
    if (active.id !== over.id) {
      // Find the indices of the dragged and target items
      const oldIndex = allDayEvents.findIndex((e) => e.id === active.id)
      const newIndex = allDayEvents.findIndex((e) => e.id === over.id)

      // Safety check for valid indices
      if (oldIndex === -1 || newIndex === -1) return

      // Create a new array with the updated order
      const newOrder = [...allDayEvents]
      const [movedItem] = newOrder.splice(oldIndex, 1)
      newOrder.splice(newIndex, 0, movedItem)

      // Update the order property for each event
      const updatedEvents = newOrder.map((event, index) => ({
        ...event,
        order: {
          ...event.order,
          [day]: index,
        },
      }))

      // Update state and persist changes
      setAllDayEvents(updatedEvents)
      reorderEvents(updatedEvents, day)
    }
  }

  /**
   * Handler for when drag is cancelled
   * Resets the active ID
   */
  const handleDragCancel = () => {
    setActiveId(null)
  }

  return (
    <div className="space-y-6">
      {/* Time-specific Events Section - Now displayed first */}
      {timeEvents.length > 0 && (
        <div>
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-md font-medium">Scheduled Events</h4>
            <div className="flex items-center gap-2">
              <Switch
                id={`show-local-time-${day}`}
                checked={showLocalTime}
                onCheckedChange={setShowLocalTime}
                className="data-[state=checked]:bg-primary/40"
              />
              <Label htmlFor={`show-local-time-${day}`} className="text-xs text-muted-foreground">
                also display local time
              </Label>
            </div>
          </div>
          <div className="space-y-2">
            {timeEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                day={day}
                date={date}
                showLocalTime={showLocalTime}
                overrideInfo={eventOverrideIndex[event.id]}
              />
            ))}
          </div>
        </div>
      )}

      {/* All-day Events Section - Now displayed second */}
      {allDayEvents.length > 0 && (
        <div>
          <h4 className="text-md font-medium mb-2">All-day Events</h4>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
            modifiers={[restrictToVerticalAxis]}
          >
            <SortableContext items={allDayEvents.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {allDayEvents.map((event) => (
                  <SortableEventCard
                    key={event.id}
                    event={event}
                    day={day}
                    date={date}
                    isActive={activeId === event.id}
                    showLocalTime={showLocalTime}
                    overrideInfo={eventOverrideIndex[event.id]}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Empty state message */}
      {allDayEvents.length === 0 && timeEvents.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No events scheduled for this day. Click "Add Event" to create one.
        </div>
      )}
    </div>
  )
}

/**
 * SortableEventCard component for handling drag-and-drop functionality
 * Wraps the regular EventCard with sortable capabilities
 */
function SortableEventCard({
  event,
  day,
  date,
  isActive,
  showLocalTime,
  overrideInfo,
}: {
  event: any
  day: string
  date: Date
  isActive: boolean
  showLocalTime?: boolean
  overrideInfo?: DiffInfo
}) {
  // Hook to make this component draggable/sortable
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: event.id,
    data: {
      type: "event",
      event,
    },
  })

  // Apply styles for drag handling
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isActive ? 0.5 : 1,
    position: "relative" as const,
    zIndex: isActive ? 1 : "auto",
  }

  return (
    <div ref={setNodeRef} style={style} className="group">
      {/* Drag handle */}
      <div
        className="absolute left-0 top-0 bottom-0 flex items-center px-2 cursor-move z-10"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} className="text-muted-foreground" />
      </div>

      {/* Event card with padding for the grip icon */}
      <div className="pl-8">
        <EventCard
          event={event}
          day={day}
          date={date}
          showLocalTime={showLocalTime}
          overrideInfo={overrideInfo}
        />
      </div>
    </div>
  )
}
