#!/usr/bin/env node
import * as fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const inside = (parent, child) => { const rel = path.relative(parent, child); return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)) }
async function statMaybe(target) { try { return await fs.lstat(target) } catch (error) { if (error.code === 'ENOENT') return null; throw error } }
async function safePath(target, file = false) {
  const absolute = path.resolve(target), root = path.parse(absolute).root
  let current = root
  for (const part of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    const stat = await statMaybe(current)
    if (!stat) continue
    if (stat.isSymbolicLink()) throw new Error('Unsafe local symlink or junction')
    if (current === absolute && file) { if (!stat.isFile()) throw new Error('Destination must be a regular file, not a directory') }
    else if (!stat.isDirectory()) throw new Error('Local path contains a non-directory')
  }
}
async function snapshot(target) {
  await safePath(target, true)
  const stat = await statMaybe(target)
  return stat ? digest(await fs.readFile(target)) : null
}
function keyPath(item) {
  if (typeof item.key !== 'string' || !item.key.startsWith('conf/')) throw new Error('Remote key is outside conf/ or invalid')
  if (item.key === 'conf/' && item.size === 0) return null
  let relative = item.key.slice(5)
  const folder = relative.endsWith('/')
  if (folder) relative = relative.slice(0, -1)
  if (!relative && folder && item.size === 0) return null
  if (!relative || /[\\:\x00-\x1f<>"|?*]/.test(relative)) throw new Error('Unsafe remote key')
  for (const part of relative.split('/')) {
    if (!part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part)) throw new Error('Unsafe remote key')
  }
  if (!Number.isSafeInteger(item.size) || item.size < 0) throw new Error('Invalid remote size')
  if (folder) { if (item.size !== 0) throw new Error('Invalid folder marker'); return null }
  return relative
}
async function localFiles(root) {
  const files = []
  if (!(await statMaybe(root))) return files
  async function walk(dir, prefix = '') {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const relative = prefix + entry.name
      if (entry.isDirectory() && !entry.isSymbolicLink()) await walk(path.join(dir, entry.name), relative + '/')
      else files.push(relative)
    }
  }
  await walk(root)
  return files.sort()
}
async function consume(response, item, target) {
  if (response.etag !== item.etag) throw new Error('Remote ETag changed during download')
  if (response.size !== item.size) throw new Error('Remote size changed during download')
  const hash = createHash('sha256'); let count = 0
  const handle = target ? await fs.open(target, 'wx') : null
  try {
    if (!response.body || !response.body[Symbol.asyncIterator]) throw new Error('Download failed: missing body')
    for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk); count += bytes.length; hash.update(bytes)
      if (handle) await handle.writeFile(bytes)
    }
    if (count !== item.size) throw new Error('Download failed: truncated body size')
    return hash.digest('hex')
  } catch (error) {
    if (/ETag|size|truncated|missing body/.test(error.message)) throw error
    throw new Error('Download failed: interrupted body')
  } finally { await handle?.close() }
}

/** Preserve the previous valid recovery record when writing or replacing fails. */
export async function writeRecoveryManifest(target, manifest, io = fs) {
  const temporary = path.join(path.dirname(target), `.manifest-${randomUUID()}.tmp`)
  let handle
  try {
    handle = await io.open(temporary, 'wx')
    await handle.writeFile(JSON.stringify(manifest, null, 2) + '\n')
    await handle.sync(); await handle.close(); handle = undefined
    await io.rename(temporary, target)
  } finally {
    await handle?.close()
    await io.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error })
  }
}

