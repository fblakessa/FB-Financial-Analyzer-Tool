# Operator Lens — Specification

**Version:** 1.2
**Phase:** 2 (UI, routes, logic, storage)
**Status:** Draft for review
**Form:** A project-scoped module inside the SSA Pro Module Template

### Naming — two different things called "template"

- **SSA Pro Module Template** always means the shell repo you cloned. The codebase.
- **Input workbook** always means `OperatorLens_Input_Workbook_v1.xlsx`, the Excel file an
  operator fills in and uploads. Never called a template in this document or in code.

Source kind for it is `WORKBOOK_XLSX`. Code lives in `ingest/parseWorkbook.ts`.

Module keys: `operator-lens` (routing), `operatorLens` (per-project), `OPERATOR_LENS`
(platform enum, Phase 3 only).

---

## 0. Module spec

### Operator

**Who.** A consultant running commercial or operational diligence on a target company,
working inside an SSA Pro project alongside the rest of the deal team. Typically the junior
or mid-level person who receives the financial pack and is asked what they make of it.

**In what role.** They are the analyst, not the approver. They decide which findings survive
and what goes in the report. The module never decides for them; it decides where to look.

**Not the operator.** The target company's finance team never touches this. Neither does the
client. Everything in it is working material for the deal team.

### Job

Turn a target company's income statement into a defensible list of operational issues worth
investigating, and then work that list down to the findings that matter.

**The operator uploads whatever they were sent.** A PDF from a data room, an Excel model, a
CSV export, a Word or text document, a scan, a phone photo of a printed P&L. The module
reads it, proposes the figures, and shows them for confirmation. There is no step where the
consultant retypes a statement into a form before the software will work.

The task starts when a financial pack lands in the consultant's inbox and ends when they
have a short, evidenced list they would put in front of a partner. Today that means opening
the statements in Excel, building ratios by hand, and relying on personal experience to know
whether a number is bad for this kind of business. The failure is not arithmetic, it is
context and recall: a junior consultant either flags everything or misses the one line that
mattered.

Done looks like: every figure confirmed, every flag triaged, and an export carrying the
numbers, the thresholds and the benchmark sources behind each surviving finding.

### Screens

Seven, in the order the operator meets them. All project-scoped and gated.

| # | Screen | What it is for |
|---|---|---|
| 8.1 | Engagements | Every analysis in this project. Create, resume, see flag counts. |
| 8.2 | Upload | Drop a PDF, Excel, CSV or the input workbook. Detects source kind, runs extraction. |
| 8.3 | Review & Confirm | The human gate. Editable grid of extracted figures beside the source. Nothing is analysed until the operator confirms. |
| 8.4 | Findings | The primary screen. Flags with figures, thresholds, benchmark provenance and the "where to look" prompt. Filter and triage. |
| 8.5 | Scorecard | Four category scores derived from the same flags. A view, not a second analysis. |
| 8.6 | Rules reference | Read-only list of all 14 rules and their thresholds, so the engine is inspectable. |
| 8.7 | Export | CSV of everything, with provenance. |

### Inputs / Outputs

**In.**

- A financial statement in whatever form it arrived: PDF, scan or photo, Excel, CSV, text,
  or the Operator Lens input workbook
- Company details: name, industry code, size band, fiscal year end, currency, unit scale
- A seeded, versioned benchmark table of industry percentiles with source and as-of date
- Operator corrections to extracted figures, and triage decisions with notes

**Stored.**

- `Engagement` — one company, one analysis, scoped to a project, stamped with the benchmark
  set and ruleset versions used
- `SourceDocument` — the uploaded file and its extraction status
- `Period` and `LineItem` — the confirmed figures, each keeping the originally extracted
  value and whether the operator edited it
- `Flag` — every fired rule with its computed values, threshold, benchmark reference, triage
  status, owner and note
- `BenchmarkStat` — the seeded percentile table

**Out.**

- A prioritised, triaged list of operational findings on screen
- Four category scores
- A CSV export containing flags with triage state and notes, the underlying figures by
  period, and the benchmark values used with their source and as-of date

