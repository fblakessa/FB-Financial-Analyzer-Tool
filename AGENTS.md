# SSA Pro Module Template

A runnable SSA Pro shell for building one module at a time. No business logic ships here; you add it.

## Stack — do not substitute

- Language: TypeScript, end to end.
- UI: Next.js 15 (App Router) + React 19.
- API: Next.js route handlers under `apps/shell/src/app/api`. There is no tRPC.
- Styling: Tailwind CSS 3.
- Storage: Prisma 6 + SQLite.
- Monorepo: Turborepo with npm workspaces. Package manager is npm.

Do not introduce other frameworks, UI kits, ORMs, CSS approaches, or state libraries. If a task seems to need a new dependency, stop and ask. Do not install it. Python belongs only in `/scripts` for data or analysis work, never in app logic. This is a single service. Do not add extra servers.

## Architecture map

- `apps/shell/` — the Next.js app. Dev server runs on http://localhost:3000.
- `apps/shell/src/app/` — routes. `(app)/` group is the authenticated shell; `api/` holds route handlers.
- `apps/shell/src/apps/<module>/` — in-shell modules. You add modules here. The shipped example is `sample-tracker/`.
- `apps/shell/prisma/seed.ts` — the seed script.
- `packages/ui/` — shell chrome (sidebar, header, nav, project switcher, gates). Vendored platform code.
- `packages/project-context/` — shared types, demo users, and the project/module registry data.
- `packages/db/` — Prisma client (`@ssa/db`), `schema.prisma`, and migrations.
- `packages/server/` — server-side access helpers (`@ssa/server`): `requireProjectAccess`, `requireCurrentUser`.
- `scripts/` — `run.sh`, `test.sh`, `reset.sh` (plus `.ps1` Windows equivalents).

## Commands

- Start: `./scripts/run.sh` — installs if needed, generates the Prisma client, runs migrations, seeds if empty, starts the dev server, prints http://localhost:3000. Deterministic and safe to run twice.
- Test: `./scripts/test.sh` — typecheck, lint, and unit tests in one summary line.
- Reset: `./scripts/reset.sh` — deletes the local SQLite db, re-migrates, re-seeds back to synthetic seed state.

Windows: `scripts\run.ps1`, `scripts\test.ps1`, `scripts\reset.ps1`.

Always use the scripts. Never run ad-hoc server commands.

## Working rules

- Plan before non-trivial work and wait for approval.
- Build one vertical slice at a time.
- Run `./scripts/test.sh` after changes and report the result.
- Never mark work done if tests fail or the app does not start.
- Write commit messages in the imperative mood.

## Files not to touch

- `packages/ui/**` is the shell chrome. Add nav through the module registry pattern; never edit chrome components by hand.
- `scripts/run.sh` and `scripts/reset.sh` — ask first before changing them.

## Data rules

- Synthetic data only. No client data, no real names, no real financials, ever.
- No secrets in the repo. Env values go in `.env` (gitignored) and are documented in `.env.example`.
- `DATABASE_URL="file:./dev.db"`.

## Adding a module

Real SSA Pro names a module in three namespaces: `PlatformModule` (Postgres DB enum, UPPER_SNAKE), `ProjectModuleKey` (per-project toggle, camelCase), and `ModuleKey` (nav/routing, kebab-case). This template implements the last two. It has no `PlatformModule` enum because SQLite has no Prisma enums, so module enablement here is static seed data — you add the `PlatformModule` value only when the module lands on the real platform (see "Moving a module").

Steps (nav is data-driven, so never hand-edit chrome):

