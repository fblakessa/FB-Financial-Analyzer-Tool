"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PageShell } from "@ssa/ui/page-shell";

import {
  formatMoney,
  isDerivedRow,
  lineItemLabel,
  lineItemRank,
  unitScaleLabel
} from "../lib/line-items";
import { BenchmarkStrip, type BenchmarkStripData } from "./benchmark-strip";

// Findings screen. Visual language follows Sample Tracker: rounded cards on the
// canvas, ink headings, muted body copy, uppercase tracked column headers.

const FLAG_STATUSES = ["OPEN", "REVIEWED", "ESCALATED", "DISMISSED"] as const;
const SEVERITIES = ["HIGH", "MEDIUM", "LOW"] as const;

type FlagStatus = (typeof FLAG_STATUSES)[number];

type Flag = {
  id: string;
  ruleId: string;
  axis: string;
  severity: string;
  title: string;
  operatorPrompt: string;
  computedValues: string;
  thresholdBreached: string;
  status: string;
  ownerName: string | null;
  note: string | null;
  updatedAt: string;
};

type LineItem = { code: string; valueMinor: string; wasEditedByOperator: boolean };
type Period = { id: string; label: string; ordinal: number; lineItems: LineItem[] };

type IndustryContext = BenchmarkStripData & { periodLabel: string };

type Engagement = {
  id: string;
  companyName: string;
  industryCode: string;
  sizeBand: string;
  rulesetVersion: string;
  benchmarkSetVersion: string;
  status: string;
  currency: string;
  unitScale: string;
  flags: Flag[];
  periods: Period[];
  industryContext: IndustryContext[];
};

// A benchmark flag stores the whole distribution it fired against, so the strip
// renders from the flag itself and cannot drift from what fired.
function stripFromFlag(flag: Flag): BenchmarkStripData | null {
  try {
    const parsed = JSON.parse(flag.computedValues) as {
      companyValueBps?: number;
      percentilePosition?: number;
      benchmark?: Omit<BenchmarkStripData, "companyValueBps" | "percentilePosition">;
    };
    if (!parsed.benchmark || parsed.companyValueBps === undefined) return null;
    return {
      ...parsed.benchmark,
      companyValueBps: parsed.companyValueBps,
      percentilePosition: parsed.percentilePosition ?? 50
    };
  } catch {
    return null;
  }
}

const SEVERITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const AXIS_RANK: Record<string, number> = { BENCHMARK: 0, TREND: 1, COHERENCE: 2 };

// No red or amber in the shell palette, so severity borrows Tailwind's scales
// the same way Sample Tracker borrows text-red-600 for errors.
const SEVERITY_STYLE: Record<string, { accent: string; badge: string }> = {
  HIGH: { accent: "border-l-red-500", badge: "bg-red-50 text-red-700 ring-red-200" },
  MEDIUM: { accent: "border-l-amber-500", badge: "bg-amber-50 text-amber-700 ring-amber-200" },
  LOW: { accent: "border-l-slate-400", badge: "bg-slate-100 text-slate-600 ring-slate-200" }
};

const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-slate-100 text-slate-600 ring-slate-200",
  REVIEWED: "bg-sky-50 text-sky-700 ring-sky-200",
  ESCALATED: "bg-red-50 text-red-700 ring-red-200",
  DISMISSED: "bg-slate-50 text-outline ring-slate-200"
};

const CARD = "rounded-[28px] bg-card p-6 shadow-ambient ring-1 ring-slate-200/70";
const SELECT =
  "rounded-2xl border border-slate-200 bg-canvas px-4 py-2.5 text-sm text-ink outline-none focus:border-ink/40";
const INPUT = SELECT + " w-full";
const COLUMN_HEAD =
  "px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-outline";
const PILL = "rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ring-1";

function formatBps(value: number): string {
  return `${(value / 100).toFixed(2)}%`;
}

