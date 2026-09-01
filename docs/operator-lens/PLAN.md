# Operator Lens — Build Plan

Revised against the SSA Pro Module Template README. Validate before writing code.

**Naming.** "SSA Pro Module Template" = the shell repo. "Input workbook" = the Excel file
operators fill in. Two different things; never shorten either to "the template".

---

## 1. The vertical slice

The README asks for one module as a single vertical slice: data model, UI, route, API.
Ours:

> Open a project → Operator Lens appears in the nav → upload a statement in whatever form it
> arrived (PDF, scan, Excel, CSV, text, or the input workbook) → land in the Review & Confirm grid → fix a figure → confirm → land on Findings with
> real flags → dismiss one with a note → see the scorecard move → export CSV → restart the
> server, reopen, find everything still there.

If that path works you have a demo. Nothing gets built that isn't on it until it's walkable.

**The Review & Confirm screen is the choke point and it gets built early.** Every input
source lands there. Build it once, and a new source is a new extractor rather than a new
feature. Skip it and every format you add is a rewrite.

---

## 2. Stack

Locked by the template. The README overrides the stack slide where they disagree.

| Layer | Choice |
|---|---|
| Shell | SSA Pro Module Template monorepo, Next.js App Router |
| Language | TypeScript, strict |
| API | Route handlers under `apps/shell/src/app/api/apps/operator-lens/**` |
| DB access | `prisma` from `@ssa/db` |
| DB | SQLite. Postgres is Phase 3; schema must migrate cleanly |
| Access control | `requireProjectAccess` from `@ssa/server/access-service` |
| Styling | Tailwind + `@ssa/ui` |
| Validation | Zod |
| Spreadsheet | SheetJS (`xlsx`) |
| Tests | Vitest 4, `globals: false`, jsdom, colocated `src/**/*.test.ts` |
| Analysis | Python 3, `scripts/analysis/`, offline batch only |

**Two deviations from the boss's stack slide, both forced by the template.** No tRPC (the
shell ships route handlers). No separate app (this is a project-scoped module). Say both out
loud in the demo before anyone asks.

---

## 3. File map

Mirrors Sample Tracker's three-tier layering. `lib/` is pure and `extract/` is not, so the
determinism boundary is visible in the folder tree.

```
packages/db/prisma/schema.prisma          + 5 models, each with projectSlug + @@index
packages/db/prisma/seed.ts                + benchmark loader
packages/db/prisma/benchmarks.v1.json     generated, committed, never hand-edited

packages/ui/src/module-registry.ts        + ModuleKey "operator-lens" + registry entry ONLY
packages/ui/src/route-groups.ts           + one PROJECT_MODULE_NAV row ONLY
packages/project-context/src/project-portfolio.ts
                                          + ProjectModuleKey "operatorLens"
                                          + createDefaultModules() entry

templates/OperatorLens_Input_Workbook_v1.xlsx
templates/OperatorLens_Demo_EpiroteFurs.xlsx

scripts/analysis/build_benchmarks.py      offline only, not wired into any .sh
scripts/analysis/sources/                 raw inputs with provenance
scripts/analysis/README.md                how to regenerate and bump the version

apps/shell/src/apps/operator-lens/
  lib/                                    PURE. no React, no Prisma, no clock, no network
    canonical.ts                          the figure schema every source targets
    workbook-schema.ts                    Zod schema for both workbook sheets
    parse-workbook.ts                     SheetJS -> canonical, direct read by cell code
    parse-workbook.test.ts
    validate.ts                           every door check, returns an error list
    validate.test.ts
    metrics.ts                            ratios, growth rates, the 4dp rounding choke point
    ruleset.ts                            RULESET_VERSION + 14 rules + operator prompts
    engine.ts                             (figures, industry, benchmarks) -> Flag[]
    engine.test.ts                        one fixture per rule + a clean company
    determinism.test.ts
    scorecard.ts                          Flag[] -> category scores
    scorecard.test.ts
    to-csv.ts
  extract/                                IMPURE. model calls live here, never in lib/
    source-kind.ts                        detect kind from mime + contents
    extract.ts                            pdf | image | xlsx | csv | text -> canonical
  hooks/
    use-review-grid.ts                    edit state, live reconciliation
    use-findings-filter.ts
  components/
    operator-lens-workspace.tsx
    review-grid.tsx
    findings-table.tsx
    benchmark-strip.tsx                   distribution + source + as-of + n
    scorecard-panel.tsx
    rules-reference.tsx

apps/shell/src/app/(app)/apps/operator-lens/projects/[projectId]/operator-lens/
  page.tsx                                engagement list
  new/page.tsx                            upload
  [engagementId]/review/page.tsx          Review & Confirm (the gate)
  [engagementId]/page.tsx                 findings
  [engagementId]/scorecard/page.tsx
  rules/page.tsx
```

Every page is `"use client"` and pulls its workspace through `next/dynamic` with
`{ ssr: false }`, matching Sample Tracker.

API handlers under `apps/shell/src/app/api/apps/operator-lens/projects/[projectSlug]/`:
`engagements/route.ts` (GET, POST), `engagements/[id]/route.ts`,
`engagements/[id]/confirm/route.ts`, `engagements/[id]/flags/[flagId]/route.ts` (PATCH),
`engagements/[id]/export/route.ts`. Each opens with
`await requireProjectAccess(projectSlug, "operatorLens")` before any Prisma call, and each
POST/PATCH parses its body with Zod and returns the first issue message as a 400.

