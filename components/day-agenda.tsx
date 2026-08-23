/**
 * Day Agenda Component
 *
 * This component displays and manages events for a specific day.
 */
"use client"

import { useState, useEffect, type ReactNode } from "react"
import { EventCard } from "@/components/event-card"
import { useEvents } from "@/hooks/use-events"
import { useDateEvents } from "@/hooks/use-date-events"
import { useOverrideDiff } from "@/hooks/use-override-diff"
import { useTagData } from "@/hooks/use-tag-data"
import { shouldShowRecurringEvent } from "@/lib/recurrence-utils"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { formatInAppTimezone } from "@/lib/date-utils"
import { compareEventsByOrderValue, getEventOrderValue, getEventTitleForSort } from "@/lib/event-order"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
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

// Update the props interface and use the setShowLocalTime function
interface DayAgendaProps {
  day: string
  date: Date
  showLocalTime?: boolean
  setShowLocalTime?: (value: boolean) => void
}

/**
 * DayAgenda component displays events for a specific day of the week
 * It separates all-day events from time-specific events.
 */
export function DayAgenda({ day, date, showLocalTime = false, setShowLocalTime }: DayAgendaProps) {
  const { updateEventOrderValue } = useEvents()
  const dateKey = formatInAppTimezone(date, "yyyy-MM-dd")
  const events = useDateEvents(dateKey)
  const { diffIndex } = useOverrideDiff()
  const { tagConfig } = useTagData()
  const eventOverrideIndex = diffIndex?.events ?? {}
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  // State to manage all-day and time-specific events
  const [allDayEvents, setAllDayEvents] = useState<any[]>([])
  const [timeEvents, setTimeEvents] = useState<any[]>([])

  /**
   * Effect to filter and organize events for the current day
   * It separates all-day events from time-specific events and sorts them appropriately
   */
  useEffect(() => {
    // Filter events for the current day that are not archived and match recurrence pattern
    // We need to respect the recurrence pattern even in admin view, but still show events that
    // would be excluded by date-specific overrides
    const dayEvents = events.filter((event) => {
      if (event.archived) return false
      return shouldShowRecurringEvent(event, date, true, tagConfig ?? {})
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
      .sort(compareEventsByOrderValue)

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
  }, [events, day, date, tagConfig])

  const calculateDroppedOrderValue = (orderedEvents: any[], movedEventId: string): number | null => {
    const index = orderedEvents.findIndex((event) => event.id === movedEventId)
    if (index === -1) return null

    const previous = orderedEvents[index - 1]
    const next = orderedEvents[index + 1]
    if (previous && next) {
      return (getEventOrderValue(previous) + getEventOrderValue(next)) / 2
    }
    if (previous) return getEventOrderValue(previous) + 1
    if (next) return getEventOrderValue(next) - 1
    return getEventOrderValue(orderedEvents[index])
  }

  const handleAllDayDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = allDayEvents.findIndex((item) => item.id === active.id)
    const newIndex = allDayEvents.findIndex((item) => item.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = [...allDayEvents]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)

    const nextOrderValue = calculateDroppedOrderValue(reordered, String(active.id))
    if (nextOrderValue === null || !Number.isFinite(nextOrderValue)) return

    setAllDayEvents(reordered.map((item) => (item.id === active.id ? { ...item, order_value: nextOrderValue } : item)))
    updateEventOrderValue(String(active.id), nextOrderValue, dateKey)
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
            onDragEnd={handleAllDayDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
            <SortableContext items={allDayEvents.map((event) => event.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {allDayEvents.map((event) => (
                  <SortableAllDayEventCard key={event.id} event={event}>
                    <EventCard
                      event={event}
                      day={day}
                      date={date}
                      showLocalTime={showLocalTime}
                      overrideInfo={eventOverrideIndex[event.id]}
                    />
                  </SortableAllDayEventCard>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Empty state message */}
      {allDayEvents.length === 0 && timeEvents.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No events scheduled for this day. Click &quot;Add Event&quot; to create one.
        </div>
      )}
    </div>
  )
}

function SortableAllDayEventCard({ event, children }: { event: any; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: event.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative" as const,
    zIndex: isDragging ? 1 : "auto",
  }

  return (
    <div ref={setNodeRef} style={style} className="group relative pl-8">
      <button
        type="button"
        className="absolute left-0 top-0 bottom-0 flex w-8 cursor-move items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={`Drag ${getEventTitleForSort(event)}`}
        title="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      {children}
    </div>
  )
}
