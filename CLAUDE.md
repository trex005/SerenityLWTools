# LWSerenity — Alliance Events & Tips Web App

Next.js web application for scheduling and communicating events and tips to alliance members. Supports multiple alliance "tags" with per-tag branding and content overrides.

See [AGENTS.md](AGENTS.md) for the full developer reference (project structure, commands, coding style, deployment).

## Quick Reference

```bash
pnpm install      # Install dependencies
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm lint         # Run linter (run before every PR)
pnpm test:tz      # Run timezone utility tests
```

## Key Concepts

**Tags**: Each alliance tag is a separate branded instance. Brand config lives in `public/conf/{tag}/conf.json`. Admin storage allows per-tag overrides for events and tips.

**Timezone**: All scheduling uses GMT-2 (app timezone). Always use helpers from `lib/date-utils.ts` (`formatInAppTimezone`, `getStartOfAppDay`, etc.) — never raw `Date` methods for display or comparison.

**Recurrence Shape**: `{ type: "days" | "weeks", onPeriods, offPeriods, daysOfWeek, startDate }` — legacy fields no longer read.

**Branding**: Use `BrandLogo` and `BrandHead` components rather than hardcoding brand assets. Never hardcode tag names.

**Archived entries**: Keep archived events/tips in storage with `archived: true` — do not delete them.

## Deployment

Deployed to AWS S3 + CloudFront. See [DEPLOYMENT.md](DEPLOYMENT.md) for full deploy steps. Key scripts: `build-static.js`, `deploy-static.js`. Secrets go in `.env.local` only.
