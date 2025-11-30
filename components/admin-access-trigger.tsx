"use client"

import type React from "react"

import { useAdminState } from "@/hooks/use-admin-state"
import { useState } from "react"
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

export function AdminAccessTrigger() {
  const { adminMode, hasAdminAccess, verifyAdminPassword, enterAdminMode, exitAdminMode } = useAdminState()
  const [showDialog, setShowDialog] = useState(false)
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  const handleClick = () => {
    // If already in admin mode, exit admin mode
    if (adminMode) {
      exitAdminMode()
      return
    }

    // Otherwise, try to enter admin mode
    // Only show the dialog if we're not already in admin mode
    if (!adminMode) {
      // Try to enter admin mode without password if user has admin access
      if (hasAdminAccess && enterAdminMode()) {
        // Successfully entered admin mode without password
        return
      }
      // Otherwise show the password dialog
      setShowDialog(true)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (verifyAdminPassword(password)) {
      setShowDialog(false)
      setPassword("")
      setError("")
    } else {
      setError("Incorrect password")
    }
  }

  return (
    <>
      <div
        onClick={handleClick}
        className="fixed bottom-0 right-0 w-10 h-10 z-50 cursor-default"
        aria-hidden="true"
        title="Admin Access"
        style={{ opacity: 0 }}
      />

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Admin Access</DialogTitle>
            <DialogDescription>Enter your admin password to access administrative features.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="password" className="text-right">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="col-span-3"
                />
              </div>
              {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            </div>
            <DialogFooter>
              <Button type="submit">Enter Admin Mode</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
