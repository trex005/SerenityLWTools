import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { Readable } from 'node:stream'
import { createHash } from 'node:crypto'

const load = async (): Promise<any> => {
  try { return await import('./download-live-configs.mjs') }
  catch (error: any) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') assert.fail('Download-only implementation is not present yet')
    throw error
  }
}
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const fake = (values: Record<string, string | Uint8Array>) => {
  const entries = Object.entries(values).map(([key, value]) => {
    const bytes = typeof value === 'string' ? Buffer.from(value) : Buffer.from(value)
    return { key, bytes, etag: sha(bytes), size: bytes.length }
  })
  return {
    async *list() { for (const entry of entries) yield entry },
    async read(item: any) { return { body: Readable.from([item.bytes]), etag: item.etag, size: item.size } },
  }
}
async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lwserenity-download-test-'))
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
    assert.ok(path.basename(root).startsWith('lwserenity-download-test-'))
    await fs.rm(root, { recursive: true, force: true })
  })
  const destination = path.join(root, 'conf')
  const backupRoot = path.join(root, 'backups')
  const put = async (relative: string, bytes: string | Uint8Array) => {
    const target = path.join(destination, relative)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, bytes)
  }
  return { root, destination, backupRoot, put }
}

test('default preview compares full bytes and changes no destination or backup files', async t => {
  const { downloadConfigs } = await load(); const f = await fixture(t)
  await f.put('tag/conf.json', '{"updated":"local"}')
  await f.put('same.json', 'same')
  const result = await downloadConfigs({ ...f, source: fake({ 'conf/tag/conf.json': '{"updated":"remote"}', 'conf/same.json': 'same', 'conf/tag/logo.svg': '<svg/>' }) })
  assert.equal(result.mode, 'preview')
  assert.deepEqual(result.actions.map((a: any) => [a.relativePath, a.status]), [['same.json', 'unchanged'], ['tag/conf.json', 'conflict'], ['tag/logo.svg', 'new']])
  assert.equal(await fs.readFile(path.join(f.destination, 'tag/conf.json'), 'utf8'), '{"updated":"local"}')
  await assert.rejects(fs.stat(path.join(f.destination, 'tag/logo.svg')), { code: 'ENOENT' })
  await assert.rejects(fs.stat(f.backupRoot), { code: 'ENOENT' })
})

test('execution downloads nested binary and empty assets without changing their bytes', async t => {
  const { downloadConfigs } = await load(); const f = await fixture(t)
  const png = Buffer.from([0, 255, 13, 10, 99])
  const result = await downloadConfigs({ ...f, execute: true, source: fake({ 'conf/default.json': '{"updated":"keep-me"}', 'conf/tag/deep/image.png': png, 'conf/tag/empty.txt': '', 'conf/tag/': '' }) })
  assert.equal(result.applied, 3)
  assert.deepEqual(await fs.readFile(path.join(f.destination, 'tag/deep/image.png')), png)
  assert.equal(await fs.readFile(path.join(f.destination, 'default.json'), 'utf8'), '{"updated":"keep-me"}')
  assert.equal((await fs.stat(path.join(f.destination, 'tag/empty.txt'))).size, 0)
})

test('unchanged files retain their mtime and local-only files are preserved', async t => {
  const { downloadConfigs } = await load(); const f = await fixture(t)
  await f.put('same.json', 'same'); await f.put('local-only/note.txt', 'mine')
  const original = await fs.stat(path.join(f.destination, 'same.json'))
  const result = await downloadConfigs({ ...f, execute: true, source: fake({ 'conf/same.json': 'same' }) })
  assert.equal(result.applied, 0)
  assert.equal((await fs.stat(path.join(f.destination, 'same.json'))).mtimeMs, original.mtimeMs)
  assert.deepEqual(result.localOnly, ['local-only/note.txt'])
  assert.equal(await fs.readFile(path.join(f.destination, 'local-only/note.txt'), 'utf8'), 'mine')
  await assert.rejects(fs.stat(f.backupRoot), { code: 'ENOENT' })
})

test('standard empty S3 conf root folder marker is skipped', async t => {
  const { downloadConfigs } = await load(); const f = await fixture(t)
  const result = await downloadConfigs({ ...f, execute: true, source: fake({ 'conf/': '', 'conf/tag/file.json': 'keep' }) })
  assert.equal(result.applied, 1)
  assert.equal(await fs.readFile(path.join(f.destination, 'tag/file.json'), 'utf8'), 'keep')
})

