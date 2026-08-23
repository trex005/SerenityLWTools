#!/usr/bin/env node
/**
 * Offline v1 -> v2 tag-tree converter.
 *
 * Dry run (required first):
 *   pnpm tsx scripts/convert-tag-schema.ts --input downloaded/conf --output staging/conf --audit conversion-audit.json --events-suffix v3
 *
 * Review the audit, fill every candidate's `classification`, then write:
 *   pnpm tsx scripts/convert-tag-schema.ts --input downloaded/conf --output staging/conf --audit conversion-audit.json --classifications conversion-audit.json --events-suffix v3 --write
 */

import { createHash } from "node:crypto"
import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

type JsonObject = Record<string, any>
export type Classification = "owned" | "override" | "delete"

export interface CandidateAudit {
  tag: string
  id: string
  suggestedClassification: "owned"
  classification: Classification | null
  event: JsonObject
}

export interface ConversionAudit {
  auditVersion: 1
  sourceFingerprint: string
  tags: string[]
  candidates: CandidateAudit[]
}

interface LoadedTag {
  name: string
  dir: string
  conf: JsonObject
  eventDocument: JsonObject | null
  legacyEvents: JsonObject[] | null
  parents: string[]
}

export interface ConversionOptions {
  inputDir: string
  outputDir: string
  auditPath: string
  classificationsPath?: string
  eventsSuffix?: string
  write?: boolean
  acceptOwned?: boolean
}

// Matches the runtime's sanitizeTag grammar without silently normalizing names.
const SAFE_TAG = /^[a-z0-9_-]+$/
const MAX_LINEAGE = 32

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""))
}

function stable(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function assertPlainObject(value: any, label: string): asserts value is JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
}

function eventIds(tag: LoadedTag): Set<string> {
  const ids = new Set<string>()
  if (tag.legacyEvents) {
    for (const event of tag.legacyEvents) if (typeof event?.id === "string" && event.id) ids.add(event.id)
  } else if (tag.eventDocument) {
    for (const operation of tag.eventDocument.operations ?? []) {
      const id = operation?.kind === "owned" ? operation?.event?.id : operation?.id
      if (typeof id === "string" && id) ids.add(id)
    }
  }
  return ids
}

