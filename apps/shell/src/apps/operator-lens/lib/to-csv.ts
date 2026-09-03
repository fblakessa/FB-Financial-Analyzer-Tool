// CSV export (SPEC §8.7). Pure: no React, no Prisma, no clock, no network, no
// randomness, and deliberately no locale-dependent formatting.
//
// SPEC §9 criterion 14 requires that exporting twice with no intervening
// changes yields byte-identical files. Everything here is therefore derived
// from stored data alone:
//   - no Date.now(), no new Date(): dates arrive as strings the caller read
//     out of the database
//   - no toLocaleString(): grouping separators and decimal marks vary by
//     machine locale, which would break byte-identity across environments
//   - every section is explicitly sorted
//   - line endings are always CRLF, per RFC 4180, regardless of platform

import { lineItemLabel, isDerivedRow, LINE_ITEM_ORDER } from "./line-items";
import type { Scorecard } from "./scorecard";

const EOL = "\r\n";

const UNIT_SCALE_DIVISOR: Record<string, number> = {
  ACTUALS: 100,
  THOUSANDS: 100_000,
  MILLIONS: 100_000_000
};

export type ExportEngagement = {
  name: string;
  companyName: string;
  industryCode: string;
  sizeBand: string;
  currency: string;
  unitScale: string;
  fiscalYearEnd: string;
  status: string;
  rulesetVersion: string;
  benchmarkSetVersion: string;
  figuresConfirmedAt: string | null;
  figuresConfirmedByName: string | null;
  createdByName: string;
  createdAt: string;
};

export type ExportFlag = {
  ruleId: string;
  axis: string;
  severity: string;
  category: string;
  title: string;
  status: string;
  ownerName: string | null;
  note: string | null;
  thresholdBreached: string;
  computedValues: string;
  benchmarkRef: string | null;
  benchmarkSource: string | null;
  benchmarkAsOfDate: string | null;
  benchmarkSampleSize: number | null;
  updatedAt: string;
};

export type ExportFigure = {
  code: string;
  periodLabel: string;
  periodOrdinal: number;
  periodEndDate: string;
  valueMinor: string;
  extractedValueMinor: string | null;
  wasEditedByOperator: boolean;
};

export type ExportBenchmark = {
  setVersion: string;
  industryCode: string;
  sizeBand: string;
  metricCode: string;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  source: string;
  asOfDate: string;
  sampleSize: number;
};

export type ExportPayload = {
  engagement: ExportEngagement;
  scorecard: Scorecard;
  flags: ExportFlag[];
  figures: ExportFigure[];
  benchmarks: ExportBenchmark[];
};

