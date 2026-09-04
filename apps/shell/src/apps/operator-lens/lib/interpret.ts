// Display-layer interpretation: turning flags and benchmark positions into
// plain language. Pure — no React, no Prisma, no clock, no network, no model.
//
// Nothing here decides whether a flag fires, its severity, or its ordering
// within the engine. It reads engine output and describes it, so the
// determinism contract is untouched.

import { RULES_BY_ID, SCORECARD_CATEGORY_LABEL, type ScorecardCategory } from "./ruleset";
import type { CoverageGap } from "./scorecard";

// ---------------------------------------------------------------------------
// Benchmark interpretation
// ---------------------------------------------------------------------------

export type BenchmarkVerdict = "GOOD" | "WATCH" | "CONCERN";

// Which way is up. A high gross margin is good; a high SG&A ratio is not.
// Without this a strip would call a cost problem a strength.
const HIGHER_IS_BETTER: Record<string, boolean> = {
  GROSS_MARGIN: true,
  EBITDA_MARGIN: true,
  SGA_PCT_REVENUE: false
};

const METRIC_LABEL: Record<string, string> = {
  GROSS_MARGIN: "Gross margin",
  SGA_PCT_REVENUE: "SG&A as a percent of revenue",
  EBITDA_MARGIN: "EBITDA margin"
};

export const VERDICT_LABEL: Record<BenchmarkVerdict, string> = {
  GOOD: "Good",
  WATCH: "Watch",
  CONCERN: "Concern"
};

export type BenchmarkInterpretation = {
  verdict: BenchmarkVerdict;
  verdictLabel: string;
  sentence: string;
};

// `percentilePosition` is the engine's interpolated position, clamped to
// 10..90 by percentilePosition(). Boundaries are strict: sitting exactly on
// P25 or P75 is not "outside" the quartile, so it is not a Concern.
export function interpretBenchmark(
  metricCode: string,
  percentilePosition: number
): BenchmarkInterpretation {
  const higherIsBetter = HIGHER_IS_BETTER[metricCode] ?? true;

  // Normalise to "how favourable is this position", so one set of bands
  // covers both directions.
  const favourable = higherIsBetter ? percentilePosition : 100 - percentilePosition;

  let verdict: BenchmarkVerdict;
  let sentence: string;

  if (favourable < 25) {
    verdict = "CONCERN";
    sentence = higherIsBetter
      ? "Below the peer lower quartile. This is a level problem, not only a trend."
      : "Above the peer upper quartile. This is a level problem, not only a trend.";
  } else if (favourable > 75) {
    verdict = "GOOD";
    sentence = higherIsBetter
      ? "Above the peer upper quartile. A strength on level."
      : "Below the peer lower quartile. A strength on level.";
  } else if (favourable < 50) {
    verdict = "WATCH";
    sentence = higherIsBetter
      ? "Below the peer median but inside the middle half. Worth watching."
      : "Above the peer median but inside the middle half. Worth watching.";
  } else {
    verdict = "GOOD";
    sentence = "In line with peers. Not a concern on level, see the trend findings.";
  }

  return { verdict, verdictLabel: VERDICT_LABEL[verdict], sentence };
}

export function metricLabel(metricCode: string): string {
  return METRIC_LABEL[metricCode] ?? metricCode;
}

// ---------------------------------------------------------------------------
// Ordering: most recent period first, then severity
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const AXIS_RANK: Record<string, number> = { BENCHMARK: 0, TREND: 1, COHERENCE: 2 };

export type OrderableFlag = {
  ruleId: string;
  axis: string;
  severity: string;
  title: string;
  computedValues: string;
};

// A flag records the periods it used inside computedValues, under varying keys
// (`period`, `periodFrom`/`periodTo`, or a `periods` array). Rather than
// knowing each rule's shape, scan every string value for something that
// matches a period label and take the latest. Unknown shapes fall back to -1,
// which sorts last rather than throwing.
export function latestPeriodIndex(computedValues: string, periodLabels: string[]): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(computedValues);
  } catch {
    return -1;
  }

  let best = -1;
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      const index = periodLabels.indexOf(value);
      if (index > best) best = index;
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(visit);
    }
  };
  visit(parsed);
  return best;
}

// The earliest period a flag touches. Used only to break ties: two findings
// that both end in the latest period are not equally current if one reaches
// back three periods and the other two.
export function earliestPeriodIndex(computedValues: string, periodLabels: string[]): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(computedValues);
  } catch {
    return -1;
  }

  let best = Number.POSITIVE_INFINITY;
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      const index = periodLabels.indexOf(value);
      if (index !== -1 && index < best) best = index;
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(visit);
    }
  };
  visit(parsed);
  return best === Number.POSITIVE_INFINITY ? -1 : best;
}