1. `ModuleKey` (kebab-case): add it plus a `MODULE_REGISTRY` entry (href, match, `requiresModule`) in `packages/ui/src/module-registry.ts`.
2. `ProjectModuleKey` (camelCase): add it plus a `createDefaultModules()` entry in `packages/project-context/src/project-portfolio.ts`.
3. Nav row: add one `PROJECT_MODULE_NAV` row (`moduleKey`, `navKey`, `label`) in `packages/ui/src/route-groups.ts`.
4. Create `apps/shell/src/apps/<module>/` (components, hooks, lib).
5. Mount a route at `apps/shell/src/app/(app)/apps/<module>/...` wrapped in `<ModuleGate projectId moduleKey="<camelKey>">`.
6. Add API handlers at `apps/shell/src/app/api/apps/<module>/...` that call `requireProjectAccess(slug, "<camelKey>")` from `@ssa/server/access-service` and use `prisma` from `@ssa/db`.
7. Add the Prisma model to `packages/db/prisma/schema.prisma`, then generate a migration (see "Schema changes" below). `reset` alone will not create the tables.

## Schema changes

`reset.sh` / `reset.ps1` run `prisma migrate deploy`, which only replays migrations that already exist. A schema edit therefore needs a migration generated first, or the tables silently never appear. Run it from `packages/db`:

```
cd packages/db
npx prisma migrate dev --name <descriptive_name>
```

Do not use `npm run migrate:dev -w @ssa/db -- --name <name>`: npm drops the `--name` flag, prisma then prompts for a name, and with no stdin the command hangs. Once the migration exists, `reset` replays it normally.

Windows: run `scripts\run.ps1` / `reset.ps1` rather than the `.sh` versions. The shell scripts derive `DATABASE_URL` from `pwd`, and Git Bash returns `/c/Users/...`, which Prisma resolves against the drive root and turns into a phantom `C:\c\Users\...` database. `run.sh` now converts the path, but the `.ps1` scripts are the tested Windows path.

Sample Tracker exercises every step — copy and adapt it. See README.md for the full walkthrough.

## Conventions

- Surgical edits. Change what the task needs; no whole-file rewrites or opportunistic refactors.
- Modules never run their own login. Identity and access come from `@ssa/server` (`requireProjectAccess`, `requireCurrentUser`).
- Files under `apps/shell/src/components` that read `export * from "@ssa/…"` are re-export shims. Edit the package, not the shim.
- SQLite has no enums or scalar lists. Use `String` columns (see `SampleItem.category`), not Prisma `enum` types.

## Moving a module to real SSA Pro

The folder layout, registry, nav, `ModuleGate`, `@ssa/db`, and `@ssa/server/access-service` call shapes match the real platform, so a module built here carries over with two additions: add its `PlatformModule` enum value (UPPER_SNAKE) to the real Postgres schema, and map any `String` status columns to the platform's Prisma enums. Auth, audit, and AI wiring are provided by the platform — see its INTEGRATION-PLAYBOOK.

## Skills

- `/run-app` — start, stop, or restart the app through the scripts. Never improvise server commands.

## Phase 3 (not yet)

Auth, user management, deployment, a separate database server, and federated modules are out of scope. The app runs as a static "Demo User" (admin) stub; spots where auth belongs are marked with `PHASE-3` comments. If a task seems to need any of these, flag it instead of building it.

