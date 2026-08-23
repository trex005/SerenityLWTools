#!/usr/bin/env node
/**
 * Verifies that the trusted Serenity engine artifact embedded by LWMinions is
 * byte-identical to the one built in this repository. Run with --fix to copy
 * the freshly built artifact into LWMinions.
 *
 * Usage:
 *   node scripts/check-engine-artifact.mjs          # compare (exit 1 on drift)
 *   node scripts/check-engine-artifact.mjs --fix    # copy artifact to LWMinions
 */
import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "..")
const lwMinionsRoot = process.env.LWMINIONS_ROOT || path.resolve(repoRoot, "..", "LWMinions")

const source = path.join(repoRoot, "artifacts", "lw-serenity-engine.js")
const targetCandidates = [
  path.join(lwMinionsRoot, "src", "lwminions", "assets", "serenity", "lw-serenity-engine.js"),
  path.join(lwMinionsRoot, "LWMinions", "src", "lwminions", "assets", "serenity", "lw-serenity-engine.js"),
]

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex")

if (!existsSync(source)) {
  console.error(`Engine artifact missing: ${source}`)
  console.error("Run `pnpm build:engine` first.")
  process.exit(1)
}

const target = targetCandidates.find((candidate) => existsSync(candidate))

if (!target) {
  console.error("LWMinions engine asset not found in any of:")
  for (const candidate of targetCandidates) console.error(`  ${candidate}`)
  console.error("Set LWMINIONS_ROOT if LWMinions lives elsewhere.")
  process.exit(1)
}

const sourceHash = sha256(source)
const targetHash = sha256(target)

if (sourceHash === targetHash) {
  console.log(`Engine artifacts match (${sourceHash.slice(0, 12)}…)`)
  process.exit(0)
}

if (process.argv.includes("--fix")) {
  mkdirSync(path.dirname(target), { recursive: true })
  copyFileSync(source, target)
  console.log(`Copied artifact to LWMinions (${sourceHash.slice(0, 12)}…)`)
  process.exit(0)
}

console.error("Engine artifact drift detected!")
console.error(`  LWSerenity: ${sourceHash}`)
console.error(`  LWMinions:  ${targetHash}`)
console.error("Run `pnpm build:engine` then sync with `pnpm check:engine --fix`.")
process.exit(1)
