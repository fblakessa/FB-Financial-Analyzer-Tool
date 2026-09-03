// The scorecard (SPEC §8.5). A view over the same flags, not a second
// analysis: it reads flag severity and triage status and nothing else. Pure —
// no React, no Prisma, no clock, no network.
//
// Skipped and unbenchmarked rules are reported as reduced coverage rather than
// scored as clean, so a one-period upload cannot masquerade as a healthy
// company.

import {
  RULES,
  RULES_BY_ID,
  SCORECARD_CATEGORIES,
  SCORECARD_CATEGORY_LABEL,
  type RuleSeverity,
  type ScorecardCategory
} from "./ruleset";

const STARTING_SCORE = 100;
const FLOOR = 0;

const DEDUCTION_BY_SEVERITY: Record<RuleSeverity, number> = {
  HIGH: 25,
  MEDIUM: 10,
  LOW: 5
};

// SPEC §8.5 deducts for open and escalated flags. Dismissed flags are excluded
// from the maths, and reviewed flags are not deducted either: the operator has
// looked and not escalated, so the score reflects what is still outstanding.
const DEDUCTING_STATUSES = ["OPEN", "ESCALATED"] as const;

export type ScoredFlag = {
  ruleId: string;
  severity: string;
  status: string;
};

export type CoverageGap = {
  ruleId: string;
  reason: "SKIPPED" | "UNBENCHMARKED";
  // Why it could not run, in the operator's terms.
  detail: string;
};

export type CategoryScore = {
  category: ScorecardCategory;
  label: string;
  score: number;
  // Flags that pulled the score down, and by how much.
  deductions: { ruleId: string; severity: string; points: number }[];
  // Counted, plus what was set aside and why.
  deductedFlagCount: number;
  dismissedFlagCount: number;
  reviewedFlagCount: number;
  // Rules in this category that could not run. A category with gaps is not a
  // clean bill of health, however high the number is.
  coverageGaps: CoverageGap[];
  rulesInCategory: number;
};

export type Scorecard = {
  categories: CategoryScore[];
  // True when any category has a coverage gap, so the UI can say so once.
  hasCoverageGaps: boolean;
};

export type ScorecardInput = {
  flags: ScoredFlag[];
  skipped?: { ruleId: string; minPeriods: number; periodCount: number }[];
  unbenchmarked?: { ruleId: string; metricCode: string }[];
};

function categoryOf(ruleId: string): ScorecardCategory | null {
  return RULES_BY_ID[ruleId]?.category ?? null;
}

export function buildScorecard(input: ScorecardInput): Scorecard {
  const categories = SCORECARD_CATEGORIES.map<CategoryScore>((category) => {
    const rulesInCategory = RULES.filter((rule) => rule.category === category);
    const flags = input.flags.filter((flag) => categoryOf(flag.ruleId) === category);

    const deducting = flags.filter((flag) =>
      (DEDUCTING_STATUSES as readonly string[]).includes(flag.status)
    );

    const deductions = deducting
      .map((flag) => ({
        ruleId: flag.ruleId,
        severity: flag.severity,
        points: DEDUCTION_BY_SEVERITY[flag.severity as RuleSeverity] ?? 0
      }))
      // Deterministic order: heaviest first, then rule id.
      .sort((a, b) => b.points - a.points || a.ruleId.localeCompare(b.ruleId));

    const total = deductions.reduce((sum, entry) => sum + entry.points, 0);

    const coverageGaps: CoverageGap[] = [
      ...(input.skipped ?? [])
        .filter((entry) => categoryOf(entry.ruleId) === category)
        .map<CoverageGap>((entry) => ({
          ruleId: entry.ruleId,
          reason: "SKIPPED",
          detail: `needs ${entry.minPeriods} periods, this analysis has ${entry.periodCount}`
        })),
      ...(input.unbenchmarked ?? [])
        .filter((entry) => categoryOf(entry.ruleId) === category)
        .map<CoverageGap>((entry) => ({
          ruleId: entry.ruleId,
          reason: "UNBENCHMARKED",
          detail: `no seeded benchmark for ${entry.metricCode} in this industry and size band`
        }))
    ].sort((a, b) => a.ruleId.localeCompare(b.ruleId));

    return {
      category,
      label: SCORECARD_CATEGORY_LABEL[category],
      score: Math.max(FLOOR, STARTING_SCORE - total),
      deductions,
      deductedFlagCount: deducting.length,
      dismissedFlagCount: flags.filter((flag) => flag.status === "DISMISSED").length,
      reviewedFlagCount: flags.filter((flag) => flag.status === "REVIEWED").length,
      coverageGaps,
      rulesInCategory: rulesInCategory.length
    };
  });

  return {
    categories,
    hasCoverageGaps: categories.some((entry) => entry.coverageGaps.length > 0)
  };
}

// Which built rules could not run, given the shape of this analysis. Mirrors
// what the engine reports at analysis time, so the scorecard can show reduced
// coverage for engagements whose engine result was not retained.
export function coverageFor(options: {
  periodCount: number;
  benchmarkMetricCodes: string[];
}): {
  skipped: { ruleId: string; minPeriods: number; periodCount: number }[];
  unbenchmarked: { ruleId: string; metricCode: string }[];
} {
  const BENCHMARK_METRIC_BY_RULE: Record<string, string> = {
    "B-01": "GROSS_MARGIN",
    "B-02": "SGA_PCT_REVENUE",
    "B-03": "EBITDA_MARGIN"
  };

  const skipped = RULES.filter((rule) => options.periodCount < rule.minPeriods)
    .map((rule) => ({
      ruleId: rule.id,
      minPeriods: rule.minPeriods,
      periodCount: options.periodCount
    }))
    .sort((a, b) => a.ruleId.localeCompare(b.ruleId));

  const unbenchmarked = Object.entries(BENCHMARK_METRIC_BY_RULE)
    .filter(([ruleId, metricCode]) => {
      const rule = RULES_BY_ID[ruleId];
      if (!rule || options.periodCount < rule.minPeriods) return false;
      return !options.benchmarkMetricCodes.includes(metricCode);
    })
    .map(([ruleId, metricCode]) => ({ ruleId, metricCode }))
    .sort((a, b) => a.ruleId.localeCompare(b.ruleId));

  return { skipped, unbenchmarked };
}