test('differing existing files block the entire execution without explicit overwrite', async t => {
  const { downloadConfigs } = await load(); const f = await fixture(t)
  await f.put('tag/conf.json', 'local edit')
  const result = await downloadConfigs({ ...f, execute: true, source: fake({ 'conf/tag/conf.json': 'remote', 'conf/new.json': 'new' }) })
  assert.equal(result.blocked, true); assert.equal(result.applied, 0)
  assert.equal(await fs.readFile(path.join(f.destination, 'tag/conf.json'), 'utf8'), 'local edit')
  await assert.rejects(fs.stat(path.join(f.destination, 'new.json')), { code: 'ENOENT' })
  await assert.rejects(fs.stat(f.backupRoot), { code: 'ENOENT' })
})

test('explicit overwrite backs up original bytes and records recoverable applied paths', async t => {
  const { downloadConfigs } = await load(); const f = await fixture(t)
  await f.put('tag/conf.json', 'local edit'); await f.put('keep.txt', 'mine')
  const result = await downloadConfigs({ ...f, execute: true, overwrite: true, source: fake({ 'conf/tag/conf.json': 'remote', 'conf/new.json': 'new' }) })
  assert.equal(result.applied, 2)
  assert.equal(await fs.readFile(path.join(f.destination, 'tag/conf.json'), 'utf8'), 'remote')
  assert.equal(await fs.readFile(path.join(result.recoveryDir, 'files/tag/conf.json'), 'utf8'), 'local edit')
  assert.equal(await fs.readFile(path.join(f.destination, 'keep.txt'), 'utf8'), 'mine')
  const manifest = JSON.parse(await fs.readFile(path.join(result.recoveryDir, 'manifest.json'), 'utf8'))
  assert.equal(manifest.status, 'complete')
  assert.equal(manifest.actions.filter((a: any) => a.applied).length, 2)
})

for (const key of ['conf/../escape.json', 'conf/tag/../../escape', 'conf/tag\\escape', 'conf/C:/escape', 'conf//empty', 'conf/./dot', 'conf/tag/file:stream', 'conf/NUL.json', 'conf/tag/trailing.', 'conf/tag/trailing ', 'archive/conf/tag/conf.json']) {
  test(`rejects unsafe key before reading remote data: ${key}`, async t => {
    const { downloadConfigs } = await load(); const f = await fixture(t)
    const source = fake({ 'conf/okay.json': 'okay', [key]: 'bad' }); let reads = 0
    source.read = async () => { reads++; throw new Error('should not read') }
    await assert.rejects(downloadConfigs({ ...f, execute: true, overwrite: true, source }), /unsafe|outside|invalid/i)
    assert.equal(reads, 0)
    await assert.rejects(fs.stat(f.destination), { code: 'ENOENT' })
  })
}

const collisionCases: Record<string, string>[] = [{ 'conf/Foo.json': 'a', 'conf/foo.json': 'b' }, { 'conf/tag': 'a', 'conf/tag/conf.json': 'b' }]
for (const entries of collisionCases) {
  test('rejects case and file-directory collisions before any local changes', async t => {
    const { downloadConfigs } = await load(); const f = await fixture(t)
    await assert.rejects(downloadConfigs({ ...f, execute: true, source: fake(entries) }), /collision/i)
    await assert.rejects(fs.stat(f.destination), { code: 'ENOENT' })
  })
}

