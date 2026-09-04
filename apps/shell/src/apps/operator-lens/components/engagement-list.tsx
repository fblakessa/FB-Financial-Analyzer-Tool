"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PageShell } from "@ssa/ui/page-shell";

// The module's index: every analysis in this project, with enough on each row
// to decide which one to open. Visual language follows Sample Tracker.

type FlagCounts = { total: number; high: number; medium: number; low: number };

type Engagement = {
  id: string;
  name: string;
  companyName: string;
  industryCode: string;
  sizeBand: string;
  status: string;
  createdAt: string;
  flagCounts: FlagCounts;
  periods: { id: string; label: string; ordinal: number }[];
};

const CARD = "rounded-[28px] bg-card p-6 shadow-ambient ring-1 ring-slate-200/70";
const COLUMN_HEAD = "px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-outline";
const PILL = "rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ring-1";
const PRIMARY_BUTTON =
  "rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90";

const SEVERITY_PILL: Record<string, string> = {
  high: "bg-red-50 text-red-700 ring-red-200",
  medium: "bg-amber-50 text-amber-700 ring-amber-200",
  low: "bg-slate-100 text-slate-600 ring-slate-200"
};

export function EngagementList({ projectId }: { projectId: string }) {
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const basePath = `/apps/operator-lens/projects/${encodeURIComponent(projectId)}/operator-lens`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/apps/operator-lens/projects/${encodeURIComponent(projectId)}/engagements`,
        { cache: "no-store" }
      );
      if (!response.ok) throw new Error("Could not load analyses.");
      const payload = (await response.json()) as { engagements: Engagement[] };
      setEngagements(payload.engagements);
      setError(null);
    } catch {
      setError("Could not load analyses.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageShell
      eyebrow="Operator Lens"
      title="Analyses"
      description="Each analysis turns one company's income statement into a triaged list of operational findings, compared against its own history and a sourced industry benchmark."
    >
      <div className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-bold text-ink">
            {loading ? "Loading..." : `${engagements.length} analysis${engagements.length === 1 ? "" : "es"}`}
          </p>
          <Link href={`${basePath}/new`} className={PRIMARY_BUTTON}>
            New analysis
          </Link>
        </div>

        {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}

        {!loading && !error && engagements.length === 0 ? (
          // Empty state: say what this screen is for and what to do next,
          // rather than just "nothing here".
          <div className="mt-6 rounded-2xl bg-canvas p-6">
            <p className="text-sm font-bold text-ink">No analyses yet</p>
            <p className="mt-1 text-sm leading-6 text-muted">
              Start with{" "}
              <Link href={`${basePath}/new`} className="font-semibold text-ink underline">
                New analysis
              </Link>
              , the button above right.
            </p>
            <ol className="mt-3 space-y-2 text-sm leading-6 text-muted">
              <li>
                1. Choose <strong className="text-ink">New analysis</strong> and download the input
                workbook.
              </li>
              <li>2. Fill in the Company and Income Statement sheets, one to eight periods.</li>
              <li>
                3. Upload it. Every figure is checked before anything is saved, then the rules run
                and the findings appear here.
              </li>
            </ol>
          </div>
        ) : null}

        {engagements.length > 0 ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left">
                  <th className={COLUMN_HEAD}>Company</th>
                  <th className={COLUMN_HEAD}>Industry</th>
                  <th className={COLUMN_HEAD}>Periods</th>
                  <th className={COLUMN_HEAD}>Findings</th>
                  <th className={COLUMN_HEAD}>Created</th>
                </tr>
              </thead>
              <tbody>
                {engagements.map((engagement) => {
                  const periods = [...engagement.periods].sort((a, b) => a.ordinal - b.ordinal);
                  const range =
                    periods.length > 0
                      ? `${periods[0].label} to ${periods[periods.length - 1].label}`
                      : "None";
                  return (
                    <tr key={engagement.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <Link
                          href={`${basePath}/${encodeURIComponent(engagement.id)}`}
                          className="font-semibold text-ink underline decoration-slate-300 hover:decoration-ink"
                        >
                          {engagement.companyName}
                        </Link>
                        <p className="text-xs text-outline">{engagement.name}</p>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {engagement.industryCode}
                        <p className="text-xs text-outline">{engagement.sizeBand}</p>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {periods.length}
                        <p className="text-xs text-outline">{range}</p>
                      </td>
                      <td className="px-4 py-3">
                        {engagement.flagCounts.total === 0 ? (
                          <span className="text-muted">None</span>
                        ) : (
                          <span className="flex flex-wrap gap-1.5">
                            {(["high", "medium", "low"] as const)
                              .filter((key) => engagement.flagCounts[key] > 0)
                              .map((key) => (
                                <span key={key} className={`${PILL} ${SEVERITY_PILL[key]}`}>
                                  {engagement.flagCounts[key]} {key}
                                </span>
                              ))}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted">
                        {engagement.createdAt.slice(0, 10)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