## 4. Schedule

Ten working days.

**Day 1 — Register.** Recon is done. Put `SPEC.md` and `PLAN.md` in `docs/operator-lens/`,
append the module block to **both** `CLAUDE.md` and `AGENTS.md`, and fill in the README's
`## Your module spec` section. Then register `operator-lens` in all three namespaces with a
placeholder page and confirm the nav link appears inside a project. Open the full issue list.
Commit the docs before the code.

**Day 2 — Contracts.** Prisma models, then `./scripts/reset.sh`. Zod workbook schema. Build
the input workbook and commit it. Write `ruleset.ts` with all 14 rules and their operator
prompts, no engine. Write test fixtures, one per rule. You end the day with failing tests
that describe the whole system.

**Day 3 — Benchmarks.** `build_benchmarks.py`, sources with provenance, emit
`benchmarks.v1.json`, wire into seed. Verify every industry/size/metric combination the
workbook dropdown offers resolves to a row. A missing benchmark on demo day is avoidable.

**Day 4 — Workbook ingestion.** Parse the input workbook by cell code. Every door check in
spec §6. Nothing analysed until all pass. Validation tests green.

**Day 5 — Engine.** `metrics.ts`, then `engine.ts`. Rule tests and determinism tests green.
No UI. Prove the heart of the app before styling anything.

**Day 6 — Slice, part one.** Engagement list, upload, the Review & Confirm grid, findings
list rendering real flags. Behind `ModuleGate`, through real route handlers. Ugly is fine.

**Day 7 — Slice, part two.** Triage with persistence. Scorecard. Filters. Rules reference.
Slice is walkable end to end on the workbook path.

**Day 7.5 — Extraction.** One extractor that sends a PDF, image, spreadsheet or text blob to
the model and returns canonical figures, landing in the existing review grid. It is one code
path, not four: the differences are content-block types on the request, not separate
pipelines. Additive by construction — it touches `ingest/` and nothing else.

**Why the workbook is built first even though it is not the product.** It is the only source
whose correct output is knowable in advance, which makes it the fixture the engine tests
against. Ship order is not product priority. The demo leads with a PDF.

**Day 8 — Export and hardening.** CSV with full provenance. Byte-identical export test.
Empty states, error states, the one-period degradation message.

**Day 9 — Polish and docs.** Tailwind pass using `@ssa/ui` primitives. README: fill in the
module spec section (Operator, Job, Screens, Inputs/Outputs, Acceptance criteria), replace
the placeholder screenshot with your running shell, paste the known-limits list verbatim.
LLM narrative behind its flag only if everything else is done.

**Day 10 — Demo.** Two full dry runs from a clean checkout, starting with `./scripts/run.sh`.
Architecture sketch. The what-broke story.

Slipping? Cut the LLM narrative first, then PDF extraction, then visual polish. Never cut
tests, the review gate, or the README.

### Today: the walking skeleton

Before Day 1 proper, get something on screen you can react to. In one focused session:
register the module, add the Prisma models, parse the Epirote Furs demo file, and render the
raw figures on a page. No rules, no styling, no tests. The point is to prove the pipeline
end to end and give you something to edit rather than imagine. Everything after is
hardening.

---

## 5. GitHub workflow

You've already used "Use this template" and cloned it, so:

```bash
cd <your-folder>
git checkout -b feature/operator-lens
git push -u origin feature/operator-lens
```

Every session, before starting:

```bash
git status     # expect "working tree clean"
git branch     # expect * on feature/operator-lens
```

After every meaningful piece of work:

```bash
git add -A
git commit -m "Register operator-lens module in all three namespaces"
git push
```

Three rules: never commit on `main`; never `git push --force`; only push to the branch you
created. Ten commits a day is healthy. Open the PR on Day 9 so a merged PR exists for the
demo.

---

## 6. Issues to open on Day 1

**Deferred features**

1. Extraction accuracy: multi-column layouts and footnoted figures
2. Balance sheet support and cross-statement coherence rules
3. Cash flow statement support
4. Real auth (Phase 3 — shell provides Demo User stub)
5. Roles, permissions, admin console
6. Export to XLSX, PPTX, PDF, JSON
7. File versioning and preview
8. Operator-tunable thresholds, versioned per engagement
9. Operator-supplied peer set as benchmark override
10. Portfolio view across companies
11. Multi-currency
12. Benchmark refresh pipeline and set-versioning UI
13. Column-mapping screen so operators can upload their own layout

**Platform migration**

14. Add `OPERATOR_LENS` to the real `PlatformModule` Postgres enum
15. Convert `String` status columns to platform Prisma enums
16. Follow the platform INTEGRATION-PLAYBOOK when landing the module

**Known risks**

17. Benchmark source licensing and provenance for client-facing use
18. Industry taxonomy choice (NAICS vs SIC vs internal) and benchmark join effects
19. Stack-slide conflict: tRPC mandated, template ships route handlers — confirm with lead

---

## 7. Definition of done

- Module appears in project nav and gates correctly
- Vertical slice runs from `./scripts/run.sh` on a clean checkout, no manual steps
- Every acceptance criterion in spec §9 has a passing test
- Determinism test passes
- Repo README's module spec section filled in, screenshot replaced, known limits verbatim
- CLAUDE.md in the repo, under 150 lines
- Branch has a merged PR and a worked issue list
- You can explain both stack deviations without hedging