test('does not write through a local symlink or Windows junction', async t => {
  const { downloadConfigs } = await load(); const f = await fixture(t)
  const outside = path.join(f.root, 'outside')
  await fs.mkdir(outside); await fs.mkdir(f.destination)
  await fs.symlink(outside, path.join(f.destination, 'tag'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(downloadConfigs({ ...f, execute: true, overwrite: true, source: fake({ 'conf/tag/conf.json': 'remote' }) }), /symlink|junction/i)
  await assert.rejects(fs.stat(path.join(outside, 'conf.json')), { code: 'ENOENT' })
})

test('does not replace a directory with a remote file', async t => {
  const { downloadConfigs } = await load(); const f = await fixture(t)
  await fs.mkdir(path.join(f.destination, 'tag/conf.json'), { recursive: true })
  await assert.rejects(downloadConfigs({ ...f, execute: true, overwrite: true, source: fake({ 'conf/tag/conf.json': 'remote' }) }), /regular file|directory/i)
  assert.equal((await fs.stat(path.join(f.destination, 'tag/conf.json'))).isDirectory(), true)
})

test('failed or interrupted downloads leave no partial destination changes', async t => {
  const { downloadConfigs } = await load(); const f = await fixture(t)
  await f.put('a.json', 'local edit')
  const source = fake({ 'conf/a.json': 'remote a', 'conf/b.json': 'remote b' })
  const read = source.read
  source.read = async (item: any) => item.key === 'conf/b.json' ? { body: Readable.from((async function* () { yield Buffer.from('partial'); throw new Error('interrupted') })()), etag: item.etag, size: item.size } : read(item)
  await assert.rejects(downloadConfigs({ ...f, execute: true, overwrite: true, source }), /download failed/i)
  assert.equal(await fs.readFile(path.join(f.destination, 'a.json'), 'utf8'), 'local edit')
  await assert.rejects(fs.stat(path.join(f.destination, 'b.json')), { code: 'ENOENT' })
  await assert.rejects(fs.stat(f.backupRoot), { code: 'ENOENT' })
})

test('truncated remote bodies are rejected before installation', async t => {
  const { downloadConfigs } = await load(); const f = await fixture(t)
  const source = fake({ 'conf/a.json': 'complete' })
  source.read = async (item: any) => ({ body: Readable.from(['short']), etag: item.etag, size: item.size })
  await assert.rejects(downloadConfigs({ ...f, execute: true, source }), /size|length|truncated/i)
  await assert.rejects(fs.stat(f.destination), { code: 'ENOENT' })
})

test('remote ETag drift is rejected before installation', async t => {
  const { downloadConfigs } = await load(); const f = await fixture(t)
  const source = fake({ 'conf/a.json': 'complete' })
  source.read = async (item: any) => ({ body: Readable.from([item.bytes]), etag: 'different', size: item.size })
  await assert.rejects(downloadConfigs({ ...f, execute: true, source }), /changed|etag/i)
  await assert.rejects(fs.stat(f.destination), { code: 'ENOENT' })
})

test('concurrent local edits during staging block writes and preserve the newer edit', async t => {
  const { downloadConfigs } = await load(); const f = await fixture(t)
  await f.put('a.json', 'before')
  const source = fake({ 'conf/a.json': 'remote', 'conf/b.json': 'new' }); const read = source.read
  source.read = async (item: any) => { await f.put('a.json', 'new editor change'); return read(item) }
  await assert.rejects(downloadConfigs({ ...f, execute: true, overwrite: true, source }), /changed locally/i)
  assert.equal(await fs.readFile(path.join(f.destination, 'a.json'), 'utf8'), 'new editor change')
  await assert.rejects(fs.stat(path.join(f.destination, 'b.json')), { code: 'ENOENT' })
})

test('late apply conflict retains backups and reports the partial application manifest', async t => {
  const { downloadConfigs } = await load(); const f = await fixture(t)
  await f.put('a.json', 'original')
  const log = async (event: any) => { if (event.phase === 'applied' && event.relativePath === 'a.json') await f.put('b.json', 'concurrent new file') }
  await assert.rejects(downloadConfigs({ ...f, execute: true, overwrite: true, log, source: fake({ 'conf/a.json': 'remote a', 'conf/b.json': 'remote b' }) }), /changed locally|partial/i)
  assert.equal(await fs.readFile(path.join(f.destination, 'a.json'), 'utf8'), 'remote a')
  assert.equal(await fs.readFile(path.join(f.destination, 'b.json'), 'utf8'), 'concurrent new file')
  const runDir = path.join(f.backupRoot, (await fs.readdir(f.backupRoot))[0])
  assert.equal(await fs.readFile(path.join(runDir, 'files/a.json'), 'utf8'), 'original')
  const manifest = JSON.parse(await fs.readFile(path.join(runDir, 'manifest.json'), 'utf8'))
  assert.equal(manifest.status, 'partial')
  assert.deepEqual(manifest.actions.filter((a: any) => a.applied).map((a: any) => a.relativePath), ['a.json'])
})

test('backup directories inside the destination are rejected', async t => {
  const { downloadConfigs } = await load(); const f = await fixture(t)
  await assert.rejects(downloadConfigs({ ...f, backupRoot: path.join(f.destination, 'backups'), source: fake({}) }), /backup.*destination/i)
})

test('an interrupted recovery-manifest update preserves its previous valid record', async t => {
  const { writeRecoveryManifest } = await load(); const f = await fixture(t)
  assert.equal(typeof writeRecoveryManifest, 'function')
  const target = path.join(f.root, 'manifest.json')
  await fs.writeFile(target, JSON.stringify({ status: 'applying', actions: [] }))
  const failingIo = { ...fs, async open(file: string, flags: string) {
    const handle = await fs.open(file, flags)
    return { async writeFile(bytes: string) { await handle.writeFile(bytes.slice(0, 8)); throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }) }, sync: () => handle.sync(), close: () => handle.close() }
  } }
  await assert.rejects(writeRecoveryManifest(target, { status: 'complete', actions: [] }, failingIo), /disk full/)
  assert.deepEqual(JSON.parse(await fs.readFile(target, 'utf8')), { status: 'applying', actions: [] })
  assert.deepEqual((await fs.readdir(f.root)).filter(name => name.includes('.tmp')), [])
})