### Acceptance criteria

The module is done when the vertical slice runs on a clean checkout from `./scripts/run.sh`
and all of the following hold. Full executable list, one per test, in section 9.

1. **It ingests.** A valid input workbook and a text PDF both produce figures in the review
   grid. Malformed files fail loudly with a named row, column or field, and write nothing.
2. **The gate holds.** No engagement is analysed before its figures are confirmed. Edited
   figures are marked as edited and keep the extracted original underneath.
3. **It is deterministic.** The same confirmed figures produce byte-identical flags on every
   run and every machine. Exporting twice with no changes yields identical files.
4. **It degrades honestly.** A single-period upload fires only benchmark and coherence rules,
   names every rule it skipped and why, and cannot score as healthy on the scorecard.
5. **It is correct.** One fixture per rule fires exactly that rule; a clean company fires
   none.
6. **It persists and scopes.** Triage state, notes and owners survive a restart. An
   engagement in one project is invisible and inaccessible from another.
7. **It is inspectable.** Every flag shows its figures, threshold and benchmark source, and
   the rules screen lists all 14 with their thresholds.
8. **It runs without AI.** With `ENABLE_LLM_NARRATIVE` off, every screen renders and the
   workbook path works end to end.

---

## 1. The operator and the problem

The operator is a consultant running commercial or operational diligence on a target
company. They receive financial statements, often late, often in poor shape, and they
have days rather than weeks to form a view on where the operational problems are.

The failure mode this app addresses is not arithmetic. Consultants can calculate a gross
margin. The failure mode is context. A 10% gross margin is fatal for a software business
and unremarkable for a lumber distributor. Three quarters of decelerating growth is a
crisis for a SaaS company and normal seasonality for building products. A junior
consultant staring at a P&L in isolation either flags everything or flags nothing.

Operator Lens takes a filled-in income statement, compares it against the company's own
history and against seeded industry benchmarks, and produces a prioritised list of places
to look, each with the underlying figures, the threshold breached, and the source of the
benchmark. The consultant then triages that list: dismiss what doesn't matter, escalate
what does, annotate as they go, and export the surviving findings.

It replaces the blank-page problem with a defensible starting point.

---

## 2. What v1 is and is not

### In scope

- Multi-source ingestion: PDF, scanned/photographed statements, Excel, CSV, text, and the
  Operator Lens input workbook. No source is mandatory.
- A mandatory operator Review & Confirm step between extraction and analysis
- Income statement only, one or many periods
- Schema and arithmetic validation at every door, with loud failure
- Deterministic rules engine, 14 rules across three axes
- Seeded, versioned benchmark table with full provenance
- Findings screen with filters and triage workflow
- Scorecard view derived from the same flag data
- Read-only rules reference screen
- CSV export containing flags, scorecard, figures, benchmarks and triage state
- Persistence across sessions, scoped to the project
- Triage ownership recorded from the shell's Demo User stub
- Optional LLM narrative phrasing, behind a feature flag, off by default

### Explicitly not in scope (each becomes a GitHub issue)

- Balance sheet and cash flow statements
- Authentication of any kind. The shell supplies a static Demo User; the README says do
  not add login. Mark the spots with `PHASE-3` comments.
- Roles, permissions, admin console
- Export formats beyond CSV
- File versioning and preview
- Operator-tunable thresholds
- Peer-set overrides and custom comparables
- Portfolio or multi-company comparison
- Deployment, Postgres, federated modules, `PlatformModule` enum (all Phase 3)

Anything not on this list does not get built. If it comes up mid-build, it goes in the
issue tracker and the build continues.

---

## 3. The determinism contract

This is the load-bearing requirement and everything else bends around it.

### Three stages, one human gate

Ingestion is deliberately split so that a non-deterministic step can never touch analysis.

1. **Extract.** A file goes in (input workbook, Excel, CSV, PDF). A parser or an LLM proposes
   figures in the canonical schema. This stage is not deterministic and does not need to be.