/** Download-only synchronization. Remote reads finish before any destination writes. */
export async function downloadConfigs({ source, destination, backupRoot, execute = false, overwrite = false, log = async () => {} }) {
  if (overwrite && !execute) throw new Error('Overwrite requires execute')
  destination = path.resolve(destination); backupRoot = path.resolve(backupRoot)
  if (destination === path.parse(destination).root) throw new Error('Unsafe destination root')
  if (inside(destination, backupRoot)) throw new Error('Backup directory must be outside the destination')
  await safePath(destination); await safePath(backupRoot)
  const items = [], names = new Set()
  for await (const item of source.list()) {
    const relativePath = keyPath(item)
    if (relativePath === null) continue
    const canonical = relativePath.normalize('NFC').toLowerCase()
    if (names.has(canonical)) throw new Error('Remote path collision')
    names.add(canonical); items.push({ ...item, relativePath, canonical })
  }
  for (const name of names) {
    const parts = name.split('/')
    for (let i = 1; i < parts.length; i++) if (names.has(parts.slice(0, i).join('/'))) throw new Error('Remote file-directory collision')
  }
  items.sort((a, b) => a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0)
  for (const item of items) {
    item.target = path.join(destination, ...item.relativePath.split('/'))
    item.before = await snapshot(item.target)
  }
  const localOnly = (await localFiles(destination)).filter(relative => !names.has(relative.normalize('NFC').toLowerCase()))
  let staging, recoveryDir, manifest
  const result = { mode: execute ? 'execute' : 'preview', actions: [], localOnly, applied: 0 }
  try {
    if (execute) staging = await fs.mkdtemp(path.join(os.tmpdir(), 'lwserenity-download-stage-'))
    for (let i = 0; i < items.length; i++) {
      const item = items[i]; item.staged = staging ? path.join(staging, String(i)) : undefined
      let response
      try { response = await source.read(item) } catch (error) { throw new Error(`Download failed: ${error.safeMessage || 'remote read failed'}`) }
      item.remoteHash = await consume(response, item, item.staged)
      item.status = item.before === item.remoteHash ? 'unchanged' : item.before === null ? 'new' : overwrite ? 'replace' : 'conflict'
      result.actions.push({ relativePath: item.relativePath, status: item.status, beforeHash: item.before, remoteHash: item.remoteHash, applied: false })
    }
    for (const item of items) if (await snapshot(item.target) !== item.before) throw new Error('File changed locally during download')
    if (!execute) return result
    if (items.some(item => item.status === 'conflict')) return { ...result, blocked: true }
    const changed = items.filter(item => item.status !== 'unchanged')
    if (!changed.length) return result
    await safePath(backupRoot); await fs.mkdir(backupRoot, { recursive: true })
    recoveryDir = await fs.mkdtemp(path.join(backupRoot, new Date().toISOString().replace(/[:.]/g, '-') + '-'))
    result.recoveryDir = recoveryDir
    manifest = { schemaVersion: 1, createdAt: new Date().toISOString(), destination, status: 'preparing', actions: result.actions }
    const saveManifest = () => writeRecoveryManifest(path.join(recoveryDir, 'manifest.json'), manifest)
    await saveManifest()
    for (const item of changed) if (item.before !== null) {
      const backup = path.join(recoveryDir, 'files', ...item.relativePath.split('/'))
      await fs.mkdir(path.dirname(backup), { recursive: true })
      await fs.copyFile(item.target, backup, 1)
      if (digest(await fs.readFile(backup)) !== item.before) throw new Error('File changed locally while backing up')
    }
    manifest.status = 'applying'; await saveManifest()
    for (const item of changed) {
      if (await snapshot(item.target) !== item.before) throw new Error('File changed locally before application')
      await safePath(path.dirname(item.target)); await fs.mkdir(path.dirname(item.target), { recursive: true })
      const adjacent = path.join(path.dirname(item.target), `.download-${randomUUID()}.tmp`)
      try {
        await fs.copyFile(item.staged, adjacent, 1)
        if (digest(await fs.readFile(adjacent)) !== item.remoteHash) throw new Error('Staged file integrity mismatch')
        if (await snapshot(item.target) !== item.before) throw new Error('File changed locally before application')
        if (item.before === null) await fs.link(adjacent, item.target)
        else await fs.rename(adjacent, item.target)
        result.actions.find(action => action.relativePath === item.relativePath).applied = true
        result.applied++; await saveManifest()
        await log({ phase: 'applied', relativePath: item.relativePath })
      } finally { await fs.unlink(adjacent).catch(error => { if (error.code !== 'ENOENT') throw error }) }
    }
    manifest.status = 'complete'; await saveManifest()
    return result
  } catch (error) {
    if (manifest) {
      manifest.status = result.applied ? 'partial' : 'failed'
      await writeRecoveryManifest(path.join(recoveryDir, 'manifest.json'), manifest).catch(() => {})
      error.recoveryDir = recoveryDir; error.applied = result.applied
    }
    throw error
  } finally {
    if (staging && path.dirname(staging) === path.resolve(os.tmpdir()) && path.basename(staging).startsWith('lwserenity-download-stage-')) await fs.rm(staging, { recursive: true, force: true })
  }
}

