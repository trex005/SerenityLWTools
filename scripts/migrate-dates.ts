#!/usr/bin/env node
/**
 * One-time migration: convert all events.json files from absolute recurrence.startDate
 * to tag-relative startTag + startOffset, and ensure conf.json has a tags block.
 *
 * Run: npx tsx scripts/migrate-dates.ts [conf-dir]
 */

import * as fs from "node:fs"
import * as path from "node:path"
import * as readline from "node:readline"
import { fileURLToPath } from "node:url"
import { differenceInDays, parseISO } from "date-fns"

// ---------------------------------------------------------------------------
// Pure functions (exported for testing)
// ---------------------------------------------------------------------------

export function computeOffset(eventDateStr: string, tagStartDateStr: string): number {
  return differenceInDays(parseISO(eventDateStr), parseISO(tagStartDateStr))
}

export function convertEventRecurrence(
  event: any,
  tagName: string,
  tagStartDate: string,
): any {
  if (!event?.recurrence) return event
  const r = event.recurrence

  // Already converted — skip
  if (r.startTag !== undefined || r.startOffset !== undefined) return event

  // No startDate to convert — skip
  if (!r.startDate) return event

  const { startDate, endDate, ...rest } = r
  const converted: any = {
    ...rest,
    startTag: tagName,
    startOffset: computeOffset(startDate, tagStartDate),
  }
  if (endDate) {
    converted.endOffset = computeOffset(endDate, tagStartDate)
  }

  return { ...event, recurrence: converted }
}

export function addTagsBlock(
  conf: any,
  tagName: string,
  startDate: string,
): any {
  if (conf?.tags?.[tagName]?.startDate) {
    // Already has a startDate for this tag — preserve it
    return conf
  }
  return {
    ...conf,
    tags: {
      ...(conf.tags ?? {}),
      [tagName]: { startDate },
    },
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function promptLine(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve))
}

function isValidDate(str: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(parseISO(str).getTime())
}

function readJsonFile(filePath: string): any {
  const raw = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "")
  return JSON.parse(raw)
}

function readSuppliedStartDates(): Record<string, string> {
  const raw = process.env.MIGRATE_DATE_START_DATES
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const result: Record<string, string> = {}
    for (const [tag, value] of Object.entries(parsed)) {
      if (typeof value === "string" && isValidDate(value)) {
        result[tag] = value
      }
    }
    return result
  } catch {
    return {}
  }
}

async function run() {
  const confDir = path.resolve(process.argv[2] || "public/conf")
  if (!fs.existsSync(confDir)) {
    console.error(`Directory not found: ${confDir}`)
    process.exit(1)
  }

  const tagDirs = fs
    .readdirSync(confDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const suppliedStartDates = readSuppliedStartDates()

  // Phase 1: collect missing startDates via prompts before writing anything
  const startDates: Record<string, string> = {}
  for (const tagName of tagDirs) {
    const confPath = path.join(confDir, tagName, "conf.json")
    if (!fs.existsSync(confPath)) continue
    const conf = readJsonFile(confPath)
    const existing = conf?.tags?.[tagName]?.startDate
    if (existing) {
      startDates[tagName] = existing
    } else if (suppliedStartDates[tagName]) {
      startDates[tagName] = suppliedStartDates[tagName]
    } else {
      let input = ""
      while (!isValidDate(input)) {
        input = await promptLine(rl, `Enter startDate for tag "${tagName}" (YYYY-MM-DD): `)
        if (!isValidDate(input)) console.log("  Invalid date, try again.")
      }
      startDates[tagName] = input
    }
  }

  rl.close()

  // Phase 2: write conf.json and events.json for each tag
  for (const tagName of tagDirs) {
    const tagDir = path.join(confDir, tagName)
    const confPath = path.join(tagDir, "conf.json")
    const eventsPath = path.join(tagDir, "events.json")
    const startDate = startDates[tagName]

    // Update conf.json
    if (fs.existsSync(confPath)) {
      const conf = readJsonFile(confPath)
      const updated = addTagsBlock(conf, tagName, startDate)
      if (JSON.stringify(updated) !== JSON.stringify(conf)) {
        fs.writeFileSync(confPath, JSON.stringify(updated, null, 2) + "\n")
        console.log(`  Updated conf.json for ${tagName}`)
      }
    }

    // Update events.json
    if (fs.existsSync(eventsPath)) {
      const payload = readJsonFile(eventsPath)
      const events: any[] = Array.isArray(payload) ? payload : (payload.events ?? [])
      const converted = events.map((e) => convertEventRecurrence(e, tagName, startDate))
      const changed = JSON.stringify(converted) !== JSON.stringify(events)
      if (changed) {
        const output = Array.isArray(payload)
          ? converted
          : { ...payload, events: converted }
        fs.writeFileSync(eventsPath, JSON.stringify(output, null, 2) + "\n")
        console.log(`  Updated events.json for ${tagName}`)
      }
    }
  }

  console.log("\nMigration complete.")
}

// Only run CLI when executed directly
const __filename = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  run().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
