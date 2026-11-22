# Download Live Configs Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline and a fresh final code review. Checkboxes track the authorized implementation.

**Goal:** Download the complete live `s3://lwserenity.com/conf/` tree into `public/conf/` without uploads, implicit overwrites or local deletions.

**Architecture:** A Node CLI separates a read-only S3 adapter from a filesystem download core. Preview is the default; `--execute` stages every remote file before changing the destination, and differing existing files block execution unless `--overwrite` is explicit. Overwrites require verified recoverable backups and a recovery manifest outside the public tree.

**Tech Stack:** Node 20+, built-in filesystem/crypto/streams, existing AWS SDK v3, node:test through the existing tsx runner.

**Spec:** Owner's delegated download-only tool request, reflected in the authorized in-chat design. Default source is only `conf/`; this includes assets and any legacy directories within that tree, while excluding the separate bucket `archive/` history and site bundles.

## Global Constraints

- Default destination: repository-relative `public/conf/`; optional `--local-dir` override.
- Default preview; `--execute` enables writes; `--overwrite` requires execution and backs up differing files first.
- Never upload, normalize JSON timestamps, remove local-only files, or expose/persist credentials.
- Credentials: explicit existing profile, complete AWS environment pair, monorepo `secure.json`, then SDK chain; never switch after an AWS denial.
- Preserve the pre-existing `public/conf/season6/events.json` edit and all unrelated work.
- Do not execute a live download against the owner's configuration tree during implementation/testing.

## Review Focus

- Malicious/ambiguous S3 keys and Windows aliases must fail before reads or writes.
- Existing or introduced symlinks/junctions must never redirect writes outside the destination.
- Failed/truncated/changed downloads must not leave partial destination files.
- Local edits after planning must be detected before replacement; backups must remain usable on late filesystem failures.
- Auth errors must be sanitized and must not initiate fallback authentication.

### Task 1: Filesystem-safe download core

**Files:** `scripts/download-live-configs.mjs`, `scripts/download-live-configs.test.ts`.
**Interfaces:** `downloadConfigs({source,destination,backupRoot,execute,overwrite,log})` returns actions, local-only paths, conflicts, applied count and recovery directory. Source exposes async `list()` and `read(item)`; each item has key, size and ETag.

- [ ] Write failing fixture tests for preview, nested/binary/empty files, unchanged files, blocked conflicts, explicit backed-up overwrites and local-only preservation.
- [ ] Add failure tests for unsafe keys/collisions, symlink/junction paths, interrupted/truncated remote streams and changed local/remote snapshots.
- [ ] Run tests and observe missing-feature assertions.
- [ ] Implement staging, validation, content hashing, backups, optimistic local checks and atomic per-file installation.
- [ ] Run the full downloader tests green.

### Task 2: Read-only S3 adapter and CLI

**Interfaces:** `createS3Source({client,commands,bucket})` supports paginated ListObjectsV2 and conditional GetObject only. `parseArgs(argv)` and credential selection remain independently testable.

- [ ] Write failing tests for pagination, missing/repeated continuation tokens, GetObject IfMatch, CLI safety/defaults and credential source selection/redaction.
- [ ] Implement profile/environment/secure-file selection using existing SDK packages and no credential output.
- [ ] Add `download:configs` and `test:download-configs` commands.
- [ ] Verify help and isolated tests without a live download.

### Task 3: Document, integrate and review

**Files:** `DEPLOYMENT.md`, `AGENTS.md`, package commands and this plan.

- [ ] Document preview/additive/explicit-overwrite commands, backups, partial-apply recovery, source scope and required read-only AWS actions.
- [ ] Copy only reviewed feature files into the requested checkout with hashes guarding existing edited documents.
- [ ] Run typecheck and all existing test commands in isolated temp fixtures; report any baseline failures.
- [ ] Request a fresh code review, resolve material findings with regression tests and rerun required checks.
- [ ] Report deliverables and preserved owner edit; leave changes reviewable without committing unrelated work.