function awsFailure(error, action) {
  const name = /^[A-Za-z0-9]+$/.test(error?.name || '') ? error.name : 'AwsError'
  const result = new Error(`${action} failed (${name})`); result.safeMessage = result.message; return result
}
export function createS3Source({ client, commands, bucket }) {
  const { ListObjectsV2Command, GetObjectCommand } = commands
  return {
    async *list() {
      let token; const seen = new Set()
      do {
        let page
        try { page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'conf/', ...(token ? { ContinuationToken: token } : {}) })) }
        catch (error) { throw awsFailure(error, 's3:ListBucket') }
        for (const item of page.Contents || []) yield { key: item.Key, size: item.Size, etag: item.ETag }
        if (!page.IsTruncated) break
        token = page.NextContinuationToken
        if (!token || seen.has(token)) throw new Error('Invalid S3 continuation token')
        seen.add(token)
      } while (true)
    },
    async read(item) {
      let response
      try { response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: item.key, IfMatch: item.etag })) }
      catch (error) { throw awsFailure(error, 's3:GetObject') }
      return { body: response.Body, size: response.ContentLength, etag: response.ETag }
    },
  }
}
export function parseArgs(args) {
  const result = { execute: false, overwrite: false }; let dryRun = false
  const values = { '--local-dir': 'localDir', '--backup-dir': 'backupDir', '--bucket': 'bucket', '--region': 'region', '--profile': 'profile' }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--execute') result.execute = true
    else if (arg === '--overwrite') result.overwrite = true
    else if (arg === '--dry-run') dryRun = true
    else if (arg === '--help' || arg === '-h') result.help = true
    else if (values[arg]) { const value = args[++i]; if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`); result[values[arg]] = value }
    else throw new Error(`Unknown option: ${arg}`)
  }
  if (dryRun && result.execute) throw new Error('Cannot combine --dry-run and --execute')
  if (result.overwrite && !result.execute) throw new Error('--overwrite requires --execute')
  return result
}
export function selectAwsSettings({ env = {}, secureAws = {}, profile, region }) {
  const selectedProfile = profile || env.AWS_PROFILE
  const selectedRegion = region || env.AWS_REGION || env.AWS_DEFAULT_REGION || secureAws.region || 'us-east-1'
  if (selectedProfile) return { source: 'profile', profile: selectedProfile, region: selectedRegion }
  const pair = (id, secret, token) => ({ accessKeyId: id, secretAccessKey: secret, ...(token ? { sessionToken: token } : {}) })
  if (env.AWS_ACCESS_KEY_ID || env.AWS_SECRET_ACCESS_KEY) {
    if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) throw new Error('Incomplete AWS environment credential pair')
    return { source: 'environment', region: selectedRegion, credentials: pair(env.AWS_ACCESS_KEY_ID, env.AWS_SECRET_ACCESS_KEY, env.AWS_SESSION_TOKEN) }
  }
  if (secureAws.accessKeyId || secureAws.secretAccessKey) {
    if (!secureAws.accessKeyId || !secureAws.secretAccessKey) throw new Error('Incomplete secure.json AWS credential pair')
    return { source: 'secure.json', region: selectedRegion, credentials: pair(secureAws.accessKeyId, secureAws.secretAccessKey, secureAws.sessionToken) }
  }
  return { source: 'sdk-chain', region: selectedRegion }
}

const help = `Download live S3 conf/ into this repository (preview by default).
  npm run download:configs -- [--dry-run | --execute] [--overwrite]
  --local-dir PATH   Destination (default: public/conf, relative to repository)
  --backup-dir PATH  Recovery root (default: tmp/config-download-backups)
  --bucket NAME     Source bucket (default: lwserenity.com)
  --region REGION   AWS region override
  --profile NAME    Existing AWS profile; no fallback after a failed request
  --help            Show help without loading credentials or contacting AWS
Only ListObjectsV2 and GetObject are used. Local-only files are preserved.
Existing differing files block execution unless --execute --overwrite is used.
`
async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) { console.log(help); return }
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  let secureAws = {}
  if (!args.profile && !process.env.AWS_PROFILE && !process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_SECRET_ACCESS_KEY) {
    try { secureAws = JSON.parse(await fs.readFile(path.join(repo, '..', 'secure.json'), 'utf8')).aws || {} }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Unable to read AWS settings from secure.json') }
  }
  const settings = selectAwsSettings({ env: process.env, secureAws, profile: args.profile, region: args.region })
  const commands = await import('@aws-sdk/client-s3')
  const credentials = settings.source === 'profile' ? (await import('@aws-sdk/credential-provider-ini')).fromIni({ profile: settings.profile }) : settings.credentials
  const client = new commands.S3Client({ region: settings.region, ...(credentials ? { credentials } : {}) })
  try {
    console.log(`Mode: ${args.execute ? 'execute' : 'preview'}; source: s3://${args.bucket || 'lwserenity.com'}/conf/; authentication: ${settings.source}`)
    const result = await downloadConfigs({ source: createS3Source({ client, commands, bucket: args.bucket || 'lwserenity.com' }), destination: path.resolve(repo, args.localDir || 'public/conf'), backupRoot: path.resolve(repo, args.backupDir || 'tmp/config-download-backups'), execute: args.execute, overwrite: args.overwrite })
    for (const action of result.actions) console.log(`${action.status.padEnd(9)} ${action.relativePath}`)
    for (const relative of result.localOnly) console.log(`local-only ${relative}`)
    console.log(`Applied ${result.applied} file(s).${result.recoveryDir ? ` Recovery: ${result.recoveryDir}` : ''}`)
    if (result.blocked) { console.error('Execution blocked by differing files. Review them before using --execute --overwrite.'); process.exitCode = 2 }
  } finally { client.destroy() }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Never expose AWS messages, stacks, credential-provider errors, or file contents.
    const known = /^(Unknown option|Missing value|Cannot combine|--overwrite|Incomplete |Unable to read AWS|s3:|Download failed|Unsafe |Remote |Invalid |Backup |Destination |Local path|File changed|Staged file)/.test(error.message)
    console.error(known ? error.message : `Download failed (${typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'operation failed'})`)
    if (error.recoveryDir) console.error(`Applied ${error.applied || 0} file(s) before failure. Recovery: ${error.recoveryDir}`)
    process.exitCode = 1
  })
}
