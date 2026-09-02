# SSA Pro Module Template

This is a training template. Clone it, run one script, and you get the SSA Pro shell with a working example module. You build your Phase 2 module inside it.

The shell handles the platform parts already: navigation, the project switcher, per-project module gating, a Prisma/SQLite database, and a static demo user. Your job is to add one module that does real work, following the patterns the example module demonstrates.

## What Phase 2 asks you to build

Build one module, spec-driven, through the agent loop. Write a spec (see "Your module spec" below), then work with the agent to implement it as a single vertical slice: a data model, a UI, a route, and an API. The example module is the reference for how the pieces fit together.

## Setup and first run

1. On GitHub, click "Use this template" to create your own repo, then clone it.
2. Run `./scripts/run.sh`. It installs dependencies if needed, generates the Prisma client, runs migrations, seeds the database if empty, and starts the dev server.
3. Open http://localhost:3000.

The script is deterministic and safe to run twice. On Windows, run `scripts\run.ps1` instead.

<img width="2819" height="1420" alt="image" src="https://github.com/user-attachments/assets/0b51306a-ea3a-4cae-829e-7dad25bc5125" />


Replace the placeholder above with a real screenshot of your running shell.

## The reference vertical slice

The shipped example is Sample Tracker (module key `sampleTracker`, route key `sample-tracker`). It is a project-scoped in-shell module that lists synthetic sample items in a sortable table and lets you add one, persisted to SQLite. Read its files in this order:

1. `packages/db/prisma/schema.prisma` — the `SampleItem` model. Start with the data.
2. `apps/shell/src/apps/sample-tracker/` — the module UI: the workspace component, the sort hook, and the sort util with its unit test.
3. `apps/shell/src/app/(app)/apps/sample-tracker/projects/[projectId]/sample-tracker/page.tsx` — the route, wrapped in `<ModuleGate>`.
4. `apps/shell/src/app/api/apps/sample-tracker/projects/[projectSlug]/items/route.ts` — the API (GET and POST) using `prisma` from `@ssa/db` and `requireProjectAccess` from `@ssa/server`.
5. The registration entries, described next.

## How to add a page or module

Real SSA Pro names a module in three namespaces: `PlatformModule` (Postgres DB enum, UPPER_SNAKE), `ProjectModuleKey` (per-project toggle, camelCase), and `ModuleKey` (nav/routing, kebab-case). This template implements the last two. It has no `PlatformModule` enum because SQLite has no Prisma enums, so module enablement here is static seed data; you add that value only when the module moves to the real platform (see the next section).

Register the module (nav is data-driven, so do not hand-edit the shell chrome):

1. Route/nav key (kebab-case): add it to `ModuleKey` and a `MODULE_REGISTRY` entry in `packages/ui/src/module-registry.ts` (href, match regex, `requiresModule`).
2. Per-project key (camelCase): add it to `ProjectModuleKey` and to `createDefaultModules()` in `packages/project-context/src/project-portfolio.ts`.
3. Nav row: add one row to `PROJECT_MODULE_NAV` in `packages/ui/src/route-groups.ts` (`moduleKey`, `navKey`, `label`).

Then:

- Create the module folder under `apps/shell/src/apps/<module>/`.
- Mount a route under `apps/shell/src/app/(app)/apps/<module>/...`, wrapped in `<ModuleGate projectId moduleKey="<camelKey>">`.
- Add API handlers under `apps/shell/src/app/api/apps/<module>/...` that call `requireProjectAccess(slug, "<camelKey>")` from `@ssa/server/access-service` and use `prisma` from `@ssa/db`.
- Add the Prisma model to `packages/db/prisma/schema.prisma`.
- Generate a migration for it, from `packages/db`: `npx prisma migrate dev --name <descriptive_name>`. This is required. `reset` runs `prisma migrate deploy`, which only replays migrations that already exist, so a schema edit with no migration leaves the tables uncreated with no error. Avoid `npm run migrate:dev -w @ssa/db -- --name <name>`: npm drops the `--name` flag and the command then hangs waiting on a prompt.
- Run `./scripts/reset.sh` (Windows: `scripts\reset.ps1`) to replay migrations and re-seed.