function escapePointer(segment: string): string {
  if (segment === "__proto__" || segment === "prototype" || segment === "constructor") {
    throw new Error(`Unsafe JSON Pointer segment: ${segment}`)
  }
  return segment.replace(/~/g, "~0").replace(/\//g, "~1")
}

/** Flatten authored object leaves. Arrays are deliberately atomic. */
export function eventToPointerSet(event: JsonObject): Record<string, any> {
  const output: Record<string, any> = {}
  const visit = (value: any, segments: string[]) => {
    if (Array.isArray(value) || value === null || typeof value !== "object" || Object.keys(value).length === 0) {
      output[`/${segments.map(escapePointer).join("/")}`] = value
      return
    }
    for (const key of Object.keys(value).sort()) visit(value[key], [...segments, key])
  }
  for (const key of Object.keys(event).filter((key) => key !== "id" && key !== "deleted").sort()) {
    visit(event[key], [key])
  }
  return output
}

function validateV2Document(document: JsonObject, tag: string): void {
  if (document.schemaVersion !== 2 || !Array.isArray(document.operations) || "events" in document) {
    throw new Error(`${tag}/events.json is not a valid version 2 document`)
  }
  const seen = new Set<string>()
  for (const operation of document.operations) {
    assertPlainObject(operation, `${tag} event operation`)
    if (!(["owned", "override", "delete"] as unknown[]).includes(operation.kind)) {
      throw new Error(`${tag} has unknown event operation kind`)
    }
    const id = operation.kind === "owned" ? operation.event?.id : operation.id
    if (typeof id !== "string" || !id) throw new Error(`${tag} has an operation without an ID`)
    if (seen.has(id)) throw new Error(`${tag} has multiple operations for event ${id}`)
    seen.add(id)
    if (operation.kind === "owned") assertPlainObject(operation.event, `${tag} owned event ${id}`)
    if (operation.kind === "override") {
      assertPlainObject(operation.set, `${tag} override set ${id}`)
      if (operation.remove !== undefined && (!Array.isArray(operation.remove) || operation.remove.some((item: unknown) => typeof item !== "string"))) {
        throw new Error(`${tag} override remove ${id} must be a string array`)
      }
      const pointers = [...Object.keys(operation.set), ...(operation.remove ?? [])]
      for (const pointer of pointers) {
        if (!pointer.startsWith("/") || pointer === "/id") throw new Error(`${tag} has an invalid override pointer: ${pointer}`)
        if (/~(?:[^01]|$)/.test(pointer)) throw new Error(`${tag} has an invalid JSON Pointer escape: ${pointer}`)
        const segments = pointer.slice(1).split("/").map((part: string) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
        for (const segment of segments) escapePointer(segment)
      }
      const unique = new Set(pointers)
      if (unique.size !== pointers.length) throw new Error(`${tag} has duplicate override pointers for ${id}`)
      for (const left of pointers) for (const right of pointers) {
        if (left !== right && right.startsWith(`${left}/`)) throw new Error(`${tag} has overlapping override pointers for ${id}`)
      }
    }
  }
}

function validateTagMetadata(conf: JsonObject, tag: string): void {
  if (conf.tags !== undefined) assertPlainObject(conf.tags, `${tag}.tags`)
  for (const [name, metadata] of Object.entries(conf.tags ?? {})) {
    assertPlainObject(metadata, `${tag}.tags.${name}`)
    if ("startDate" in metadata && !validDate(metadata.startDate)) throw new Error(`${tag}.tags.${name} has an invalid startDate`)
    if ("endDate" in metadata && metadata.endDate !== null && !validDate(metadata.endDate)) throw new Error(`${tag}.tags.${name} has an invalid endDate`)
    if (validDate(metadata.startDate) && validDate(metadata.endDate) && metadata.endDate < metadata.startDate) {
      throw new Error(`${tag}.tags.${name} has endDate before startDate`)
    }
  }
}

function loadTags(inputDir: string): Map<string, LoadedTag> {
  if (!fs.existsSync(inputDir) || !fs.statSync(inputDir).isDirectory()) throw new Error(`Input directory not found: ${inputDir}`)
  const tags = new Map<string, LoadedTag>()
  for (const entry of fs.readdirSync(inputDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue
    if (!SAFE_TAG.test(entry.name)) throw new Error(`Unsafe tag directory name: ${entry.name}`)
    const dir = path.join(inputDir, entry.name)
    const confPath = path.join(dir, "conf.json")
    if (!fs.existsSync(confPath)) continue
    const conf = readJson(confPath)
    assertPlainObject(conf, `${entry.name}/conf.json`)
    validateTagMetadata(conf, entry.name)
    const anchor = conf.tags?.[entry.name]?.startDate
    if (!validDate(anchor)) throw new Error(`${entry.name} is missing its required valid self startDate`)
    if ("parent" in conf && "parents" in conf) throw new Error(`${entry.name} mixes parent and parents schemas`)
    if ("parent" in conf && conf.parent !== undefined && (typeof conf.parent !== "string" || !SAFE_TAG.test(conf.parent))) {
      throw new Error(`${entry.name} has an invalid parent`)
    }
    if ("parents" in conf && !Array.isArray(conf.parents)) throw new Error(`${entry.name}.parents must be an array`)

    const eventsPath = path.join(dir, "events.json")
    let eventDocument: JsonObject | null = null
    let legacyEvents: JsonObject[] | null = null
    if (fs.existsSync(eventsPath)) {
      const parsed = readJson(eventsPath)
      if (parsed?.schemaVersion === 2) {
        validateV2Document(parsed, entry.name)
        eventDocument = parsed
      } else {
        const events = Array.isArray(parsed) ? parsed : parsed?.events
        if (!Array.isArray(events) || (parsed && typeof parsed === "object" && "operations" in parsed)) {
          throw new Error(`${entry.name}/events.json has an unsupported or mixed schema`)
        }
        for (const event of events) {
          assertPlainObject(event, `${entry.name} legacy event`)
          if (typeof event.id !== "string" || !event.id) throw new Error(`${entry.name} has a legacy event without an ID`)
        }
        const ids = events.map((event: JsonObject) => event.id)
        if (new Set(ids).size !== ids.length) throw new Error(`${entry.name} has duplicate legacy event IDs`)
        eventDocument = Array.isArray(parsed) ? { events } : parsed
        legacyEvents = events
      }
    }
    tags.set(entry.name, { name: entry.name, dir, conf, eventDocument, legacyEvents, parents: [] })
  }
  if (tags.size === 0) throw new Error("No tag conf.json files were found")
  return tags
}

function resolveLineages(tags: Map<string, LoadedTag>): void {
  const resolving = new Set<string>()
  const resolved = new Set<string>()
  const resolve = (name: string): string[] => {
    const tag = tags.get(name)
    if (!tag) throw new Error(`Referenced parent tag is missing: ${name}`)
    if (resolved.has(name)) return tag.parents
    if (resolving.has(name)) throw new Error(`Parent cycle detected at ${name}`)
    resolving.add(name)
    let parents: string[]
    if (Array.isArray(tag.conf.parents)) {
      parents = [...tag.conf.parents]
      if (parents.some((item) => typeof item !== "string" || !SAFE_TAG.test(item))) throw new Error(`${name} has an invalid parent entry`)
      if (new Set(parents).size !== parents.length) throw new Error(`${name} has duplicate parents`)
      if (parents.includes(name)) throw new Error(`${name} includes itself in parents`)
      if (parents.length > MAX_LINEAGE) throw new Error(`${name} lineage exceeds ${MAX_LINEAGE}`)
      for (const parent of parents) if (!tags.has(parent)) throw new Error(`Referenced parent tag is missing: ${parent}`)
    } else if (typeof tag.conf.parent === "string") {
      parents = [tag.conf.parent, ...resolve(tag.conf.parent)]
    } else {
      parents = []
    }
    if (parents.length > MAX_LINEAGE) throw new Error(`${name} lineage exceeds ${MAX_LINEAGE}`)
    tag.parents = parents
    resolving.delete(name)
    resolved.add(name)
    return parents
  }
  for (const name of [...tags.keys()].sort()) resolve(name)

  // Each named parent's own lineage must match the outward suffix.
  for (const tag of tags.values()) {
    for (let index = 0; index < tag.parents.length; index++) {
      const parent = tags.get(tag.parents[index])!
      const expected = tag.parents.slice(index + 1)
      if (stable(parent.parents) !== stable(expected)) {
        throw new Error(`Inconsistent lineage suffix: ${tag.name} expects ${parent.name} -> [${expected.join(", ")}]`)
      }
    }
  }
}

function fingerprint(tags: Map<string, LoadedTag>): string {
  const source = [...tags.values()].sort((a, b) => a.name.localeCompare(b.name)).map((tag) => ({
    name: tag.name,
    conf: tag.conf,
    events: tag.eventDocument,
  }))
  return createHash("sha256").update(stable(source)).digest("hex")
}

function makeAudit(tags: Map<string, LoadedTag>): ConversionAudit {
  const candidates: CandidateAudit[] = []
  for (const tag of [...tags.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    if (!tag.legacyEvents) continue
    const lowerIds = new Set<string>()
    for (const parentName of tag.parents) for (const id of eventIds(tags.get(parentName)!)) lowerIds.add(id)
    for (const event of tag.legacyEvents) {
      if (!event.deleted && !lowerIds.has(event.id)) {
        candidates.push({ tag: tag.name, id: event.id, suggestedClassification: "owned", classification: null, event })
      }
    }
  }
  candidates.sort((a, b) => a.tag.localeCompare(b.tag) || a.id.localeCompare(b.id))
  return { auditVersion: 1, sourceFingerprint: fingerprint(tags), tags: [...tags.keys()].sort(), candidates }
}

function loadClassifications(options: ConversionOptions, audit: ConversionAudit): Map<string, Classification> {
  const result = new Map<string, Classification>()
  if (options.acceptOwned) for (const candidate of audit.candidates) result.set(`${candidate.tag}\0${candidate.id}`, "owned")
  if (!options.classificationsPath) return result
  const supplied = readJson(options.classificationsPath) as ConversionAudit
  if (supplied.auditVersion !== 1 || supplied.sourceFingerprint !== audit.sourceFingerprint) {
    throw new Error("Classification audit does not match the current source fingerprint")
  }
  if (!Array.isArray(supplied.candidates)) throw new Error("Classification audit has no candidates array")
  const expected = new Set(audit.candidates.map((item) => `${item.tag}\0${item.id}`))
  const suppliedKeys = new Set<string>()
  for (const item of supplied.candidates) {
    const key = `${item.tag}\0${item.id}`
    if (!expected.has(key)) throw new Error(`Classification contains unknown candidate ${item.tag}/${item.id}`)
    if (suppliedKeys.has(key)) throw new Error(`Classification contains duplicate candidate ${item.tag}/${item.id}`)
    suppliedKeys.add(key)
    if (!(item.classification === "owned" || item.classification === "override" || item.classification === "delete")) {
      throw new Error(`Unresolved classification for ${item.tag}/${item.id}`)
    }
    result.set(key, item.classification)
  }
  return result
}

function resolveSuffix(tags: Map<string, LoadedTag>, requested?: string): string | undefined {
  if (requested !== undefined) {
    if (!requested.trim()) throw new Error("events suffix cannot be empty")
    for (const tag of tags.values()) {
      if (tag.legacyEvents && tag.conf.storage?.eventsSuffix === requested) {
        throw new Error(`${tag.name} requires a new --events-suffix to invalidate its version 1 browser storage`)
      }
    }
    return requested
  }
  const suffixes = new Set<string>()
  for (const tag of tags.values()) {
    const suffix = tag.conf.storage?.eventsSuffix
    if (suffix !== undefined) {
      if (typeof suffix !== "string" || !suffix) throw new Error(`${tag.name} has an invalid storage.eventsSuffix`)
      suffixes.add(suffix)
    }
  }
  if (suffixes.size > 1) throw new Error("Input has inconsistent storage.eventsSuffix values; supply --events-suffix")
  if ([...tags.values()].some((tag) => tag.legacyEvents !== null)) {
    throw new Error("Version 1 input requires an explicit --events-suffix for browser-storage invalidation")
  }
  return suffixes.values().next().value
}

function operationFor(event: JsonObject, classification: Classification | undefined, inherited: boolean): JsonObject {
  if (event.deleted || classification === "delete") return { kind: "delete", id: event.id }
  if (inherited || classification === "override") return { kind: "override", id: event.id, set: eventToPointerSet(event) }
  if (classification === "owned") return { kind: "owned", event }
  throw new Error(`Unresolved classification for event ${event.id}`)
}

function copyTree(source: string, destination: string): void {
  fs.mkdirSync(destination, { recursive: true })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name)
    const to = path.join(destination, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in the input tree: ${from}`)
    if (entry.isDirectory()) copyTree(from, to)
    else if (entry.isFile()) fs.copyFileSync(from, to)
    else throw new Error(`Unsupported filesystem entry: ${from}`)
  }
}

function writeJson(filePath: string, value: any): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function stage(tags: Map<string, LoadedTag>, options: ConversionOptions, classifications: Map<string, Classification>, suffix: string | undefined): void {
  const output = path.resolve(options.outputDir)
  const input = path.resolve(options.inputDir)
  if (output === input || output.startsWith(`${input}${path.sep}`)) throw new Error("Output must be a separate tree outside the input directory")
  if (fs.existsSync(output)) throw new Error(`Output already exists: ${output}`)
  const parent = path.dirname(output)
  fs.mkdirSync(parent, { recursive: true })
  const temporary = fs.mkdtempSync(path.join(parent, `.${path.basename(output)}.tmp-`))
  try {
    copyTree(input, temporary)
    for (const tag of tags.values()) {
      const conf: JsonObject = { ...tag.conf, parents: tag.parents }
      delete conf.parent
      if (suffix !== undefined) conf.storage = { ...(conf.storage ?? {}), eventsSuffix: suffix }
      writeJson(path.join(temporary, tag.name, "conf.json"), conf)
      if (tag.legacyEvents) {
        const lowerIds = new Set<string>()
        for (const parentName of tag.parents) for (const id of eventIds(tags.get(parentName)!)) lowerIds.add(id)
        const operations = tag.legacyEvents.map((event) => operationFor(
          event,
          classifications.get(`${tag.name}\0${event.id}`),
          lowerIds.has(event.id),
        ))
        const original = tag.eventDocument ?? {}
        const converted: JsonObject = { schemaVersion: 2 }
        for (const [key, value] of Object.entries(original)) {
          if (key !== "events" && key !== "operations" && key !== "schemaVersion") converted[key] = value
        }
        converted.operations = operations
        writeJson(path.join(temporary, tag.name, "events.json"), converted)
      }
    }
    fs.renameSync(temporary, output)
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true })
    throw error
  }
}

export function convertTagTree(options: ConversionOptions): ConversionAudit {
  const inputDir = path.resolve(options.inputDir)
  const auditPath = path.resolve(options.auditPath)
  if (auditPath === inputDir || auditPath.startsWith(`${inputDir}${path.sep}`)) {
    throw new Error("Audit output must be outside the immutable input tree")
  }
  const tags = loadTags(inputDir)
  resolveLineages(tags)
  const suffix = resolveSuffix(tags, options.eventsSuffix)
  const audit = makeAudit(tags)
  if (options.write && audit.candidates.length && !options.classificationsPath) {
    if (!options.acceptOwned) throw new Error("A reviewed classification audit is required before writing")
    if (!fs.existsSync(options.auditPath)) throw new Error("Run the dry-run audit before using --accept-owned --write")
    const prior = readJson(options.auditPath)
    if (prior?.auditVersion !== 1 || prior?.sourceFingerprint !== audit.sourceFingerprint) {
      throw new Error("The prior dry-run audit does not match the current source fingerprint")
    }
  }
  const classifications = loadClassifications(options, audit)
  const renderedAudit: ConversionAudit = {
    ...audit,
    candidates: audit.candidates.map((candidate) => ({
      ...candidate,
      classification: classifications.get(`${candidate.tag}\0${candidate.id}`) ?? null,
    })),
  }
  fs.mkdirSync(path.dirname(auditPath), { recursive: true })
  writeJson(auditPath, renderedAudit)
  if (options.write) {
    const unresolved = renderedAudit.candidates.filter((candidate) => candidate.classification === null)
    if (unresolved.length) throw new Error(`${unresolved.length} candidate-owned event(s) remain unresolved; review the audit first`)
    stage(tags, options, classifications, suffix)
  }
  return renderedAudit
}

function parseArgs(argv: string[]): ConversionOptions {
  const values = new Map<string, string>()
  let write = false
  let acceptOwned = false
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === "--write") write = true
    else if (argument === "--accept-owned") acceptOwned = true
    else if (argument.startsWith("--")) {
      const value = argv[++index]
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`)
      values.set(argument, value)
    } else throw new Error(`Unexpected argument: ${argument}`)
  }
  for (const required of ["--input", "--output", "--audit"]) if (!values.has(required)) throw new Error(`Missing required ${required}`)
  return {
    inputDir: values.get("--input")!, outputDir: values.get("--output")!, auditPath: values.get("--audit")!,
    classificationsPath: values.get("--classifications"), eventsSuffix: values.get("--events-suffix"), write, acceptOwned,
  }
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  try {
    const options = parseArgs(process.argv.slice(2))
    const audit = convertTagTree(options)
    console.log(`${options.write ? "Converted" : "Audited"} ${audit.tags.length} tags; ${audit.candidates.length} candidate-owned event(s).`)
    if (!options.write) console.log(`Review ${path.resolve(options.auditPath)} and rerun with --classifications <file> --write.`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
