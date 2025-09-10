import { Shield } from "lucide-react"

interface BrandLogoProps {
  className?: string
  size?: number
}

export function BrandLogo({ className = "", size = 24 }: BrandLogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Shield size={size} className="text-primary" />
      <span className="font-bold text-lg">Serenity Last War Tools</span>
    </div>
  )
}
