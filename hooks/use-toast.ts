import type React from "react"
// Adapted from shadcn/ui toast hook
import type { Toast, ToastActionElement } from "@/components/ui/toast"
import { useToast as useToastPrimitive } from "@/components/ui/use-toast"

type ToastVariants = "default" | "destructive" | "success"

type ToastActionProps = React.ComponentPropsWithoutRef<typeof Toast> & {
  altText?: string
  variant?: ToastVariants
  action?: ToastActionElement
}

export const useToast = () => {
  const { toast, dismiss, toasts } = useToastPrimitive()

  return {
    toast: ({ ...props }: ToastActionProps) => toast(props),
    dismiss,
    toasts,
  }
}
