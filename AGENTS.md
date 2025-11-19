# Repository Guidelines

## Project Structure & Module Organization

- `app/` holds Next.js routes, layouts, and entry points; keep route handlers slim and push logic into shared modules.
- `components/` stores feature components, with primitives in `components/ui/` built on Radix + Tailwind.
- `lib/` collects TypeScript helpers (`date-utils.ts`, `config-fetcher.ts`) and should remain framework-agnostic.
- Styling lives in `styles/` and `app/globals.css`; static assets go in `public/`.
- Configs live in `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, and `tsconfig.json`.
- `lib/scoped-storage.ts` gates persistence behind Command (admin) modeÃ¢â‚¬â€keep events/tips storage writes aligned with that guard.
- Tag configs under `public/conf/{tag}/` now only ship `config.json`, `events.json`, and `tips.json`; archived entries stay in `events.json` via `archived: true`.
- Event admin dialog consolidates "Include in" toggles (Scheduled, Website, Briefing, Previous Day, End of Day); keep Scheduled on to surface the event anywhere, and use Website to control the public briefing tab while Briefing/Reminder toggles gate their respective outputs.

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