Copy Sample Tracker and adapt it. It exercises every one of these steps.

## Moving your module to real SSA Pro

The layout and call shapes here match the real platform, so a module carries over with two additions: add its `PlatformModule` enum value (UPPER_SNAKE) to the real Postgres schema, and convert any `String` status columns to the platform's Prisma enums. The platform provides auth, audit, and AI wiring through `@ssa/server` and `@ssa/ai-client`; follow the platform's INTEGRATION-PLAYBOOK when you land the module.

## Your module spec

Module: Operator Lens (operator-lens / operatorLens)
Operator. A consultant running commercial or operational diligence on a target company, working inside an SSA Pro project alongside the deal team. Typically the junior or mid-level person who receives the financial pack and is asked what they make of it. They are the analyst, not the approver: they decide which findings survive. The target's finance team and the client never touch this module.
Job. Turn a target company's income statement into a defensible list of operational issues worth investigating, then work that list down to the findings that matter. Starts when a financial pack lands in the inbox; ends with a short, evidenced list fit to put in front of a partner. The consultant uploads whatever they were sent — a PDF, an Excel model, a CSV, a text document, a scan, a phone photo. There is no step where they retype a statement into a form before the software will work.
The failure this addresses is not arithmetic. It is context. A 10% gross margin is fatal for software and unremarkable for a lumber distributor. So every comparison is made against both the company's own history and a sourced industry benchmark distribution.
Screens.

| Screen | Purpose |
| --- | --- |
| Engagements | Every analysis in this project. Create, resume, flag counts. |
| Upload | Drop a PDF, scan, Excel, CSV, text or the input workbook. Detects kind, extracts. |
| Review & Confirm | The human gate. Editable grid of extracted figures beside the source. Nothing is analysed until confirmed. |
| Findings | Flags with figures, thresholds, benchmark distribution and provenance, and a "where to look" operator prompt. Filter and triage. |
| Scorecard | Four category scores derived from the same flags. A view, not a second analysis. |
| Rules reference | Read-only list of all 14 rules and thresholds, so the engine is inspectable. |
| Export | CSV of flags, triage state, figures and benchmark sources. |

Inputs / Outputs.
In: a statement in any of the above forms; company details (name, industry code, size band, fiscal year end, currency, unit scale); a seeded versioned benchmark table of industry percentiles with source and as-of date; operator corrections and triage decisions.
Stored: Engagement (stamped with the benchmark set and ruleset versions used), SourceDocument, Period and LineItem (each keeping the originally extracted value and whether the operator edited it), Flag, BenchmarkStat. All scoped by projectSlug.
Out: a prioritised triaged list of findings on screen, four category scores, and a CSV export carrying flags with triage state and notes, figures by period, and every benchmark used with its source and as-of date.
Acceptance criteria.
1. It ingests. A valid input workbook and a text PDF both produce figures in the review grid. Malformed files fail loudly naming a row, column or field, and write nothing.
2. The gate holds. No engagement is analysed before its figures are confirmed. Edited figures are marked as edited and keep the extracted original underneath.
3. It is deterministic. The same confirmed figures produce identical flags on every run and every machine. Exporting twice with no changes yields identical files.
4. It degrades honestly. A single-period upload fires only benchmark and coherence rules, names every rule it skipped and why, and cannot score as healthy.
5. It is correct. One fixture per rule fires exactly that rule; a clean company fires none.
6. It persists and scopes. Triage state, notes and owners survive a restart. An engagement in one project is invisible and inaccessible from another.
7. It is inspectable. Every flag shows its figures, threshold and benchmark source, and the rules screen lists all 14 with their thresholds.
8. It runs without AI. With ENABLE_LLM_NARRATIVE off, every screen renders and the workbook path works end to end.
Full spec: docs/operator-lens/SPEC.md. Build plan: docs/operator-lens/PLAN.md.