2. **Review & Confirm.** The operator sees every proposed figure, edits what is wrong, and
   confirms. Mandatory. No path skips it.
3. **Analyse.** The engine runs on the *confirmed* figures only.

The one-line version: AI does the data entry, code does the judgment.

The real risk with extraction is not non-determinism, it is a misread figure flowing
silently into a finding a consultant then repeats to a client. The human gate is what makes
the tool safe to put in front of one.

### The contract

> Given the same confirmed figures, the same industry classification, the same benchmark set
> version and the same ruleset version, Operator Lens produces an identical set of flags with
> identical computed values, every time, on any machine.

The boundary is confirmed figures, not the uploaded file. Once confirmed, figures are stored
data, not model output. Extraction is never silently re-run; re-extracting requires an
explicit operator action and a fresh confirmation.

Consequences that must be enforced in code:

1. **No LLM may decide whether a flag fires.** Not directly, not by classifying the
   industry at analysis time, not by ranking severity. A model may propose figures before the
   gate; it may never influence anything after it.
2. **Industry classification is an input, not a decision.** The operator selects it and it
   is stored on the engagement. If an LLM is later used to suggest a code, that suggestion
   must be confirmed by a human and persisted before analysis runs.
3. **Benchmark set version and ruleset version are stored on every engagement.** Re-running
   an old engagement after a benchmark update must reproduce the original result, not a
   new one.
4. **No wall-clock time, no randomness, no network calls inside the engine.** Period dates
   come from the file.
5. **Floating point is pinned.** All money is stored as integer minor units. All ratios are
   rounded to 4 decimal places at a single defined choke point before comparison.

The LLM's only permitted job is rewriting an already-fired flag into prose. The app must
be fully functional and fully demoable with the feature flag off.

---

## 4. TypeScript and Python boundary

The house rule is: if it renders, it's TypeScript. Python owns the math, lives in
`/scripts`, and is called by the app rather than instead of it.

Applied here:

**The rules engine is TypeScript.** It is application logic, it runs per-request, it is
unit tested with Vitest, and its output renders directly. Spawning a Python subprocess on
every analysis would add deployment fragility for no benefit inside a two-week build.

**Python owns the benchmark table.** Sourcing, cleaning and computing percentile
distributions across industry and size band is exactly the batch statistical work Python is
for. It runs offline in `scripts/analysis/build_benchmarks.py` and emits a versioned seed
file that Prisma loads. The app reads the seeded table and never calls Python at runtime.
It lives under `scripts/analysis/` rather than `scripts/` directly so it doesn't tangle with
the template's `run.sh` and `reset.sh`.

This satisfies both halves of the rule. Flag it explicitly in the demo, because it looks
like a deviation until you explain it.

### Two forced deviations from the stack slide

The template README overrides the slide where they disagree, and both deviations should be
stated in the demo before anyone asks.

1. **No tRPC.** The shell ships Next.js route handlers under
   `apps/shell/src/app/api/apps/<module>/`, and the README says to follow the Sample Tracker
   patterns. Rebuilding that layer in tRPC would mean fighting the shell for no user-visible
   gain.
2. **Not a standalone app.** This is a project-scoped module, gated per project. That is a
   net win: the "one shared space, same data, same state, same view" requirement is
   satisfied by the shell rather than by anything we build.

---

## 5. Data model

Six models added to `packages/db/prisma/schema.prisma`. Prisma against SQLite.

Two constraints from the shell: **SQLite has no Prisma enums**, so every status column is a
`String` guarded by a TypeScript union and marked `PHASE-3` for conversion to a platform
enum. And **everything is project-scoped**, so every model carries `projectSlug String` with
`@@index([projectSlug])`, matching `SampleItem`, and no query ever runs unscoped.