// RFC 4180 quoting: wrap when the value contains a comma, quote, CR or LF, and
// double any embedded quote.
function field(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function row(values: (string | number | boolean | null | undefined)[]): string {
  return values.map(field).join(",");
}

// Fixed decimals, no grouping, so the same number renders identically on every
// machine. toFixed is locale-independent.
function ratio(value: number): string {
  return value.toFixed(4);
}

// Minor units to the operator's entered scale, exactly, without grouping.
function inUnitScale(valueMinor: string, unitScale: string): string {
  const divisor = UNIT_SCALE_DIVISOR[unitScale] ?? 100;
  const scaled = Number(BigInt(valueMinor)) / divisor;
  // Two decimals covers every scale down to cents; trailing zeros are kept so
  // the column width is stable.
  return scaled.toFixed(2);
}

const SEVERITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const AXIS_RANK: Record<string, number> = { BENCHMARK: 0, TREND: 1, COHERENCE: 2 };

function sortedFlags(flags: ExportFlag[]): ExportFlag[] {
  return [...flags].sort(
    (a, b) =>
      (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
      (AXIS_RANK[a.axis] ?? 9) - (AXIS_RANK[b.axis] ?? 9) ||
      a.ruleId.localeCompare(b.ruleId) ||
      a.title.localeCompare(b.title)
  );
}

// Income statement order, then oldest period first. Never alphabetical.
function sortedFigures(figures: ExportFigure[]): ExportFigure[] {
  const rank = (code: string) => {
    const index = LINE_ITEM_ORDER.findIndex((item) => item.code === code);
    return index === -1 ? LINE_ITEM_ORDER.length : index;
  };
  return [...figures].sort(
    (a, b) =>
      rank(a.code) - rank(b.code) ||
      a.code.localeCompare(b.code) ||
      a.periodOrdinal - b.periodOrdinal
  );
}

export function toCsv(payload: ExportPayload): string {
  const { engagement } = payload;
  const lines: string[] = [];

  // Each section is introduced by a SECTION marker row so one file stays
  // machine-parseable despite holding four differently shaped tables.
  lines.push(row(["SECTION", "ENGAGEMENT"]));
  lines.push(row(["field", "value"]));
  const engagementRows: [string, string | null][] = [
    ["analysis_name", engagement.name],
    ["company_name", engagement.companyName],
    ["industry_code", engagement.industryCode],
    ["size_band", engagement.sizeBand],
    ["currency", engagement.currency],
    ["unit_scale", engagement.unitScale],
    ["fiscal_year_end", engagement.fiscalYearEnd],
    ["status", engagement.status],
    ["ruleset_version", engagement.rulesetVersion],
    ["benchmark_set_version", engagement.benchmarkSetVersion],
    ["figures_confirmed_at", engagement.figuresConfirmedAt],
    ["figures_confirmed_by", engagement.figuresConfirmedByName],
    ["created_by", engagement.createdByName],
    ["created_at", engagement.createdAt]
  ];
  for (const [key, value] of engagementRows) lines.push(row([key, value]));

  lines.push("");
  lines.push(row(["SECTION", "SCORECARD"]));
  lines.push(
    row([
      "category",
      "label",
      "score",
      "outstanding_flags",
      "dismissed_flags",
      "reviewed_flags",
      "rules_in_category",
      "coverage_gaps"
    ])
  );
  for (const entry of payload.scorecard.categories) {
    lines.push(
      row([
        entry.category,
        entry.label,
        entry.score,
        entry.deductedFlagCount,
        entry.dismissedFlagCount,
        entry.reviewedFlagCount,
        entry.rulesInCategory,
        entry.coverageGaps.length
      ])
    );
  }

  lines.push("");
  lines.push(row(["SECTION", "SCORECARD_COVERAGE_GAPS"]));
  lines.push(row(["category", "rule_id", "reason", "detail"]));
  for (const entry of payload.scorecard.categories) {
    for (const gap of entry.coverageGaps) {
      lines.push(row([entry.category, gap.ruleId, gap.reason, gap.detail]));
    }
  }

  lines.push("");
  lines.push(row(["SECTION", "FLAGS"]));
  lines.push(
    row([
      "rule_id",
      "axis",
      "severity",
      "category",
      "title",
      "triage_status",
      "owner",
      "note",
      "threshold_breached",
      "computed_values_json",
      "benchmark_ref",
      "benchmark_source",
      "benchmark_as_of_date",
      "benchmark_sample_size",
      "updated_at"
    ])
  );
  for (const flag of sortedFlags(payload.flags)) {
    lines.push(
      row([
        flag.ruleId,
        flag.axis,
        flag.severity,
        flag.category,
        flag.title,
        flag.status,
        flag.ownerName,
        flag.note,
        flag.thresholdBreached,
        flag.computedValues,
        flag.benchmarkRef,
        flag.benchmarkSource,
        flag.benchmarkAsOfDate,
        flag.benchmarkSampleSize,
        flag.updatedAt
      ])
    );
  }

  lines.push("");
  lines.push(row(["SECTION", "FIGURES"]));
  lines.push(
    row([
      "code",
      "line_item",
      "is_derived",
      "period_label",
      "period_end_date",
      "value_minor",
      `value_in_${engagement.unitScale.toLowerCase()}`,
      "extracted_value_minor",
      "was_edited_by_operator"
    ])
  );
  for (const figure of sortedFigures(payload.figures)) {
    lines.push(
      row([
        figure.code,
        lineItemLabel(figure.code),
        isDerivedRow(figure.code),
        figure.periodLabel,
        figure.periodEndDate,
        figure.valueMinor,
        inUnitScale(figure.valueMinor, engagement.unitScale),
        figure.extractedValueMinor,
        figure.wasEditedByOperator
      ])
    );
  }

  lines.push("");
  lines.push(row(["SECTION", "BENCHMARKS"]));
  lines.push(
    row([
      "set_version",
      "industry_code",
      "size_band",
      "metric_code",
      "p10",
      "p25",
      "p50",
      "p75",
      "p90",
      "source",
      "as_of_date",
      "sample_size"
    ])
  );
  for (const stat of [...payload.benchmarks].sort(
    (a, b) => a.metricCode.localeCompare(b.metricCode) || a.setVersion.localeCompare(b.setVersion)
  )) {
    lines.push(
      row([
        stat.setVersion,
        stat.industryCode,
        stat.sizeBand,
        stat.metricCode,
        ratio(stat.p10),
        ratio(stat.p25),
        ratio(stat.p50),
        ratio(stat.p75),
        ratio(stat.p90),
        stat.source,
        stat.asOfDate,
        stat.sampleSize
      ])
    );
  }

  return lines.join(EOL) + EOL;
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "engagement"
  );
}

// Company, as-of date and benchmark set version, per SPEC §8.7. The as-of date
// is the benchmark set's, which is what pairs with the set version; with no
// benchmarks it falls back to the latest period end so the name is still
// dated. Derived from stored data only, so the same export names itself
// identically every time.
export function exportFilename(payload: ExportPayload): string {
  const asOf =
    [...payload.benchmarks].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate)).at(-1)?.asOfDate ??
    [...payload.figures].sort((a, b) => a.periodOrdinal - b.periodOrdinal).at(-1)?.periodEndDate ??
    "undated";

  return [
    "operator-lens",
    slug(payload.engagement.companyName),
    asOf.slice(0, 10),
    slug(payload.engagement.benchmarkSetVersion)
  ].join("_") + ".csv";
}
