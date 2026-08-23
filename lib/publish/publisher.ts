import { buildChildDeltaFiles } from "@/lib/config-fetcher"
import { canonicalJson } from "./canonical"
import { archiveKeyFor, copyObject, fetchRemoteJson, joinKey, putJsonObject, publishStamp, type S3Target } from "./s3"

export interface DeltaBundle {
  config: Record<string, unknown>
  events: { schemaVersion: number; updated: string; operations: unknown[] }
  tips: { updated: string; tips: unknown[] }
}

export type FileChangeStatus = "uploaded" | "unchanged" | "error" | "created"

export interface PublishFileResult {
  path: string
  key: string
  status: FileChangeStatus
  archiveKey?: string
  message?: string
}

export interface PublishSummary {
  stamp: string
  results: PublishFileResult[]
  uploaded: number
  unchanged: number
  failed: number
}

export async function planPublish(
  target: Omit<S3Target, "accessKeyId" | "secretAccessKey">,
  tag: string,
  effectiveTips: unknown[],
): Promise<{ files: { path: string; value: unknown }[] }> {
  const deltas = (await buildChildDeltaFiles([], effectiveTips, tag)) as unknown as DeltaBundle
  return {
    files: [
      { path: `conf/${tag}/conf.json`, value: deltas.config },
      { path: `conf/${tag}/events.json`, value: deltas.events },
      { path: `conf/${tag}/tips.json`, value: deltas.tips },
    ],
  }
}

/**
 * Publish the current tag's delta files:
 * - fetch each remote file and compare canonical JSON (`updated` timestamps ignored)
 * - unchanged files are skipped entirely
 * - changed files are first archived under archive/<path>/<name>.<ISO>.json then overwritten
 * - archival happens before any overwrite so old data is never lost
 */
export async function publishTagChanges(
  target: S3Target,
  tag: string,
  effectiveTips: unknown[],
  onFileDone?: (result: PublishFileResult) => void,
): Promise<PublishSummary> {
  const stamp = publishStamp()
  const { files } = await planPublish(target, tag, effectiveTips)

  const results: PublishFileResult[] = []

  for (const file of files) {
    const key = joinKey(target, file.path)
    try {
      const remote = await fetchRemoteJson(target, key)
      if (remote !== null && canonicalJson(remote) === canonicalJson(file.value)) {
        const result: PublishFileResult = { path: file.path, key, status: "unchanged" }
        results.push(result)
        onFileDone?.(result)
        continue
      }

      let archiveKey: string | undefined
      if (remote !== null) {
        archiveKey = archiveKeyFor(key, stamp)
        await copyObject(target, key, archiveKey)
      }

      await putJsonObject(target, key, file.value)
      const result: PublishFileResult = {
        path: file.path,
        key,
        status: remote === null ? "created" : "uploaded",
        archiveKey,
      }
      results.push(result)
      onFileDone?.(result)
    } catch (error) {
      const result: PublishFileResult = {
        path: file.path,
        key,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      }
      results.push(result)
      onFileDone?.(result)
    }
  }

  return {
    stamp,
    results,
    uploaded: results.filter((r) => r.status === "uploaded" || r.status === "created").length,
    unchanged: results.filter((r) => r.status === "unchanged").length,
    failed: results.filter((r) => r.status === "error").length,
  }
}
