import { useEffect, useState } from "react"
import { useTips } from "@/hooks/use-tips"
import { getActiveTag } from "@/lib/config-tag"
import { scopedLocalStorage } from "@/lib/scoped-storage"
import { publishTagChanges, type PublishFileResult } from "@/lib/publish/publisher"
import type { S3Target } from "@/lib/publish/s3"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { CloudUpload, Loader2, CheckCircle2, MinusCircle, AlertCircle } from "lucide-react"

interface PublishDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type StoredTarget = Pick<S3Target, "region" | "bucket" | "prefix">

const TARGET_KEY = "publish_target"

const readStoredTarget = (): Partial<StoredTarget> => {
  try {
    const raw = scopedLocalStorage.getItem(TARGET_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // Ignore malformed stored values
  }
  return {}
}

const statusIcon = (status: PublishFileResult["status"]) => {
  switch (status) {
    case "uploaded":
    case "created":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    case "unchanged":
      return <MinusCircle className="h-4 w-4 text-muted-foreground" />
    case "error":
      return <AlertCircle className="h-4 w-4 text-destructive" />
  }
}

export function PublishDialog({ open, onOpenChange }: PublishDialogProps) {
  const tips = useTips((state) => state.tips)
  const tag = getActiveTag()
  const stored = readStoredTarget()

  const [region, setRegion] = useState(stored.region ?? "")
  const [bucket, setBucket] = useState(stored.bucket ?? "")
  const [prefix, setPrefix] = useState(stored.prefix ?? "")
  const [accessKeyId, setAccessKeyId] = useState(() =>
    scopedLocalStorage.getItem("aws_access_key_id") ?? "",
  )
  const [secretAccessKey, setSecretAccessKey] = useState(() =>
    scopedLocalStorage.getItem("aws_secret_access_key") ?? "",
  )
  const [rememberSecrets, setRememberSecrets] = useState(
    () => !!scopedLocalStorage.getItem("aws_access_key_id"),
  )
  const [publishing, setPublishing] = useState(false)
  const [results, setResults] = useState<PublishFileResult[]>([])
  const [fatalError, setFatalError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setResults([])
      setFatalError(null)
    }
  }, [open])

  const canPublish =
    !publishing && region.trim() && bucket.trim() && accessKeyId.trim() && secretAccessKey.trim()

  const handlePublish = async () => {
    if (!canPublish) return
    setPublishing(true)
    setResults([])
    setFatalError(null)

    const target: StoredTarget = { region: region.trim(), bucket: bucket.trim(), prefix: prefix.trim() || undefined }
    try {
      scopedLocalStorage.setItem(TARGET_KEY, JSON.stringify(target))
      if (rememberSecrets) {
        scopedLocalStorage.setItem("aws_access_key_id", accessKeyId.trim())
        scopedLocalStorage.setItem("aws_secret_access_key", secretAccessKey.trim())
      } else {
        scopedLocalStorage.removeItem("aws_access_key_id")
        scopedLocalStorage.removeItem("aws_secret_access_key")
      }

      const summary = await publishTagChanges(
        {
          ...target,
          accessKeyId: accessKeyId.trim(),
          secretAccessKey: secretAccessKey.trim(),
        },
        tag,
        tips,
        (result) => setResults((previous) => [...previous, result]),
      )
      void summary
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : String(error))
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish changes</DialogTitle>
          <DialogDescription>
            Upload changed configuration for tag <span className="font-mono font-semibold">{tag}</span> to
            S3. Files without differences are skipped; replaced files are archived first with an ISO
            datetime suffix so nothing is lost.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="publish-region">Region</Label>
              <Input
                id="publish-region"
                placeholder="us-east-1"
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="publish-bucket">Bucket</Label>
              <Input
                id="publish-bucket"
                placeholder="my-bucket"
                value={bucket}
                onChange={(event) => setBucket(event.target.value)}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="publish-prefix">Key prefix (optional)</Label>
            <Input
              id="publish-prefix"
              placeholder="e.g. serenity"
              value={prefix}
              onChange={(event) => setPrefix(event.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="publish-access-key">Access key ID</Label>
            <Input
              id="publish-access-key"
              value={accessKeyId}
              onChange={(event) => setAccessKeyId(event.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="publish-secret-key">Secret access key</Label>
            <Input
              id="publish-secret-key"
              type="password"
              value={secretAccessKey}
              onChange={(event) => setSecretAccessKey(event.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="publish-remember"
              checked={rememberSecrets}
              onCheckedChange={(checked) => setRememberSecrets(checked === true)}
            />
            <Label htmlFor="publish-remember" className="text-xs font-normal text-muted-foreground">
              Remember credentials on this device (admin storage only)
            </Label>
          </div>
        </div>

        {(results.length > 0 || fatalError) && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            {results.map((result) => (
              <div key={result.path} className="flex items-start gap-2 py-0.5">
                {statusIcon(result.status)}
                <div className="min-w-0">
                  <span className="font-mono text-xs">{result.path}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {result.status === "uploaded" && "updated (old file archived)"}
                    {result.status === "created" && "created"}
                    {result.status === "unchanged" && "no changes"}
                    {result.status === "error" && result.message}
                  </span>
                  {result.archiveKey && (
                    <div className="truncate font-mono text-[11px] text-muted-foreground/70">
                      → {result.archiveKey}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {fatalError && (
              <div className="flex items-start gap-2 pt-1 text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="text-xs">{fatalError}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={publishing}>
            Close
          </Button>
          <Button onClick={handlePublish} disabled={!canPublish}>
            {publishing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Publishing…
              </>
            ) : (
              <>
                <CloudUpload className="mr-2 h-4 w-4" />
                Publish to S3
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