test('S3 adapter paginates and uses only list/get with snapshot IfMatch', async t => {
  const { createS3Source, downloadConfigs } = await load(); const f = await fixture(t)
  class ListObjectsV2Command { constructor(public input: any) {} }
  class GetObjectCommand { constructor(public input: any) {} }
  const requests: any[] = []
  const client = { async send(command: any) {
    requests.push(command.input)
    if (command instanceof ListObjectsV2Command) return command.input.ContinuationToken ? { Contents: [{ Key: 'conf/nested/b.svg', Size: 1, ETag: 'b' }], IsTruncated: false } : { Contents: [{ Key: 'conf/a.json', Size: 1, ETag: 'a' }], IsTruncated: true, NextContinuationToken: 'page2' }
    assert.ok(command instanceof GetObjectCommand, 'no upload/delete commands')
    return { Body: Readable.from([command.input.Key.endsWith('a.json') ? 'a' : 'b']), ContentLength: 1, ETag: command.input.IfMatch }
  } }
  const source = createS3Source({ client, commands: { ListObjectsV2Command, GetObjectCommand }, bucket: 'example' })
  const result = await downloadConfigs({ ...f, execute: true, source })
  assert.equal(result.applied, 2)
  assert.equal(await fs.readFile(path.join(f.destination, 'nested/b.svg'), 'utf8'), 'b')
  assert.equal(requests[0].Prefix, 'conf/'); assert.equal(requests[1].ContinuationToken, 'page2')
  assert.deepEqual(requests.slice(2).map(r => r.IfMatch), ['a', 'b'])
})

test('invalid pagination and AWS errors are sanitized', async () => {
  const { createS3Source } = await load()
  class Command { constructor(public input: any) {} }
  const source = createS3Source({ client: { async send() { return { IsTruncated: true } } }, commands: { ListObjectsV2Command: Command, GetObjectCommand: Command }, bucket: 'example' })
  await assert.rejects(async () => { for await (const _ of source.list()) {} }, /continuation/i)
  const failed = createS3Source({ client: { async send() { throw Object.assign(new Error('SECRET-MUST-NOT-PRINT'), { name: 'AccessDenied' }) } }, commands: { ListObjectsV2Command: Command, GetObjectCommand: Command }, bucket: 'example' })
  await assert.rejects(async () => { for await (const _ of failed.list()) {} }, error => { assert.match(String(error), /s3:ListBucket.*AccessDenied/); assert.doesNotMatch(String(error), /SECRET-MUST-NOT-PRINT/); return true })
})

test('CLI defaults to preview and rejects accidental overwrite/delete flags', async () => {
  const { parseArgs } = await load()
  assert.equal(parseArgs([]).execute, false)
  assert.equal(parseArgs(['--execute']).overwrite, false)
  assert.equal(parseArgs(['--execute', '--overwrite']).overwrite, true)
  assert.throws(() => parseArgs(['--overwrite']), /requires.*execute/i)
  assert.throws(() => parseArgs(['--delete']), /unknown/i)
  assert.throws(() => parseArgs(['--execute', '--dry-run']), /exclusive|combine/i)
  assert.throws(() => parseArgs(['--local-dir']), /value/i)
})

test('credential selection never mixes sources or falls back from an explicit profile', async () => {
  const { selectAwsSettings } = await load()
  const secureAws = { accessKeyId: 'secure-test-id', secretAccessKey: 'secure-test-secret', sessionToken: 'secure-test-token', region: 'us-east-1' }
  const env = { AWS_ACCESS_KEY_ID: 'env-test-id', AWS_SECRET_ACCESS_KEY: 'env-test-secret', AWS_SESSION_TOKEN: 'env-test-token' }
  assert.equal(selectAwsSettings({ env, secureAws }).source, 'environment')
  assert.equal(selectAwsSettings({ env: {}, secureAws }).source, 'secure.json')
  assert.equal(selectAwsSettings({ env, secureAws, profile: 'chosen' }).source, 'profile')
  assert.equal(selectAwsSettings({ env: {}, secureAws: {} }).source, 'sdk-chain')
  assert.throws(() => selectAwsSettings({ env: { AWS_ACCESS_KEY_ID: 'partial-secret' }, secureAws }), error => { assert.doesNotMatch(String(error), /partial-secret/); return true })
})
