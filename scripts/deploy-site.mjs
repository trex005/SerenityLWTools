#!/usr/bin/env node
/**
 * Deploys the built static site (out/) to S3 while protecting the
 * authoritative configuration published through the admin Publish flow.
 *
 * conf/* and archive/* are ALWAYS excluded from both uploads and deletions:
 * the live JSON in S3 is the source of truth for content; the copies under
 * public/conf are only local development fixtures and may be stale.
 *
 * Credentials: if none are available (env vars or the shared
 * [lwserenity-deploy] AWS profile), the script prompts for an access key,
 * secret, and region, verifies them against STS, and stores them in
 * ~/.aws/credentials under that profile for future runs.
 *
 * Usage:
 *   node scripts/deploy-site.mjs              # dry run (shows planned actions)
 *   node scripts/deploy-site.mjs --execute    # perform the sync
 *   node scripts/deploy-site.mjs --execute --delete   # also remove removed assets
 *
 * Environment:
 *   DEPLOY_BUCKET        target bucket (default lwserenity.com)
 *   AWS_PROFILE          use an existing named profile instead of the shared one
 *   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY [/ AWS_SESSION_TOKEN]
 *                        bypass prompting when already present
 */
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createInterface } from "node:readline"
import { homedir, platform } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const DEPLOY_PROFILE = "lwserenity-deploy"
const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(here, "..", "out")

if (!existsSync(path.join(outDir, "index.html"))) {
  console.error("out/index.html not found. Run `npm run build` first.")
  process.exit(1)
}

const bucket = process.env.DEPLOY_BUCKET || "lwserenity.com"
const execute = process.argv.includes("--execute")
const useDelete = process.argv.includes("--delete")

const awsArgs = (...extra) => {
  const args = ["s3", "sync", `${outDir.replace(/\\/g, "/")}/`, `s3://${bucket}/`, "--exclude", "conf/*", "--exclude", "archive/*"]
  if (useDelete) args.push("--delete")
  args.push(...extra)
  return args
}

// ---------------------------------------------------------------------------
// Credential handling
// ---------------------------------------------------------------------------

const credentialsPath = path.join(homedir(), ".aws", "credentials")
const envHasCredentials = () =>
  !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY

const readSharedProfile = () => {
  try {
    const text = readFileSync(credentialsPath, "utf8")
    const match = text.match(new RegExp(`\\[${DEPLOY_PROFILE}\\]([^\[]*)`, "i"))
    if (!match) return null
    const pick = (key) => {
      const m = match[1].match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "mi"))
      return m ? m[1].trim() : null
    }
    return {
      accessKeyId: pick("aws_access_key_id"),
      secretAccessKey: pick("aws_secret_access_key"),
      region: pick("region"),
    }
  } catch {
    return null
  }
}

const upsertSharedProfile = ({ accessKeyId, secretAccessKey, region }) => {
  mkdirSync(path.dirname(credentialsPath), { recursive: true })
  let text = ""
  try {
    text = readFileSync(credentialsPath, "utf8")
  } catch {
    // New file
  }

  const section = [
    `[${DEPLOY_PROFILE}]`,
    `aws_access_key_id = ${accessKeyId}`,
    `aws_secret_access_key = ${secretAccessKey}`,
    `region = ${region}`,
  ].join("\n")

  const header = `[${DEPLOY_PROFILE}]`
  const startIndex = text.toLowerCase().indexOf(header.toLowerCase())
  let updated
  if (startIndex >= 0) {
    const nextSectionIndex = text.indexOf("\n[", startIndex + 1)
    const endIndex = nextSectionIndex === -1 ? text.length : nextSectionIndex + 1
    updated = text.slice(0, startIndex) + section + "\n\n" + text.slice(endIndex).replace(/^\n+/, "")
  } else {
    updated = text.replace(/\n*$/, "\n\n") + section + "\n"
  }

  writeFileSync(credentialsPath, updated, { mode: 0o600 })
}

/** Shared prompt helpers; a single readline plus a line queue keeps every stdin line. */
let promptRl = null
const lineQueue = []
let lineWaiter = null

const withRl = () => {
  if (!promptRl) {
    promptRl = createInterface({ input: process.stdin, output: process.stdout })
    promptRl.on("line", (line) => {
      if (lineWaiter) {
        const waiter = lineWaiter
        lineWaiter = null
        waiter(line)
      } else {
        lineQueue.push(line)
      }
    })
    promptRl.on("close", () => {
      if (lineWaiter) {
        const waiter = lineWaiter
        lineWaiter = null
        waiter("")
      }
    })
    promptRl.on("SIGINT", () => process.exit(130))
  }
  return promptRl
}

