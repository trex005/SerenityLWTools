/**
 * Add Event Button Component
 *
 * This component displays a button that opens the EventDialog for creating new events.
 * It's used on each day tab in the schedule view.
 */
"use client"

import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { useState } from "react"
import { EventDialog } from "@/components/event-dialog"

interface AddEventButtonProps {
  day: string // The day for which to create an event
  date: Date // The specific date for the event
}

/**
 * AddEventButton component
 * Renders a button that, when clicked, opens the event dialog with the specified day pre-selected
 */
export function AddEventButton({ day, date }: AddEventButtonProps) {
  // State to control dialog visibility
  const [showDialog, setShowDialog] = useState(false)

  return (
    <>
      {/* Button to open the dialog */}
      <Button onClick={() => setShowDialog(true)} size="sm">
        <Plus className="mr-1 h-4 w-4" /> Add Event
      </Button>

      {/* Event dialog for creating a new event */}
      <EventDialog open={showDialog} onOpenChange={setShowDialog} initialDay={day} initialDate={date} />
    </>
  )
}
