#!/usr/bin/env node
/**
 * Deploys the built static site (out/) to S3 while protecting the
 * authoritative configuration published through the admin Publish flow.
 *
 * conf/* and archive/* are ALWAYS excluded from both uploads and deletions:
 * the live JSON in S3 is the source of truth for content; the copies under
 * public/conf are only local development fixtures and may be stale.
 *
 * Usage:
 *   node scripts/deploy-site.mjs              # dry run (shows planned actions)
 *   node scripts/deploy-site.mjs --execute    # perform the sync
 *   node scripts/deploy-site.mjs --execute --delete   # also remove removed assets
 *
 * Environment:
 *   DEPLOY_BUCKET  target bucket (default lwserenity.com)
 *   AWS_PROFILE    optional AWS profile to use
 */
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(here, "..", "out")

if (!existsSync(path.join(outDir, "index.html"))) {
  console.error("out/index.html not found. Run `npm run build` first.")
  process.exit(1)
}

const bucket = process.env.DEPLOY_BUCKET || "lwserenity.com"
const execute = process.argv.includes("--execute")
const useDelete = process.argv.includes("--delete")
const profile = process.env.AWS_PROFILE

const args = [
  "s3",
  "sync",
  `${outDir.replace(/\\/g, "/")}/`,
  `s3://${bucket}/`,
  // Authoritative content lives in S3 and is managed by the admin Publish flow.
  "--exclude",
  "conf/*",
  "--exclude",
  "archive/*",
]

if (useDelete) args.push("--delete")
if (profile) args.push("--profile", profile)
if (!execute) args.push("--dryrun")

console.log(execute ? "Deploying:" : "Dry run (pass --execute to apply):")
console.log(`  aws ${args.join(" ")}\n`)

const result = spawnSync("aws", args, { stdio: "inherit", shell: process.platform === "win32" })
process.exit(result.status ?? 1)
