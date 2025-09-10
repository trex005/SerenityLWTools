/**
 * Events View Component
 *
 * This component displays all events in the system, with archived events clearly delineated.
 * It includes filtering functionality to search for events by title or description.
 */
"use client"

import { useState, type MouseEvent } from "react"
import { useEvents } from "@/hooks/use-events"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArchiveRestore, Archive, Trash2, Search, X, Edit, Mail } from "lucide-react"
import { Input } from "@/components/ui/input"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { formatRecurrence, shouldShowDaysSeparately } from "@/lib/recurrence-utils"
import { useDebounce } from "@/hooks/use-debounce"
import { EventDialog } from "@/components/event-dialog"
import { AddEventButton } from "@/components/add-event-button"

/**
 * EventsView component
 * Displays all events with filtering capabilities and options to archive/restore/delete
 */
export function EventsView() {
  // Access events store
  const { events, archiveEvent, restoreEvent, deleteEvent } = useEvents()

  // State for filter input
  const [filterInput, setFilterInput] = useState("")

  // Debounced filter value
  const debouncedFilter = useDebounce(filterInput, 500)

  // State for delete confirmation dialog
  const [eventToDelete, setEventToDelete] = useState<string | null>(null)

  // State for edit dialog
  const [eventToEdit, setEventToEdit] = useState<any | null>(null)

  // Filter events based on search term and sort alphabetically
  const filterAndSortEvents = (allEvents: any[], filter: string, archived?: boolean) => {
    return (
      allEvents
        .filter((event) => {
          // Filter by archived status if specified
          if (archived !== undefined && event.archived !== archived) {
            return false
          }

          // Filter by search term if provided
          if (!filter) return true

          const searchTerm = filter.toLowerCase()
          const titleMatch = event.title.toLowerCase().includes(searchTerm)
          const descriptionMatch = event.description.toLowerCase().includes(searchTerm)

          return titleMatch || descriptionMatch
        })
        // Sort alphabetically by title
        .sort((a, b) => a.title.localeCompare(b.title))
    )
  }

  // Get filtered and sorted events
  const allFilteredEvents = filterAndSortEvents(events, debouncedFilter)
  const activeEvents = filterAndSortEvents(events, debouncedFilter, false)
  const archivedEvents = filterAndSortEvents(events, debouncedFilter, true)

  /**
   * Handle archive button click
   * Archives the event
   */
  const handleArchive = (eventId: string) => {
    archiveEvent(eventId)
  }

  /**
   * Handle restore button click
   * Restores the event from archive
   */
  const handleRestore = (eventId: string) => {
    restoreEvent(eventId)
  }

  /**
   * Handle edit button click
   * Opens the edit dialog for the selected event
   */
  const handleEdit = (event: any) => {
    setEventToEdit(event)
  }

  /**
   * Handle delete button click
   * Opens confirmation dialog or deletes directly if shift key is pressed
   */
  const handleDeleteClick = (eventId: string, e: MouseEvent) => {
    if (e.shiftKey) {
      // Delete immediately if shift key is pressed
      deleteEvent(eventId)
    } else {
      // Otherwise show confirmation dialog
      setEventToDelete(eventId)
    }
  }

  /**
   * Confirm deletion of an event
   */
  const confirmDelete = () => {
    if (eventToDelete) {
      deleteEvent(eventToDelete)
      setEventToDelete(null)
    }
  }

  /**
   * Clear the filter input
   */
  const clearFilter = () => {
    setFilterInput("")
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div></div>
        <div className="flex items-center gap-2">
          <AddEventButton />
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Filter events..."
              className="pl-8 pr-8 w-[250px]"
              value={filterInput}
              onChange={(e) => setFilterInput(e.target.value)}
            />
            {filterInput && (
              <Button variant="ghost" size="icon" className="absolute right-0 top-0 h-9 w-9" onClick={clearFilter}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {debouncedFilter && (
        <div className="text-sm text-muted-foreground">
          Showing results for "{debouncedFilter}" ({allFilteredEvents.length} events)
        </div>
      )}

      {/* Tabs for event categories */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="w-full justify-start mb-4 overflow-x-auto">
          <TabsTrigger value="all">All ({allFilteredEvents.length})</TabsTrigger>
          <TabsTrigger value="active">Active ({activeEvents.length})</TabsTrigger>
          <TabsTrigger value="archived">Archived ({archivedEvents.length})</TabsTrigger>
        </TabsList>

        {/* All events tab */}
        <TabsContent value="all">
          <div className="space-y-2">
            {allFilteredEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onArchive={handleArchive}
                onRestore={handleRestore}
                onEdit={handleEdit}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
          {events.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No events found. Add events from the Schedule tab.
            </div>
          )}
          {events.length > 0 && allFilteredEvents.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">No events match your filter criteria.</div>
          )}
        </TabsContent>

        {/* Active events tab */}
        <TabsContent value="active">
          <div className="space-y-2">
            {activeEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onArchive={handleArchive}
                onRestore={handleRestore}
                onEdit={handleEdit}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
          {activeEvents.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">No active events found.</div>
          )}
        </TabsContent>

        {/* Archived events tab */}
        <TabsContent value="archived">
          <div className="space-y-2">
            {archivedEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onArchive={handleArchive}
                onRestore={handleRestore}
                onEdit={handleEdit}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
          {archivedEvents.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">No archived events found.</div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      {eventToEdit && (
        <EventDialog
          event={eventToEdit}
          open={!!eventToEdit}
          onOpenChange={(open) => {
            if (!open) setEventToEdit(null)
          }}
          initialDay={eventToEdit.days[0] || "monday"}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={eventToDelete !== null} onOpenChange={(open) => !open && setEventToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this event? This action cannot be undone.
              <br />
              <br />
              <span className="text-sm italic">
                Tip: To skip this confirmation in the future, hold the Shift key while clicking the delete icon.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/**
 * EventCard component
 * Displays a single event with archive/restore and delete options
 */
function EventCard({
  event,
  onArchive,
  onRestore,
  onEdit,
  onDelete,
}: {
  event: any
  onArchive: (id: string) => void
  onRestore: (id: string) => void
  onEdit: (event: any) => void
  onDelete: (id: string, e: MouseEvent) => void
}) {
  // Get effective values
  const isAllDay = event.isAllDay
  const startTime = event.startTime
  const endTime = event.endTime
  const description = event.description

  /**
   * Format the days of the week for display
   */
  const formatDays = () => {
    // Don't show days if they're already shown in the recurrence pattern
    if (!shouldShowDaysSeparately(event)) return null

    if (!event.days || event.days.length === 0) return null

    // Standard order of days for sorting
    const dayOrder = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

    // Sort the days according to the standard week order
    const sortedDays = [...event.days].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b))

    return (
      <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-1 items-center">
        <span>Days:</span>
        <div className="flex flex-wrap gap-1">
          {sortedDays.map((d) => {
            const formattedDay = d.charAt(0).toUpperCase() + d.slice(1).substring(0, 2)

            return (
              <span key={d} className="px-1.5 py-0.5 rounded-md text-xs bg-muted/50 text-muted-foreground">
                {formattedDay}
              </span>
            )
          })}
        </div>
      </div>
    )
  }

  /**
   * Helper function to check if an event is marked for export
   */
  function isMarkedForExport(event: any) {
    // Handle both boolean and object formats
    if (typeof event.includeInExport === "boolean") {
      return event.includeInExport
    } else if (typeof event.includeInExport === "object" && event.includeInExport !== null) {
      // If it's an object (old format), check if any day is set to true
      return Object.values(event.includeInExport).some((value) => value === true)
    }
    return false
  }

  return (
    <Card className={`${event.archived ? "border-dashed border-muted-foreground/30 bg-muted/30" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start">
          <div className="flex-1">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">{event.title}</h4>
                  {event.archived && (
                    <Badge variant="outline" className="text-muted-foreground border-muted-foreground/50">
                      Archived
                    </Badge>
                  )}
                  {isMarkedForExport(event) && (
                    <Mail size={14} className="text-muted-foreground" title="Included in email export" />
                  )}
                </div>
                {!isAllDay && startTime && (
                  <div className="text-sm text-muted-foreground">
                    {startTime}
                    {endTime ? ` - ${endTime}` : ""}
                  </div>
                )}
                {/* Display the days of the week */}
                {formatDays()}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-1 -mb-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(event)}
                  aria-label="Edit event"
                  title="Edit"
                  className="text-muted-foreground hover:text-muted-foreground hover:bg-muted/50"
                >
                  <Edit size={16} />
                </Button>
                {event.archived ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onRestore(event.id)}
                    aria-label="Restore event"
                    title="Restore"
                    className="text-primary hover:text-primary hover:bg-primary/10"
                  >
                    <ArchiveRestore size={16} />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onArchive(event.id)}
                    aria-label="Archive event"
                    title="Archive"
                    className="text-muted-foreground hover:text-muted-foreground hover:bg-muted/50"
                  >
                    <Archive size={16} />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => onDelete(event.id, e)}
                  aria-label="Delete event"
                  title="Delete"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>

            {/* Event Description */}
            {description && <p className="text-sm mt-2 text-muted-foreground whitespace-pre-line">{description}</p>}

            {/* Recurrence Information */}
            {formatRecurrence(event) && (
              <div className="text-xs text-primary/70 mt-1 flex items-center">
                <span className="mr-1">↻</span> {formatRecurrence(event)}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