Module: Operator Lens
Income statement analyser for diligence consultants. Upload a statement in whatever form it arrived, confirm the extracted figures, get deterministic operational flags with sourced industry benchmarks, triage them, export.
Full requirements: docs/operator-lens/SPEC.md. Build sequence: docs/operator-lens/PLAN.md.
Mirroring rule. CLAUDE.md and AGENTS.md are identical. Any change to either must be applied to both in the same commit.
Naming — two different things get called "template"
• SSA Pro Module Template = this repo, the shell.
• Input workbook = templates/OperatorLens_Input_Workbook_v1.xlsx, the Excel file an operator may fill in. Source kind WORKBOOK_XLSX. Parsed by lib/parse-workbook.ts.
Never write "the template" unqualified, in prose or in identifiers.
The input workbook is never required. It is the canonical schema extractors target, the fallback for unreadable files, and the test fixture format. Never build a path that forces an operator through it. Primary flow is: upload a PDF, scan, Excel, CSV or text.
Module keys
operator-lens (ModuleKey, kebab) · operatorLens (ProjectModuleKey, camel) · OPERATOR_LENS (PlatformModule, UPPER_SNAKE — Phase 3 only, do not add here).
Registration — the packages/ui exception
The repo rule is do not touch packages/ui/**. That means the chrome. Registration entries are the documented exception. In packages/ui change only:
• module-registry.ts — one ModuleKey member, one MODULE_REGISTRY entry
• route-groups.ts — one PROJECT_MODULE_NAV row
Nothing else in that package, except the two registration lookups in `app-shell.tsx` that the shell's own comments invite: one `MODULE_KEY_TO_NAV_KEY` row and one `getItemIcon()` case. No layout, no styling, no other component change.
When copying the sample-tracker registry entry, keep its regex anchoring and its optional /apps/operator-lens prefix group, and do not disturb MATCH_ORDER — project-overview must stay last or its regex shadows sibling routes.
The determinism contract
Same confirmed figures + same industry code + same benchmark set version + same ruleset version = identical flags, every time, on any machine. The boundary is confirmed figures, not the uploaded file.
• Ingestion is three stages: extract → Review & Confirm (human gate) → analyse.
• A model may propose figures before the gate. Nothing after the gate may touch a model.
• No engagement is analysed until figuresConfirmedAt is set. No route bypasses the gate.
• No LLM may decide whether a flag fires, its severity, or its ordering.
• Money is integer minor units, never float. Ratios round to 4dp at the single choke point in lib/metrics.ts and nowhere else.
• benchmarkSetVersion and rulesetVersion are written to every engagement.
Layering — follow Sample Tracker's three tiers

| Tier | Path | Rule |
| --- | --- | --- |
| Pure logic | apps/shell/src/apps/operator-lens/lib/ | No React, no Prisma, no clock, no network, no randomness. The engine lives here, which is what makes determinism testable. |
| State | .../hooks/ | "use client", useState/useMemo wrappers. No business logic. |
| UI | .../components/ | Fetch, render, submit. Owns loading/saving/error state. |
| Impure I/O | .../extract/ | Model calls for extraction. Deliberately outside lib/ so the purity boundary is visible in the folder tree. |

Scoping
Every model carries projectSlug String with @@index([projectSlug]). Every route handler calls requireProjectAccess(projectSlug, "operatorLens") before any Prisma call. Every page wraps in <ModuleGate projectId moduleKey="operatorLens"> and mounts client-only via next/dynamic with { ssr: false }. Routes use projectId, handlers use projectSlug; same value, different names, do not interchange.
Benchmarks
Every benchmark comparison on screen renders its source name, as-of date and sample size, and shows the full P10/P25/P50/P75/P90 distribution rather than a pass/fail. An unsourced benchmark on screen is a bug.
Tests
Vitest with globals: false. Colocated as src/**/*.test.ts, never a separate test tree. Every test file imports { describe, expect, it } from "vitest" explicitly. Run via ./scripts/test.sh. One fixture per rule, plus a clean company where nothing fires.
Python
One script only: scripts/analysis/build_benchmarks.py, run manually and offline to compute industry percentiles into a committed JSON seed. It is not part of run.sh, reset.sh or test.sh, and the app never shells out to Python at runtime. Adding Python to this repo is a new toolchain — confirm before creating it.
Do not build in this module
OCR beyond model vision · balance sheet · cash flow · exports beyond CSV · file versioning · operator-tunable thresholds · peer-set overrides · portfolio view · multi-currency.
If one comes up mid-task: open a GitHub issue, say so, keep building.
LLM narrative
Behind ENABLE_LLM_NARRATIVE, default off. Only rephrases an already-fired flag into prose. Cannot create, suppress, reorder or re-score flags. Every screen must render and the workbook path must work end to end with the flag off.

