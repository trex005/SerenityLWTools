# LWSerenity - Build & Deployment Guide

LWSerenity is a static single-page application built with Vite. There is no
server-side component: the built bundle plus the JSON configuration files under
`public/conf/` are all that is served.

## Local development

```
npm install       # first time only
npm run dev       # dev server at http://localhost:3000
```

## Production build

```
npm run build     # outputs static site to out/
npm run preview   # serve out/ locally for QA
```

A full build takes a few seconds. The output in `out/` is self-contained and can
be uploaded to any static web server or S3 bucket.

## Publishing content changes from the admin panel

Admins do not need to rebuild the app to change events, tips, or tag configs.
The **Publish** button (visible in command mode) uploads only changed JSON files
directly to S3:

1. Enter command mode and make your edits (stored as local overrides).
2. Click **Publish** in the top bar.
3. Provide an AWS access key with S3 write permissions, the region, bucket,
   and optional key prefix. Credentials are kept in admin-gated local storage
   when "Remember credentials" is checked; otherwise they live only for the
   session.
4. Review results: each file is reported as `updated`, `created`, or
   `no changes`.

### How publishing works

- Only the active tag's three delta files are considered:
  `conf/{tag}/conf.json`, `conf/{tag}/events.json`, `conf/{tag}/tips.json`.
- Each file is compared against the copy currently in S3 using canonical JSON
  (`updated` timestamps are ignored). Unchanged files are skipped entirely.
- Before a changed file is overwritten, the previous version is copied to
  `archive/<original path>/<name>.<ISO-datetime>.json`
  (e.g. `archive/conf/main/events.json.2026-08-23T18-22-05-123Z.json`).
  Archival happens before any overwrite so history is never lost.

### Required IAM policy

Attach a policy like this to the publish key (adjust the bucket ARN):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublishSerenityConf",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::YOUR-BUCKET/*"
    },
    {
      "Sid": "ListBucket",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::YOUR-BUCKET"
    }
  ]
}
```

CloudFront invalidation from the Command tab additionally requires
`cloudfront:CreateInvalidation` for the distribution.

### Required S3 CORS configuration

The browser performs `GET`, `PUT`, and copy-source `PUT` requests directly
against the bucket, so the bucket CORS config must allow the site origin:

```json
[
  {
    "AllowedOrigins": ["https://your-site-origin.example"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

For local testing use `http://localhost:3000` as the origin.

If the site is served from the same bucket that hosts `conf/`, no CORS is
needed for reads but PUT/COPY still require the CORS rule above.

## Serenity engine artifact (LWMinions compatibility)

All schedule math lives in `lib/serenity-engine/`, compiled by:

```
npm run build:engine    # produces artifacts/lw-serenity-engine.js (IIFE)
```

LWMinions embeds this exact byte stream at
`src/lwminions/assets/serenity/lw-serenity-engine.js`. After changing engine
source:

```
npm run build:engine
npm run check:engine -- --fix   # sync the artifact into LWMinions and commit both
```

`npm run check:engine` (without `--fix`) fails CI-style when the two copies
drift. Never let them diverge.

## Tests

```
npm run test:engine        # portable scheduling/report engine
npm run test:date-scoped   # date-scoped composition + local operations
npm run test:config        # config fetcher/composition
npm run test:storage       # scoped storage guards
npm run test:tz            # timezone helpers
npm run test:recurrence    # recurrence helpers
npm run typecheck          # tsc --noEmit
```

Run `npm run typecheck` and the relevant test suites before opening a PR.