| Model | Purpose | Key fields |
|---|---|---|
| `Engagement` | One company, one analysis, inside one project | `id`, `projectSlug`, `name`, `companyName`, `industryCode`, `sizeBand`, `fiscalYearEnd`, `currency`, `unitScale`, `benchmarkSetVersion`, `rulesetVersion`, `status` (String), `createdByName`, `createdAt` |
| `Period` | One column of figures | `id`, `engagementId`, `label`, `endDate`, `ordinal` |
| `SourceDocument` | The uploaded file | `id`, `engagementId`, `filename`, `mimeType`, `sourceKind` (String: `WORKBOOK_XLSX`/`EXCEL`/`CSV`/`PDF`/`IMAGE_PDF`/`TEXT`/`MANUAL`, matching §6), `storagePath`, `extractionStatus` (String), `uploadedAt` |
| `LineItem` | One figure, with its extraction provenance | `id`, `periodId`, `code`, `valueMinor`, `extractedValueMinor` (nullable), `wasEditedByOperator` (Boolean) |
| `Flag` | One fired rule | `id`, `engagementId`, `ruleId`, `axis`, `severity` (String), `title`, `operatorPrompt`, `computedValues` (JSON string), `thresholdBreached`, `benchmarkRef`, `status` (String), `ownerName`, `note`, `updatedAt` |
| `BenchmarkStat` | One industry/size/metric distribution | `id`, `setVersion`, `industryCode`, `sizeBand`, `metricCode`, `p10`, `p25`, `p50`, `p75`, `p90`, `source`, `asOfDate`, `sampleSize` |

`LineItem` keeps both the extracted and the confirmed value so the export can show what the
extractor proposed against what the human accepted. That audit trail is what makes a finding
defensible in a client meeting.

`Engagement` also carries `figuresConfirmedAt` and `figuresConfirmedByName`. No engagement
runs the engine until both are set.

`createdByName` and `ownerName` are plain strings populated from the shell's Demo User.
When real auth arrives in Phase 3 they become foreign keys. Marked `PHASE-3` in the schema.

Money is stored as `valueMinor` (integer, minor units) with `unitScale` on the engagement
recording whether the operator entered actuals, thousands or millions. Never store money
as a float.

`BenchmarkStat` carries `source`, `asOfDate` and `sampleSize` because a consultant will be
asked in a client meeting where a number came from. A benchmark without provenance is
unusable for the actual job.

---

## 6. Input sources and the input workbook

### Accepted sources

Upload what you have. The app detects the kind and routes it.

| Source | Examples | How figures are produced |
|---|---|---|
| `PDF` | Data-room statements, lender packets, 10-K extracts | Model extraction |
| `IMAGE_PDF` | Scans, phone photos of a printed P&L | Model extraction from the image |
| `EXCEL` / `CSV` | Client models, accounting exports, any layout | Model extraction |
| `TEXT` | Pasted figures, `.txt`, `.docx` | Model extraction |
| `WORKBOOK_XLSX` | The Operator Lens input workbook | Direct read by cell code, no inference |
| `MANUAL` | Nothing to upload | Operator types into the review grid |

Every source lands in the same Review & Confirm screen (8.3). Adding a source later is a new
extractor and nothing else; it never touches the engine.

**The input workbook is never required.** It is the schema extractors target, the fallback
when a file is unreadable, and the test fixture format. A consultant with an ordinary PDF
should never open it.

Extraction quality varies by source, and it is meant to. A clean text PDF is close to exact;
a poor phone photo will need corrections. The module never hides this: proposed figures are
visibly proposed until a human confirms them, and confirmation is the only thing that
unlocks analysis. That is why accepting messy inputs is safe here and would not be in a tool
that analysed straight from the file.

Build order is an engineering concern, not a product one, and lives in `PLAN.md`.

### The input workbook

The input workbook is three things: the schema every extractor targets, the manual fallback
when extraction fails, and the test fixture format. Two sheets, distributed as a download
from the app so there is one canonical version.

### Sheet `Company`

