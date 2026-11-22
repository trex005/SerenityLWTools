# Download live configurations

Run from `D:\LW\LWSerenity` with the existing installed dependencies:

```powershell
npm run download:configs
npm run download:configs -- --execute
npm run download:configs -- --execute --overwrite
```

The first command previews the complete live `s3://lwserenity.com/conf/` tree against `public/conf`. It reads and hashes every remote object, including nested tag assets, and reports `new`, `unchanged`, or `conflict`. Preview creates no local files. The separate bucket `archive/` tree and website bundle are excluded; any legacy directory actually inside `conf/` is included.

`--execute` downloads new files and leaves identical files untouched. If any existing file differs, the entire execution is blocked. Review the preview and your local Git diff before explicitly adding `--overwrite`; this replaces all differing files in the selected destination. This is download-only: the tool never uploads, deletes remote objects, rewrites JSON timestamps, or deletes local-only files.

## Recovery and failure behavior

Every execution with changes creates a unique recovery directory under ignored `tmp/config-download-backups/`, outside the public assets. Existing files that will be replaced are copied byte-for-byte to `files/<relative path>`. `manifest.json` lists each planned action, original and downloaded SHA-256 values, and whether it was applied. The command prints the recovery path. To restore an individual replaced file, first inspect the manifest and current local edits, then copy that backup to the corresponding destination path. Keep the backup until you have reviewed the result; recovery is deliberately manual and never automatically deletes newly added files.

All remote downloads finish in isolated temporary staging before destination changes begin. Interrupted/truncated downloads or changed remote ETags abort without changing destination files. Existing local contents are checked before staging, after staging, during backup, and immediately before each installation. Symlinks/junctions, unsafe Windows paths, duplicate case-insensitive paths, and file/directory collisions are rejected.

Application uses individual file installations, so it is not an atomic transaction across the whole tree. A late local edit, disk error, or interruption can leave some files applied. Completed backups and the recovery manifest are retained; a handled failure records `partial` or `failed` and exits nonzero. A process kill can leave `preparing`/`applying` in the manifest; compare hashes and backups before recovering. Do not run overlapping download executions or edit the destination during application: optimistic content checks cannot eliminate the final filesystem race. Use a separate destination for comparisons while editing.

## Options and authentication

```powershell
npm run download:configs -- --help
npm run download:configs -- --local-dir tmp/live-conf --execute
npm run download:configs -- --profile existing-profile --dry-run
```

Relative `--local-dir` and `--backup-dir` values resolve from the repository, even when invoking the script elsewhere. Defaults are `public/conf` and `tmp/config-download-backups`. The backup root must be outside the destination. `--bucket` defaults to `lwserenity.com`; the remote prefix is always `conf/`. `--region` overrides the AWS region. `--dry-run` explicitly selects preview and cannot combine with `--execute`; `--overwrite` requires `--execute`. Unknown options, including deletion flags, are rejected.

Authentication follows the existing monorepo convention: an explicit `--profile` or `AWS_PROFILE` uses that existing profile; otherwise a complete `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` environment pair wins, then the `aws` block in the monorepo's existing `../secure.json`, then the standard AWS SDK chain. Session tokens belong to the selected source. Incomplete key pairs fail rather than mixing sources. Region selection is `--region`, `AWS_REGION`, `AWS_DEFAULT_REGION`, selected secure settings, then `us-east-1`. Credential values remain in process memory and are never logged or saved. A denied AWS request terminates the run without trying another credential source.

The only S3 operations are `ListObjectsV2` for `conf/` and `GetObject` with the listed ETag as `IfMatch`. Existing authentication must already permit `s3:ListBucket` for this prefix and `s3:GetObject` for its objects. The tag publisher policies intentionally do not grant the bucket listing or whole-tree reads needed by this tool. No IAM permissions are created or attached by the downloader. AWS errors report only the operation and safe error name, without raw messages or stacks.

## Tests

```powershell
npm run test:download-configs
npm run typecheck -- --incremental false
```

Tests use fake S3 responses and self-owned temporary directories. They do not load live credentials, read the bucket, or alter repository configurations.