// The engine stores the figures a rule used as a JSON string. Render them as
// label/value pairs so a reader can check the arithmetic without opening the DB.
function describeComputed(raw: string): Array<{ label: string; value: string }> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return [{ label: "raw", value: raw }];
  }

  // camelCase keys split into words, then the finance acronyms are restored:
  // "sgaGrowthBps" would otherwise read "Sga Growth".
  const ACRONYMS: Record<string, string> = {
    Sga: "SG&A",
    Cogs: "COGS",
    Ebitda: "EBITDA",
    Ebit: "EBIT"
  };

  const humanise = (key: string) =>
    key
      .replace(/Bps$/, "")
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (character) => character.toUpperCase())
      .trim()
      .split(" ")
      .map((word) => ACRONYMS[word] ?? word)
      .join(" ");

  return Object.entries(parsed)
    // *Text keys are pre-formatted duplicates of their *Bps sibling, which is
    // already rendered with both the percentage and the raw bps.
    .filter(([key]) => !key.endsWith("Text"))
    .map(([key, value]) => {
    if (Array.isArray(value)) {
      const rendered = value.map((entry) =>
        typeof entry === "number" && key.endsWith("Bps") ? formatBps(entry) : String(entry)
      );
      return { label: humanise(key), value: rendered.join("  ->  ") };
    }
    if (typeof value === "number" && key.endsWith("Bps")) {
      return { label: humanise(key), value: `${formatBps(value)} (${value}bps)` };
    }
      return { label: humanise(key), value: String(value) };
    });
}