| Field | Type | Required | Notes |
|---|---|---|---|
| Company name | text | yes | |
| Industry code | dropdown | yes | Constrained to seeded benchmark industries |
| Size band | dropdown | yes | Revenue bands, must match benchmark table |
| Fiscal year end | date | yes | |
| Currency | dropdown | yes | USD only for v1 |
| Unit scale | dropdown | yes | Actuals / thousands / millions |
| Prepared by | text | yes | |
| As-of date | date | yes | |

### Sheet `Income Statement`

Line items in rows, periods in columns. One to eight period columns. Each column needs a
label and a period end date.

Entered rows: Revenue, Cost of Goods Sold, Selling Expense, General & Administrative,
Research & Development, Other Operating Expense, Depreciation & Amortisation, Interest
Expense, Other Income/(Expense), Income Tax.

Derived and reconciled rows: Gross Profit, SG&A Total, EBITDA, EBIT, Pre-tax Income, Net
Income. The operator may fill these; the app recalculates and compares.

### Validation at the door

For `WORKBOOK_XLSX`, upload fails loudly with a row-and-column-level error list if any of
the following. For extracted sources these same checks run at *confirmation* rather than at
upload, because the operator is expected to fix problems in the review grid:

- Sheet or column headers do not match the expected schema
- A required `Company` field is blank
- Industry code or size band is not in the seeded benchmark table
- Revenue is zero or blank in any period
- Any numeric cell contains text
- A derived row is present and differs from the recalculated value by more than 0.5%
- Period end dates are not strictly increasing
- More than eight period columns

Partial imports are not permitted. No engagement is analysed until every check passes. There
is no silent correction anywhere in the pipeline, at either door.

---

## 7. The rules catalogue

Fourteen rules, three axes. Each rule has a stable ID, a minimum period count, a severity,
and an operator prompt.

Rules degrade gracefully. With one period the operator gets benchmark and coherence flags,
and the UI states plainly which rules were skipped and why. Flag yield rises as period
count rises. This is worth showing live in the demo.

### Benchmark axis (needs industry code, 1+ periods)

| ID | Fires when | Severity |
|---|---|---|
| B-01 | Gross margin below industry P25 | High |
| B-02 | SG&A as % of revenue above industry P75 | High |
| B-03 | EBITDA margin below industry P25 | High |
| B-04 | R&D as % of revenue outside industry P10–P90 | Medium |

### Trend axis (needs 2+ periods, one rule needs 3+)

| ID | Fires when | Min periods | Severity |
|---|---|---|---|
| T-01 | SG&A growth exceeds revenue growth by 5pp or more | 2 | High |
| T-02 | Gross margin compresses 150bps or more in consecutive periods | 3 | High |
| T-03 | Revenue growth rate declines in two consecutive comparisons | 3 | Medium |
| T-04 | COGS growth exceeds revenue growth by 3pp or more | 2 | High |
| T-05 | EBITDA margin falls 200bps or more while revenue grows | 2 | High |
| T-06 | D&A moves 25% or more while revenue moves less than 5% | 2 | Medium |

### Coherence axis (1+ periods)

| ID | Fires when | Severity |
|---|---|---|
| C-01 | Entered derived row disagrees with recalculation by more than 0.5% | High |
| C-02 | Gross profit is negative | High |
| C-03 | Operating income negative but pre-tax income positive | Medium |
| C-04 | Revenue positive but SG&A zero or absent | Low |

### Operator prompts

The prompt is what makes this an operator tool rather than a ratio calculator. Every flag
carries one, written as a specific instruction. Examples:

- **T-01:** Pull headcount adds by function for the period. Check for sales comp plan
  changes, new fixed overhead (office, software licences, insurance) and any one-time
  professional fees sitting in G&A.
- **T-04:** Ask whether this is input cost inflation, mix shift toward lower-margin
  products, or a pricing failure. Request a volume-price-mix bridge before accepting the
  first explanation offered.
- **B-02:** Compare the SG&A build to the benchmark composition. Overweight sales spend and
  overweight G&A point at different problems and different remedies.
- **C-03:** The operating business lost money. Find what sits in other income and whether it
  recurs.

The full set lives in the ruleset file alongside each rule definition, not in a separate
document, so the rule and its prompt can never drift apart.

