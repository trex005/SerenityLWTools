import {
  CopyObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"

export interface S3Target {
  region: string
  bucket: string
  prefix?: string
  accessKeyId: string
  secretAccessKey: string
}

export const joinKey = (target: S3Target, path: string): string => {
  const prefix = target.prefix?.trim().replace(/^\/+|\/+$/g, "")
  return prefix ? `${prefix}/${path}` : path
}

const clientFor = (target: S3Target): S3Client =>
  new S3Client({
    region: target.region,
    credentials: {
      accessKeyId: target.accessKeyId,
      secretAccessKey: target.secretAccessKey,
    },
  })

const isNotFound = (error: unknown): boolean => {
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number } }
  return (
    err?.name === "NoSuchKey" ||
    err?.name === "NotFound" ||
    err?.$metadata?.httpStatusCode === 404
  )
}

export async function fetchRemoteJson(target: S3Target, key: string): Promise<unknown | null> {
  const client = clientFor(target)
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: target.bucket, Key: key }))
    if (!response.Body) return null
    const text = await response.Body.transformToString()
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  } finally {
    client.destroy()
  }
}

export async function putJsonObject(target: S3Target, key: string, value: unknown): Promise<void> {
  const client = clientFor(target)
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: target.bucket,
        Key: key,
        Body: JSON.stringify(value, null, 2) + "\n",
        ContentType: "application/json",
        CacheControl: "no-cache, must-revalidate",
      }),
    )
  } finally {
    client.destroy()
  }
}

export async function copyObject(target: S3Target, fromKey: string, toKey: string): Promise<void> {
  const client = clientFor(target)
  try {
    await client.send(
      new CopyObjectCommand({
        Bucket: target.bucket,
        CopySource: `${target.bucket}/${fromKey.split("/").map(encodeURIComponent).join("/")}`,
        Key: toKey,
      }),
    )
  } finally {
    client.destroy()
  }
}

/**
 * Archive naming: archive/<original path>/<name>.<ISO datetime>.json
 * The stamp is colon/dot-free so it is safe as an S3 key segment.
 */
export const archiveKeyFor = (key: string, stamp: string): string => {
  const segments = key.split("/")
  const fileName = segments.pop() ?? key
  const stamped = fileName.replace(/(\.[^.]+)$/, `.${stamp}$1`)
  return ["archive", ...segments, stamped].join("/")
}

export const publishStamp = (date = new Date()): string =>
  date.toISOString().replace(/[:.]/g, "-")
