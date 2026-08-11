# Repository Guidelines

## Project Structure & Module Organization

- `app/` holds Next.js routes, layouts, and entry points; keep route handlers slim and push logic into shared modules.
- `components/` stores feature components, with primitives in `components/ui/` built on Radix + Tailwind.
- `lib/` collects TypeScript helpers (`date-utils.ts`, `config-fetcher.ts`) and should remain framework-agnostic.
- Styling lives in `styles/` and `app/globals.css`; static assets go in `public/`.
- Configs live in `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, and `tsconfig.json`.
- Branding (name/icon/background) comes from the `brand` block in `/public/conf/{tag}/conf.json`; use `useTagData.brand`/`brandLabel`, `BrandLogo`, and `BrandHead` instead of hardcoding strings. `brand.backgroundOpacity` controls the image opacity.
- Tag configs can set `storage.eventsSuffix` and `storage.tipsSuffix` to invalidate persisted admin overrides for events/tips.
- `lib/scoped-storage.ts` gates persistence behind Command (admin) modeÃ¢â‚¬â€keep events/tips storage writes aligned with that guard.
- Zustand stores must use the JSON-wrapped `scopedPersistStorage`; `scopedStateStorage` is the raw string adapter and cannot rehydrate `persist` state directly.
- Keep JSON-only and local-override config caches separate; ancestor localStorage deltas are deep-merged onto that ancestor's JSON layer before descendant composition.
- Override markers and reset baselines must include eligible ancestor localStorage; inherited changes must not be attributed to the current tag.
- Admin edits are stored as per-tag overrides: the `use-events`/`use-tips` stores compose fetched configs with stored overrides and deletion markers so parent updates continue to flow even when local drafts exist.
- Event and tip editors surface a tag dropdown whenever multiple admin-enabled tags exist; select the target tag to apply overrides without switching the main app context.
- Tip admin cards mirror the public tip layout; in add/edit flows the customId input sits under the title and auto-fills from a sanitized title (lowercase, hyphenated, alphanumeric only) when left blank.
- Tag configs under `public/conf/{tag}/` now only ship `config.json`, `events.json`, and `tips.json`; archived entries stay in `events.json` via `archived: true`.
- Event admin dialog consolidates "Include in" toggles (Scheduled, Website, Briefing, Previous Day, End of Day); keep Scheduled on to surface the event anywhere, and use Website to control the public briefing tab while Briefing/Reminder toggles gate their respective outputs.
- Event ordering uses the global float `order_value`; missing values behave as `0`, ties sort by title, and legacy per-day `order` data should not be written or exported.
- All scheduling logic, exports, and timestamps must run in the app timezone (GMT-2). Use the helpers in `lib/date-utils.ts` (`formatInAppTimezone`, `getStartOfAppDay`, `getEndOfAppDay`, `addAppDays`) for any date math or formatting; only the optional local-time display for event times should use the user's timezone.
- Recurrence uses only the tag-relative `type: "days" | "weeks"` shape with `startTag`/`startOffset`, `onPeriods`/`offPeriods`, and `daysOfWeek`; legacy fields like `startDate`, `interval`, `daily/weekly` types, `pattern`, `phaseStartDate`, or `event.days` fallbacks are no longer read.
- Portable schedule and report calculations belong in the DOM-free `lib/serenity-engine/` core. UI code must call that core rather than reimplement recurrence so the same compiled artifact can run inside LWMinions.
- Cross-application one-time and interval schedules use the canonical `lib/serenity-engine/schedule-v1.schema.json` shape and the engine's `schedule-next` operation. Keep schema, TypeScript resolver, JSON ABI, and cross-runtime fixtures aligned when schedule behavior changes.
- `pnpm build:engine` produces the trusted `artifacts/lw-serenity-engine.js` IIFE. Commit that artifact whenever engine source changes; LWMinions embeds the identical bytes and never executes JavaScript downloaded from the static host.
- Mail generator defaults to a three-day range (today + next two days) in app time; keep its initial date span aligned with the date range selector quick-pick defaults.

## Build, Test, and Development Commands

- `pnpm install` (preferred) or `npm install` installs dependencies; use one tool per change to keep lockfiles in sync.
- `pnpm dev` launches the local server at `http://localhost:3000`.
- `pnpm build` compiles production assets consumed by `deploy-static.js`.
- `pnpm start` serves the compiled build for QA.
- `pnpm lint` runs `next lint` and Tailwind rulesâ€”run it before opening a PR.

## Coding Style & Naming Conventions

- Default to TypeScript functions with React 19 hooks; avoid classes.
- Use 2-space indentation, kebab-case filenames (`day-agenda.tsx`), and PascalCase exports (`DayAgenda`).
- Compose UI with Tailwind + `clsx`/`cva`; keep variant logic within each component.
- Let ESLint or `pnpm lint --fix` handle formatting; skip manual tweaks.

## Testing Guidelines

- No automated tests yet; colocate new ones as `*.test.ts(x)` or mirrored `__tests__/` folders.
- Prefer React Testing Library for behavior and integration coverage in `app/`.
- When schedules use date spans, confirm the end day renders and the next day is empty.
- Every PR should describe manual verification steps and confirm `pnpm lint` passes.
- Document new test scripts inside `package.json` for discoverability.

## Commit & Pull Request Guidelines

- Mirror the existing concise subject lines (`Fix date bugs in UI and loading data from server`) and keep each commit focused.
- Add body context when touching deploy scripts or AWS policies.
- For every new feature or bug fix, update `AGENTS.md` within PR (or note why no change was needed) to keep this guide current.
- PRs must cover problem, solution, test evidence (`pnpm lint`, screenshots), and link issues or deploy notes.
- Request review before running deployment scripts and keep environment secrets in untracked `.env.local`.

## Deployment & Configuration Tips

- Read `DEPLOYMENT.md` and helper scripts (`deploy-static.js`, `build-static.js`) before releasing; they expect bundles in `out/`.
- Update S3/CloudFront JSON policies in-repo first, then apply them through the deployment pipeline.
- Document new env keys beside the code that needs them.