---

## 8. Screens

The shell supplies nav, layout, logging, the project switcher and the Demo User. Every page
below wraps in `<ModuleGate projectId moduleKey="operatorLens">` and every backing route
handler calls `requireProjectAccess(slug, "operatorLens")` before anything else.

Pages live under `.../apps/operator-lens/projects/[projectId]/operator-lens/`; API handlers
under `.../api/apps/operator-lens/projects/[projectSlug]/`. Pages take the id, handlers take
the slug. Copy Sample Tracker rather than reasoning about it.

### 8.1 Engagements

Engagements for the current project only, with company name, industry, period count, flag
count by severity, status and last modified. Create button.

### 8.2 New engagement — upload

Workbook download link plus a drop zone accepting the input workbook, Excel, CSV or PDF.
The app detects the source kind. Workbook files are read directly; everything else is queued for
extraction with a visible progress state. A hard failure at this stage (unreadable file,
image-only PDF) says so plainly and offers the input workbook as a fallback.

### 8.3 Review & Confirm

The gate. Every source passes through here and there is no path around it.

An editable grid in the canonical shape: line item codes down the left, periods across the
top, extracted figures in the cells. The source document sits alongside for comparison.
Every cell the operator edits is marked as edited and keeps the original extracted value
underneath.

Derived rows recalculate live, so the operator watches the statement foot as they correct
it. The Confirm button stays disabled until every validation in section 6 passes and every
required company field is set. Confirming writes `figuresConfirmedAt` and
`figuresConfirmedByName` and runs the engine.

For `WORKBOOK_XLSX` uploads the grid arrives already correct and confirmation is one click.
The screen is identical either way, which is what keeps a new source from being a new
feature.

### 8.3a Industry context

Not a separate screen. A strip that appears on every benchmark-driven flag and on the
scorecard.

The consultant's real question is never "is 51% high," it is "is 51% high *for this kind of
business*." So wherever a company figure is shown against a benchmark, the module shows the
whole distribution rather than a pass/fail: the industry P10, P25, median, P75 and P90 for
that metric, with a marker where this company sits.

Directly beneath it, always, and never behind a click: the source name, the as-of date, and
the sample size. A benchmark without provenance cannot be repeated in a client meeting, so
the module treats an unsourced benchmark as a bug.

Example rendering:

> **SG&A as % of revenue — 51.0%**
> Software & SaaS, $25M–$100M: P10 32% · P25 38% · Median 43% · **P75 47%** · P90 55%
> This company sits at roughly the 82nd percentile.
> Source: [name], as of [date], n = [count]

### 8.4 Findings

Primary screen. Flag list, sorted by severity then axis. Each row shows title, severity,
axis, the computed value against the threshold, and the benchmark source where relevant.

Expanding a row reveals: the underlying figures used, the exact threshold, benchmark
provenance (source, as-of date, sample size), the operator prompt, and the triage controls.

Filters: severity, axis, status, owner.

Triage: `Open → Reviewed → Escalated | Dismissed`, stored as a `String`. Every transition
records the Demo User's name, a timestamp and an optional note. Dismissed flags stay visible under filter and are excluded
from scorecard maths.

### 8.5 Scorecard

A view over the same flag data, not a second analysis. Four categories: Profitability, Cost
Structure, Growth, Data Quality.

Each category starts at 100. Subtract 25 per open or escalated High, 10 per Medium, 5 per
Low. Floor at 0. Dismissed flags are excluded. Skipped rules are reported as reduced
coverage rather than silently scoring as clean, so a one-period upload cannot masquerade as
a healthy company.

Clicking a category filters the Findings screen to its contributing flags.

### 8.6 Rules reference

Read-only table of all 14 rules: ID, axis, plain-English description, threshold, minimum
period count, severity, data source. This exists because the first question anyone asks is
"why did it flag that," and an inspectable engine is the difference between a tool a
consultant trusts and a black box.

### 8.7 Export