const nextLine = () =>
  new Promise((resolve) => {
    if (lineQueue.length) return resolve(lineQueue.shift())
    lineWaiter = resolve
  })

const askHidden = async (question) => {
  const rl = withRl()
  const originalWrite = rl.output.write.bind(rl.output)
  originalWrite(question)
  rl.output.write = () => {}
  const answer = await nextLine()
  rl.output.write = originalWrite
  originalWrite("\n")
  return answer.trim()
}

const askVisible = async (question, fallback = "") => {
  withRl()
  process.stdout.write(question + (fallback ? ` [${fallback}]: ` : ": "))
  const answer = await nextLine()
  return answer.trim() || fallback
}

const verifyIdentity = (profileArg) => {
  const result = spawnSync("aws", ["sts", "get-caller-identity", ...(profileArg ? ["--profile", profileArg] : [])], {
    encoding: "utf8",
    shell: platform() === "win32",
  })
  if (result.status !== 0) return null
  try {
    return JSON.parse(result.stdout)
  } catch {
    return {}
  }
}

const ensureCredentials = async () => {
  // 1. Explicit env credentials win; nothing stored.
  if (envHasCredentials()) return { mode: "env" }

  // 2. Explicitly requested profile must already exist and work.
  if (process.env.AWS_PROFILE) {
    if (!verifyIdentity(process.env.AWS_PROFILE)) {
      console.error(`AWS_PROFILE=${process.env.AWS_PROFILE} is not usable. Fix ~/.aws/credentials or unset AWS_PROFILE.`)
      process.exit(1)
    }
    return { mode: "profile", profile: process.env.AWS_PROFILE }
  }

  // 3. Shared deploy profile, reused silently once verified.
  const shared = readSharedProfile()
  if (shared?.accessKeyId) {
    if (verifyIdentity(DEPLOY_PROFILE)) return { mode: "profile", profile: DEPLOY_PROFILE }
    console.error(`Stored [${DEPLOY_PROFILE}] credentials failed verification; please re-enter them.`)
  }

  // 4. Prompt, verify, store.
  console.log(`No usable AWS credentials found.`)
  console.log(`They will be stored in ${credentialsPath} under the [${DEPLOY_PROFILE}] profile.\n`)
  const accessKeyId = await askVisible("AWS Access Key ID")
  if (!accessKeyId) {
    console.error("Access Key ID is required.")
    process.exit(1)
  }
  const secretAccessKey = await askHidden("AWS Secret Access Key (input hidden): ")
  if (!secretAccessKey) {
    console.error("Secret Access Key is required.")
    process.exit(1)
  }
  const region =
    (await askVisible("AWS region", shared?.region || process.env.DEPLOY_AWS_REGION || "us-east-1")) ||
    "us-east-1"
  const sessionToken = await askHidden("Session token (leave blank for long-lived keys): ")

  upsertSharedProfile({ accessKeyId, secretAccessKey, region })
  if (sessionToken) {
    // Append session token to the freshly written section.
    const text = readFileSync(credentialsPath, "utf8")
    const updated = text.replace(
      new RegExp(`(\\[${DEPLOY_PROFILE}\\][^\\[]*)`, "i"),
      `$1aws_session_token = ${sessionToken}\n`,
    )
    writeFileSync(credentialsPath, updated, { mode: 0o600 })
  }

  if (!verifyIdentity(DEPLOY_PROFILE)) {
    console.error("Credentials were rejected by AWS. Delete the bad entry with:")
    console.error(`  aws configure --profile ${DEPLOY_PROFILE}`)
    process.exit(1)
  }

  console.log(`Verified and saved to [${DEPLOY_PROFILE}] profile.\n`)
  promptRl?.close()
  return { mode: "profile", profile: DEPLOY_PROFILE }
}

// ---------------------------------------------------------------------------

const credentials = await ensureCredentials()
const extraArgs = credentials.mode === "profile" ? ["--profile", credentials.profile] : []

if (!execute) {
  console.log("Dry run (pass --execute to apply):")
}
console.log(`  aws ${awsArgs(...extraArgs).join(" ")}\n`)

const result = spawnSync("aws", awsArgs(...extraArgs), {
  stdio: "inherit",
  shell: platform() === "win32",
})
process.exit(result.status ?? 1)