// An operator cares about the current cycle before the prior one, so the most
// recent period leads, then severity within it.
//
// The third key is the earliest period, descending: among equally severe
// findings that both end in the latest period, the one confined to the recent
// window comes before one that stretches back further. Without it the tie fell
// to rule id, which reads as arbitrary on screen because a finding titled
// "FY2023 to FY2025" appears above one titled "FY2025 vs FY2024".
export function sortFindings<T extends OrderableFlag>(flags: T[], periodLabels: string[]): T[] {
  const latest = new Map(
    flags.map((flag) => [flag, latestPeriodIndex(flag.computedValues, periodLabels)])
  );
  const earliest = new Map(
    flags.map((flag) => [flag, earliestPeriodIndex(flag.computedValues, periodLabels)])
  );

  return [...flags].sort(
    (a, b) =>
      (latest.get(b) ?? -1) - (latest.get(a) ?? -1) ||
      (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
      (earliest.get(b) ?? -1) - (earliest.get(a) ?? -1) ||
      (AXIS_RANK[a.axis] ?? 9) - (AXIS_RANK[b.axis] ?? 9) ||
      a.ruleId.localeCompare(b.ruleId) ||
      a.title.localeCompare(b.title)
  );
}

export type FindingGroup<T> = {
  // The period the group sorts on, or null for findings with no period.
  periodLabel: string | null;
  periodIndex: number;
  flags: T[];
};

// Group by the period each finding sorts on, newest group first, so the
// ordering rule is visible on screen instead of implied.
export function groupFindingsByPeriod<T extends OrderableFlag>(
  flags: T[],
  periodLabels: string[]
): FindingGroup<T>[] {
  const sorted = sortFindings(flags, periodLabels);
  const groups: FindingGroup<T>[] = [];

  for (const flag of sorted) {
    const index = latestPeriodIndex(flag.computedValues, periodLabels);
    const last = groups[groups.length - 1];
    if (last && last.periodIndex === index) {
      last.flags.push(flag);
      continue;
    }
    groups.push({
      periodLabel: index === -1 ? null : periodLabels[index],
      periodIndex: index,
      flags: [flag]
    });
  }

  return groups;
}

// ---------------------------------------------------------------------------
// One-line summary
// ---------------------------------------------------------------------------

export type SummarisableFlag = {
  ruleId: string;
  axis: string;
  severity: string;
};

export type FindingsSummaryInput = {
  companyName: string;
  flags: SummarisableFlag[];
  periodCount: number;
  ruleCount: number;
  coverageGapCount: number;
};

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = key(item);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

// One sentence an operator can read before anything else: how much fired, where
// it clusters, and whether the problem is the level of the business or its
// direction. Derived from the flags alone.
export function summariseFindings(input: FindingsSummaryInput): string {
  const { flags } = input;
  const ran = input.ruleCount - input.coverageGapCount;

  if (flags.length === 0) {
    return `No findings. All ${ran} of ${input.ruleCount} rules that could run against ${input.periodCount} period${input.periodCount === 1 ? "" : "s"} passed.`;
  }

  const bySeverity = countBy(flags, (flag) => flag.severity);
  const severityText = (["HIGH", "MEDIUM", "LOW"] as const)
    .filter((severity) => bySeverity[severity])
    .map((severity) => `${bySeverity[severity]} ${severity.toLowerCase()}`)
    .join(", ");

  const byCategory = countBy(flags, (flag) => RULES_BY_ID[flag.ruleId]?.category ?? "OTHER");
  const dominant = Object.entries(byCategory).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  )[0];
  const dominantLabel =
    SCORECARD_CATEGORY_LABEL[dominant[0] as ScorecardCategory] ?? "uncategorised rules";

  const byAxis = countBy(flags, (flag) => flag.axis);
  const benchmark = byAxis.BENCHMARK ?? 0;
  const trend = byAxis.TREND ?? 0;
  const coherence = byAxis.COHERENCE ?? 0;

  let shape: string;
  if (coherence > 0 && benchmark === 0 && trend === 0) {
    shape = "The statement does not reconcile, so treat every figure on it as unconfirmed";
  } else if (benchmark > 0 && trend === 0) {
    shape = "The problem is the level of the business rather than its direction";
  } else if (trend > 0 && benchmark === 0) {
    shape = "The problem is the direction of travel rather than the level, since no benchmark rule fired";
  } else if (benchmark > 0 && trend > 0) {
    shape = "Both the level and the direction of travel are affected";
  } else {
    shape = "No level or trend rule fired";
  }

  const coherenceNote =
    coherence > 0 && (benchmark > 0 || trend > 0)
      ? ", and the statement does not reconcile"
      : "";

  return `${flags.length} finding${flags.length === 1 ? "" : "s"} on ${input.companyName}: ${severityText}. Most sit in ${dominantLabel} (${dominant[1]} of ${flags.length}). ${shape}${coherenceNote}.`;
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

// "T-02 needs 3 periods, this analysis has 2." A skipped rule must never read
// as a pass, so the reason travels with the rule id.
export function describeCoverageGap(gap: CoverageGap): string {
  return `${gap.ruleId} ${gap.detail}.`;
}

// What was actually checked, for an engagement where nothing fired.
export function describeCoverage(input: {
  ruleCount: number;
  gapCount: number;
  periodCount: number;
}): string {
  const ran = input.ruleCount - input.gapCount;
  const periods = `${input.periodCount} period${input.periodCount === 1 ? "" : "s"}`;
  if (input.gapCount === 0) {
    return `All ${input.ruleCount} rules ran against ${periods}.`;
  }
  return `${ran} of ${input.ruleCount} rules ran against ${periods}. ${input.gapCount} could not run.`;
}
