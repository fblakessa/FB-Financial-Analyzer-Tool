"use client";

import { interpretBenchmark, metricLabel } from "../lib/interpret";

// The industry context strip (SPEC §8.3a). Shows the whole P10-P90
// distribution with a marker for where this company sits, never a pass/fail,
// and always renders the source, as-of date and sample size directly beneath
// it. An unsourced benchmark on screen is a bug.

export type BenchmarkStripData = {
  metricCode: string;
  industryCode: string;
  sizeBand: string;
  p10Bps: number;
  p25Bps: number;
  p50Bps: number;
  p75Bps: number;
  p90Bps: number;
  companyValueBps: number;
  percentilePosition: number;
  source: string;
  asOfDate: string;
  sampleSize: number;
};

// Verdict styling only. Which verdict applies is decided by the pure
// interpretBenchmark(), so the wording cannot drift between strips.
const VERDICT_STYLE: Record<string, string> = {
  GOOD: "bg-teal/10 text-teal ring-teal/30",
  WATCH: "bg-amber-50 text-amber-700 ring-amber-200",
  CONCERN: "bg-red-50 text-red-700 ring-red-200"
};

function pct(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

function ordinal(position: number): string {
  const suffix =
    position % 10 === 1 && position % 100 !== 11
      ? "st"
      : position % 10 === 2 && position % 100 !== 12
        ? "nd"
        : position % 10 === 3 && position % 100 !== 13
          ? "rd"
          : "th";
  return `${position}${suffix}`;
}

export function BenchmarkStrip({ data }: { data: BenchmarkStripData }) {
  const interpretation = interpretBenchmark(data.metricCode, data.percentilePosition);
  const points = [
    { label: "P10", bps: data.p10Bps },
    { label: "P25", bps: data.p25Bps },
    { label: "Median", bps: data.p50Bps },
    { label: "P75", bps: data.p75Bps },
    { label: "P90", bps: data.p90Bps }
  ];

  // Scale the bar to the published range, widened to include the company if it
  // sits outside P10-P90, so the marker is always on the bar.
  const low = Math.min(data.p10Bps, data.companyValueBps);
  const high = Math.max(data.p90Bps, data.companyValueBps);
  const span = high - low || 1;
  const offset = (bps: number) => ((bps - low) / span) * 100;

  return (
    <div className="rounded-2xl bg-canvas p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-outline">
          {metricLabel(data.metricCode)}
        </p>
        <p className="text-sm font-bold text-ink">{pct(data.companyValueBps)}</p>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ${
            VERDICT_STYLE[interpretation.verdict] ?? VERDICT_STYLE.WATCH
          }`}
        >
          {interpretation.verdictLabel}
        </span>
        <p className="text-xs text-muted">
          {data.industryCode} · {data.sizeBand} · roughly the {ordinal(data.percentilePosition)}{" "}
          percentile
        </p>
      </div>

      {/* What the percentile means, in words. Derived from the position and the
          metric's direction, so a low SG&A ratio reads as a strength and a low
          gross margin does not. */}
      <p className="mt-1.5 text-sm leading-6 text-text">{interpretation.sentence}</p>

      {/* Distribution bar: quartile band shaded, median marked, company marked. */}
      <div className="relative mt-4 h-2 rounded-full bg-slate-200">
        <div
          className="absolute inset-y-0 rounded-full bg-slate-300"
          style={{ left: `${offset(data.p25Bps)}%`, right: `${100 - offset(data.p75Bps)}%` }}
        />
        <div
          className="absolute inset-y-[-3px] w-px bg-outline"
          style={{ left: `${offset(data.p50Bps)}%` }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-white"
          style={{ left: `${offset(data.companyValueBps)}%` }}
          aria-label={`This company: ${pct(data.companyValueBps)}`}
        />
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        {points.map((point) => (
          <div key={point.label} className="flex gap-1.5 text-xs">
            <dt className="text-outline">{point.label}</dt>
            <dd className="font-semibold tabular-nums text-text">{pct(point.bps)}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 border-t border-slate-200 pt-2 text-[11px] leading-5 text-outline">
        Source: {data.source} As of {data.asOfDate.slice(0, 10)}. n = {data.sampleSize}.
      </p>
    </div>
  );
}