export function OperatorLensWorkspace({ projectId }: { projectId: string }) {
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const basePath = `/api/apps/operator-lens/projects/${encodeURIComponent(projectId)}`;

  // Findings and figures come from two routes; merge them by engagement id so
  // the collapsible statement and the flags stay in one card per engagement.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [flagsResponse, figuresResponse] = await Promise.all([
        fetch(`${basePath}/flags`, { cache: "no-store" }),
        fetch(`${basePath}/engagements`, { cache: "no-store" })
      ]);
      if (!flagsResponse.ok || !figuresResponse.ok) throw new Error("Could not load findings.");

      const flagsPayload = (await flagsResponse.json()) as { engagements: Engagement[] };
      const figuresPayload = (await figuresResponse.json()) as { engagements: Engagement[] };
      const figuresById = new Map(figuresPayload.engagements.map((entry) => [entry.id, entry]));

      setEngagements(
        flagsPayload.engagements.map((entry) => {
          const figures = figuresById.get(entry.id);
          return {
            ...entry,
            currency: figures?.currency ?? "USD",
            unitScale: figures?.unitScale ?? "ACTUALS",
            periods: figures?.periods ?? [],
            industryContext: entry.industryContext ?? []
          };
        })
      );
      setError(null);
    } catch {
      setError("Could not load findings.");
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  useEffect(() => {
    load();
  }, [load]);

  const triage = async (engagementId: string, flag: Flag, status: FlagStatus) => {
    setSavingId(flag.id);
    setError(null);
    try {
      const draft = noteDrafts[flag.id];
      const response = await fetch(
        `${basePath}/engagements/${encodeURIComponent(engagementId)}/flags/${encodeURIComponent(flag.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          // Only send a note when one was typed, so a status change never
          // silently wipes an existing note.
          body: JSON.stringify(draft === undefined ? { status } : { status, note: draft })
        }
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not update the flag.");
      }
      setNoteDrafts((current) => {
        const next = { ...current };
        delete next[flag.id];
        return next;
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the flag.");
    } finally {
      setSavingId(null);
    }
  };

  const visible = useMemo(
    () =>
      engagements.map((engagement) => ({
        engagement,
        flags: [...engagement.flags]
          .filter((flag) => severityFilter === "ALL" || flag.severity === severityFilter)
          .filter((flag) => statusFilter === "ALL" || flag.status === statusFilter)
          .sort(
            (a, b) =>
              (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
              (AXIS_RANK[a.axis] ?? 9) - (AXIS_RANK[b.axis] ?? 9) ||
              a.ruleId.localeCompare(b.ruleId) ||
              a.title.localeCompare(b.title)
          )
      })),
    [engagements, severityFilter, statusFilter]
  );

  if (loading) {
    return <div className={CARD}>Loading findings...</div>;
  }
  if (engagements.length === 0) {
    return <div className={CARD}>No engagements yet.</div>;
  }

  return (
    <div className="space-y-6">
      {visible.map(({ engagement, flags }) => {
        const periodRange =
          engagement.periods.length > 0
            ? `${engagement.periods[0].label} to ${engagement.periods[engagement.periods.length - 1].label}`
            : "No periods";
        const scale = unitScaleLabel(engagement.currency, engagement.unitScale);
        const counts = SEVERITIES.map((severity) => ({
          severity,
          count: engagement.flags.filter((flag) => flag.severity === severity).length
        }));

        // Income statement order, never alphabetical.
        const codes = [
          ...new Set(engagement.periods.flatMap((period) => period.lineItems.map((item) => item.code)))
        ].sort((a, b) => lineItemRank(a) - lineItemRank(b) || a.localeCompare(b));

        return (
          <PageShell
            key={engagement.id}
            eyebrow="Operator Lens findings"
            title={engagement.companyName}
            description={`${engagement.industryCode} · ${engagement.sizeBand} · ${periodRange} · figures in ${scale}`}
          >
            <div className="space-y-6">
              {/* Summary counts and the versions the analysis was stamped with. */}
              <div className={CARD}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-bold text-ink">
                    {engagement.flags.length} finding{engagement.flags.length === 1 ? "" : "s"}
                  </span>
                  {counts.map(({ severity, count }) => (
                    <span key={severity} className={`${PILL} ${SEVERITY_STYLE[severity].badge}`}>
                      {count} {severity}
                    </span>
                  ))}
                  <span className="ml-auto text-xs text-outline">
                    ruleset {engagement.rulesetVersion} · benchmark set {engagement.benchmarkSetVersion} ·
                    status {engagement.status}
                  </span>
                </div>

                <div className="mt-5 flex flex-wrap items-end gap-4 border-t border-slate-100 pt-5">
                  <div>
                    <label
                      htmlFor="severity-filter"
                      className="block text-[11px] font-extrabold uppercase tracking-[0.14em] text-outline"
                    >
                      Severity
                    </label>
                    <select
                      id="severity-filter"
                      className={`mt-1.5 ${SELECT}`}
                      value={severityFilter}
                      onChange={(event) => setSeverityFilter(event.target.value)}
                    >
                      <option value="ALL">All severities</option>
                      {SEVERITIES.map((severity) => (
                        <option key={severity} value={severity}>
                          {severity}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="status-filter"
                      className="block text-[11px] font-extrabold uppercase tracking-[0.14em] text-outline"
                    >
                      Triage status
                    </label>
                    <select
                      id="status-filter"
                      className={`mt-1.5 ${SELECT}`}
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value)}
                    >
                      <option value="ALL">All statuses</option>
                      {FLAG_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>

                  <p className="ml-auto text-sm text-muted">
                    Showing {flags.length} of {engagement.flags.length}
                  </p>
                </div>

                {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
              </div>

              {/* Findings */}
              {flags.length === 0 ? (
                <div className={CARD}>
                  <p className="text-sm text-muted">No findings match the current filters.</p>
                </div>
              ) : (
                <ol className="space-y-4">
                  {flags.map((flag) => {
                    const severity = SEVERITY_STYLE[flag.severity] ?? SEVERITY_STYLE.LOW;
                    const computed = describeComputed(flag.computedValues);
                    const saving = savingId === flag.id;

                    return (
                      <li
                        key={flag.id}
                        className={`rounded-[28px] border-l-4 bg-card p-6 shadow-ambient ring-1 ring-slate-200/70 ${severity.accent} ${
                          flag.status === "DISMISSED" ? "opacity-60" : ""
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`${PILL} ${severity.badge}`}>{flag.severity}</span>
                          <span className={`${PILL} ${STATUS_STYLE[flag.status] ?? STATUS_STYLE.OPEN}`}>
                            {flag.status}
                          </span>
                          <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-outline">
                            {flag.ruleId} · {flag.axis}
                          </span>
                          <span className="ml-auto text-xs text-outline">
                            {flag.ownerName ? `${flag.ownerName} · ` : ""}
                            {flag.updatedAt.slice(0, 10)}
                          </span>
                        </div>

                        <h3 className="mt-3 font-display text-lg font-semibold text-ink">{flag.title}</h3>

                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                          <div className="rounded-2xl bg-canvas p-4">
                            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-outline">
                              Figures used
                            </p>
                            <dl className="mt-2 space-y-1.5">
                              {computed.map((entry) => (
                                <div key={entry.label} className="flex justify-between gap-4 text-sm">
                                  <dt className="text-muted">{entry.label}</dt>
                                  <dd className="text-right font-semibold tabular-nums text-ink">
                                    {entry.value}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </div>

                          <div className="rounded-2xl bg-canvas p-4">
                            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-outline">
                              Threshold breached
                            </p>
                            <p className="mt-2 text-sm leading-6 text-ink">{flag.thresholdBreached}</p>
                          </div>
                        </div>

                        {/* Benchmark flags carry their distribution with them. */}
                        {(() => {
                          const strip = stripFromFlag(flag);
                          return strip ? (
                            <div className="mt-4">
                              <BenchmarkStrip data={strip} />
                            </div>
                          ) : null;
                        })()}

                        {/* The operator prompt is the point of the tool, so it
                            gets its own band rather than sitting in body copy. */}
                        <div className="mt-4 rounded-2xl bg-ink/[0.04] p-4 ring-1 ring-ink/10">
                          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-ink">
                            Where to look
                          </p>
                          <p className="mt-2 text-sm leading-6 text-text">{flag.operatorPrompt}</p>
                        </div>

                        {flag.note ? (
                          <p className="mt-4 text-sm text-muted">
                            <span className="font-bold text-ink">Note: </span>
                            {flag.note}
                          </p>
                        ) : null}

                        <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-5">
                          <div className="min-w-[16rem] flex-1">
                            <label
                              htmlFor={`note-${flag.id}`}
                              className="block text-[11px] font-extrabold uppercase tracking-[0.14em] text-outline"
                            >
                              Triage note
                            </label>
                            <input
                              id={`note-${flag.id}`}
                              className={`mt-1.5 ${INPUT}`}
                              value={noteDrafts[flag.id] ?? ""}
                              placeholder={flag.note ?? "Optional, saved with the next status change"}
                              onChange={(event) =>
                                setNoteDrafts((current) => ({
                                  ...current,
                                  [flag.id]: event.target.value
                                }))
                              }
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {FLAG_STATUSES.map((status) => {
                              const current = flag.status === status;
                              return (
                                <button
                                  key={status}
                                  type="button"
                                  disabled={saving || current}
                                  onClick={() => triage(engagement.id, flag, status)}
                                  className={
                                    current
                                      ? "rounded-full bg-ink px-4 py-2.5 text-xs font-bold text-white opacity-50"
                                      : "rounded-full border border-slate-200 bg-canvas px-4 py-2.5 text-xs font-bold text-ink transition hover:border-ink/40 disabled:opacity-50"
                                  }
                                >
                                  {saving ? "..." : status}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              {/* Industry context for every benchmark metric, whether or not a
                  rule fired. Without this the distribution is invisible unless
                  the company happens to breach a quartile. */}
              {engagement.industryContext.length > 0 ? (
                <div className={CARD}>
                  <p className="text-sm font-bold text-ink">
                    Industry context ({engagement.industryContext[0].periodLabel})
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Where this company sits on the seeded distribution, whether or not a rule fired.
                  </p>
                  <div className="mt-4 space-y-3">
                    {engagement.industryContext.map((context) => (
                      <BenchmarkStrip key={context.metricCode} data={context} />
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Underlying figures, collapsed by default: the findings are the
                  screen, the statement is the evidence behind them. */}
              <details className={CARD}>
                <summary className="cursor-pointer text-sm font-bold text-ink">
                  Income statement ({engagement.periods.length} period
                  {engagement.periods.length === 1 ? "" : "s"}, {scale})
                </summary>

                <div className="mt-5 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className={COLUMN_HEAD}>Line item</th>
                        {engagement.periods.map((period) => (
                          <th key={period.id} className={`${COLUMN_HEAD} text-right`}>
                            {period.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {codes.map((code) => {
                        const derived = isDerivedRow(code);
                        return (
                          <tr
                            key={code}
                            className={`border-t border-slate-100 ${derived ? "bg-canvas" : ""}`}
                          >
                            <td
                              className={`px-4 py-2.5 ${derived ? "font-bold text-ink" : "text-muted"}`}
                            >
                              {lineItemLabel(code)}
                            </td>
                            {engagement.periods.map((period) => {
                              const item = period.lineItems.find((entry) => entry.code === code);
                              return (
                                <td
                                  key={period.id}
                                  className={`px-4 py-2.5 text-right tabular-nums ${
                                    derived ? "font-bold text-ink" : "text-text"
                                  }`}
                                >
                                  {item ? formatMoney(item.valueMinor, engagement.unitScale) : ""}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          </PageShell>
        );
      })}
    </div>
  );
}