Downloads a CSV containing flags with full triage state and notes, scorecard by category,
the underlying figures by period, and the benchmark values used with their provenance.
Filename encodes company, as-of date and benchmark set version.

---

## 9. Acceptance criteria

Written to be executable. These are the tests, not a wish list.

**Ingestion**

1. Given a valid workbook with three periods, when uploaded, then an engagement is created
   with three `Period` records and every line item persisted.
2. Given a workbook whose entered Gross Profit differs from Revenue minus COGS by more than
   0.5%, when uploaded, then the upload fails, an error naming the sheet and row is shown,
   and no database records are created.
3. Given a workbook with an industry code absent from the benchmark table, when uploaded,
   then the upload fails with a message listing valid codes.
4. Given a workbook with nine period columns, when uploaded, then the upload fails.
5. Given a workbook with text in a numeric cell, when uploaded, then the upload fails with
   the cell reference.

**Extraction and the review gate**

5a. Given a PDF income statement, when uploaded, then figures appear in the review grid and
    `extractionStatus` reaches a terminal state, success or failure.
5b. Given any engagement whose figures are not confirmed, when the findings route is
    requested, then no flags exist and the operator is returned to the review screen.
5c. Given an operator edits an extracted figure, then `wasEditedByOperator` is true and
    `extractedValueMinor` still holds the original.
5d. Given a review grid where a derived row does not reconcile, then Confirm is disabled and
    the offending row is named.
5e. Given confirmed figures, when the same engagement is re-analysed, then extraction does
    not re-run and the flags are identical.

**Engine determinism**

6. Given the same file uploaded twice into two engagements, then the two flag sets are
   identical in rule IDs, computed values and severities.
7. Given a one-period upload, then no trend rules fire and the Findings screen lists the
   skipped rules with the period count each requires.
8. Given the LLM feature flag off, then every screen renders and every flag displays its
   operator prompt from the ruleset.
9. Given a fixture company with known figures, then exactly the expected rule IDs fire.
   (One fixture per rule, plus one clean company where nothing fires.)

**Workflow and persistence**

10. Given a flag moved to Dismissed with a note, when the browser is closed and the app
    reopened, then the status, note, owner and timestamp survive.
11. Given a High flag dismissed, then the relevant scorecard category rises by exactly 25.
12. Given an engagement created in project A, when project B is selected in the switcher,
    then that engagement does not appear, and requesting it through the API under project B's
    slug is refused by `requireProjectAccess` before any Prisma call runs.
12a. Given a flag escalated, then `ownerName` is populated from the Demo User and persists.

**Export**

13. Given an engagement with triaged flags, when exported, then the CSV contains every
    flag with its status, owner, note, computed values, threshold, and benchmark source and
    as-of date.
14. Given an engagement, when exported twice with no intervening changes, then the two
    files are byte-identical.

---

## 10. Known limits

To be carried verbatim into the README.

- Income statement only. Balance sheet and cash flow analysis is not available, which
  removes the strongest coherence checks (receivables against revenue, inventory turns).
- Extraction is assistive, not authoritative. Every figure is operator-confirmed before any
  analysis runs, and the export records which figures were edited.
- Extraction accuracy falls with source quality. Clean text PDFs are near-exact; poor scans
  and photos will need corrections in the review grid. Multi-column layouts and footnoted
  figures are the common failure cases.
- Benchmarks are a seeded snapshot with a fixed as-of date, covering ten industries and four
  size bands. A company outside that coverage gets trend and coherence flags only, and the
  module says so rather than benchmarking it against something inappropriate.
- No authentication. The shell runs as a static Demo User with admin rights, by design in
  Phase 2. Engagements are separated by project, not by person.
- Benchmarks are a seeded snapshot with a fixed as-of date. They do not update and cannot
  be overridden per engagement.
- Thresholds are fixed in code. Sector-specific tuning is not possible in v1.
- USD only. No currency conversion.
- Single-company. No portfolio view or peer comparison.
- SQLite, local, single file. Not multi-user concurrent in any real sense.
