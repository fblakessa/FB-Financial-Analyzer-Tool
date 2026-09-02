// The rules engine. Pure: no React, no Prisma, no clock, no network, no
// randomness, and no model call. Given the same confirmed figures and the same
// ruleset version it returns an identical Flag[] in an identical order.

import {
  DERIVED_ROW_CODES,
  disagreementBps,
  growth,
  ratio,
  recalculateDerived,
  toBps,
  type DerivedRowCode,
  type ValueLookup
} from "./metrics";
import { RULES_BY_ID, RULESET_VERSION, type RuleAxis, type RuleSeverity } from "./ruleset";

// Structural input, so the engine works from parsed workbook figures or from
// confirmed figures read back out of the database.
export type EngineFigures = {
  periods: { label: string; ordinal: number }[];
  lineItems: { code: string; valuesMinor: (bigint | null)[] }[];
};

export type Flag = {
  ruleId: string;
  axis: RuleAxis;
  severity: RuleSeverity;
  title: string;
  operatorPrompt: string;
  // JSON string: the figures the rule actually used, so a flag can be
  // re-explained without re-running the engine.
  computedValues: string;
  thresholdBreached: string;
  benchmarkRef: string | null;
};

// A seeded percentile distribution for one industry/size/metric. Passed in
// rather than fetched, so the engine stays pure and the benchmark set used is
// whatever the caller stamped on the engagement.
export type BenchmarkStat = {
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

export type EngineContext = {
  industryCode?: string | null;
  sizeBand?: string | null;
  benchmarks?: BenchmarkStat[];
};

export type SkippedRule = { ruleId: string; minPeriods: number; periodCount: number };

export type UnbenchmarkedRule = { ruleId: string; metricCode: string };

export type EngineResult = {
  rulesetVersion: string;
  flags: Flag[];
  // Reported so the UI can show reduced coverage rather than implying a pass.
  skipped: SkippedRule[];
  // Benchmark rules that had no seeded row for this industry and size band.
  unbenchmarked: UnbenchmarkedRule[];
};

const SEVERITY_ORDER: Record<RuleSeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const AXIS_ORDER: Record<RuleAxis, number> = { BENCHMARK: 0, TREND: 1, COHERENCE: 2 };

function lookupFor(figures: EngineFigures, ordinal: number): ValueLookup {
  return (code) => {
    const item = figures.lineItems.find((candidate) => candidate.code === code);
    if (!item) return null;
    return item.valuesMinor[ordinal] ?? null;
  };
}

function bpsText(bps: number): string {
  return `${bps >= 0 ? "" : "-"}${Math.abs(bps)}bps`;
}

function makeFlag(
  ruleId: string,
  titleSuffix: string,
  computed: Record<string, unknown>,
  benchmarkRef: string | null = null
): Flag {
  const rule = RULES_BY_ID[ruleId];
  return {
    ruleId: rule.id,
    axis: rule.axis,
    severity: rule.severity,
    title: `${rule.title}${titleSuffix}`,
    operatorPrompt: rule.operatorPrompt,
    computedValues: JSON.stringify(computed),
    thresholdBreached: rule.threshold,
    benchmarkRef
  };
}

// Where a company value sits on the seeded distribution, interpolated between
// the five published percentiles. Returned as an integer percentile so the
// strip can render a marker without re-deriving anything.
export function percentilePosition(stat: BenchmarkStat, value: number): number {
  const points: Array<[number, number]> = [
    [stat.p10, 10],
    [stat.p25, 25],
    [stat.p50, 50],
    [stat.p75, 75],
    [stat.p90, 90]
  ];
  if (value <= points[0][0]) return 10;
  if (value >= points[points.length - 1][0]) return 90;
  for (let i = 1; i < points.length; i++) {
    const [lowValue, lowP] = points[i - 1];
    const [highValue, highP] = points[i];
    if (value <= highValue) {
      if (highValue === lowValue) return highP;
      const span = (value - lowValue) / (highValue - lowValue);
      return Math.round(lowP + span * (highP - lowP));
    }
  }
  return 90;
}

export function analyse(figures: EngineFigures, context: EngineContext = {}): EngineResult {
  const periods = [...figures.periods].sort((a, b) => a.ordinal - b.ordinal);
  const periodCount = periods.length;
  const flags: Flag[] = [];
  const skipped: SkippedRule[] = [];
  const unbenchmarked: UnbenchmarkedRule[] = [];

  const get = periods.map((period) => lookupFor(figures, period.ordinal));
  const revenue = (i: number) => get[i]("REVENUE");
  const marginBps = (i: number, numeratorCode: string) => {
    const value = ratio(get[i](numeratorCode), revenue(i));
    return value === null ? null : toBps(value);
  };

  for (const rule of Object.values(RULES_BY_ID)) {
    if (periodCount < rule.minPeriods) {
      skipped.push({ ruleId: rule.id, minPeriods: rule.minPeriods, periodCount });
    }
  }

  // --- B-01 / B-02 / B-03: the seeded percentile distribution -------------
  //
  // Benchmark rules read the most recent period, which is the one a diligence
  // conversation is actually about. Industry and size band are inputs the
  // operator confirmed, never inferred here.
  const benchmarkRules: Array<{
    ruleId: string;
    metricCode: string;
    numeratorCode: string;
    direction: "below_p25" | "above_p75";
  }> = [
    { ruleId: "B-01", metricCode: "GROSS_MARGIN", numeratorCode: "GROSS_PROFIT", direction: "below_p25" },
    { ruleId: "B-02", metricCode: "SGA_PCT_REVENUE", numeratorCode: "SGA_TOTAL", direction: "above_p75" },
    { ruleId: "B-03", metricCode: "EBITDA_MARGIN", numeratorCode: "EBITDA", direction: "below_p25" }
  ];

  const latest = periodCount - 1;
  for (const rule of benchmarkRules) {
    if (periodCount < RULES_BY_ID[rule.ruleId].minPeriods) continue;

    const stat = (context.benchmarks ?? []).find(
      (candidate) =>
        candidate.metricCode === rule.metricCode &&
        candidate.industryCode === context.industryCode &&
        candidate.sizeBand === context.sizeBand
    );
    // No seeded row for this industry and band means no comparison, reported
    // as reduced coverage rather than silently passing.
    if (!stat) {
      unbenchmarked.push({ ruleId: rule.ruleId, metricCode: rule.metricCode });
      continue;
    }

    const value = ratio(get[latest](rule.numeratorCode), revenue(latest));
    if (value === null) continue;

    const fired =
      rule.direction === "below_p25" ? value < stat.p25 : value > stat.p75;
    if (!fired) continue;

    flags.push(
      makeFlag(rule.ruleId, ` (${periods[latest].label})`, {
        period: periods[latest].label,
        metricCode: rule.metricCode,
        companyValueBps: toBps(value),
        comparedAgainst: rule.direction === "below_p25" ? "P25" : "P75",
        thresholdValueBps: toBps(rule.direction === "below_p25" ? stat.p25 : stat.p75),
        percentilePosition: percentilePosition(stat, value),
        // The whole distribution travels with the flag so the strip renders
        // from stored data and cannot drift from what fired.
        benchmark: {
          setVersion: stat.setVersion,
          metricCode: stat.metricCode,
          industryCode: stat.industryCode,
          sizeBand: stat.sizeBand,
          p10Bps: toBps(stat.p10),
          p25Bps: toBps(stat.p25),
          p50Bps: toBps(stat.p50),
          p75Bps: toBps(stat.p75),
          p90Bps: toBps(stat.p90),
          source: stat.source,
          asOfDate: stat.asOfDate,
          sampleSize: stat.sampleSize
        }
      }, `${stat.setVersion}:${stat.metricCode}`)
    );
  }

  // --- T-01 / T-04: cost growth outpacing revenue growth ------------------
  for (let i = 1; i < periodCount; i++) {
    const revenueGrowth = growth(revenue(i - 1), revenue(i));
    if (revenueGrowth === null) continue;
    const revenueGrowthBps = toBps(revenueGrowth);
    const span = ` (${periods[i].label} vs ${periods[i - 1].label})`;

    const pairs: Array<{ ruleId: string; code: string; label: string }> = [
      { ruleId: "T-01", code: "SGA_TOTAL", label: "sgaGrowthBps" },
      { ruleId: "T-04", code: "COGS", label: "cogsGrowthBps" }
    ];

    for (const pair of pairs) {
      if (periodCount < RULES_BY_ID[pair.ruleId].minPeriods) continue;
      const costGrowth = growth(get[i - 1](pair.code), get[i](pair.code));
      if (costGrowth === null) continue;
      const costGrowthBps = toBps(costGrowth);
      const gapBps = costGrowthBps - revenueGrowthBps;
      if (gapBps >= RULES_BY_ID[pair.ruleId].thresholdBps) {
        flags.push(
          makeFlag(pair.ruleId, span, {
            periodFrom: periods[i - 1].label,
            periodTo: periods[i].label,
            revenueGrowthBps,
            [pair.label]: costGrowthBps,
            gapBps,
            gapText: bpsText(gapBps)
          })
        );
      }
    }
  }

  // --- T-02: gross margin compressing in two consecutive periods ----------
  if (periodCount >= RULES_BY_ID["T-02"].minPeriods) {
    for (let i = 2; i < periodCount; i++) {
      const gm = [marginBps(i - 2, "GROSS_PROFIT"), marginBps(i - 1, "GROSS_PROFIT"), marginBps(i, "GROSS_PROFIT")];
      if (gm.some((value) => value === null)) continue;
      const firstDrop = (gm[0] as number) - (gm[1] as number);
      const secondDrop = (gm[1] as number) - (gm[2] as number);
      const threshold = RULES_BY_ID["T-02"].thresholdBps;
      if (firstDrop >= threshold && secondDrop >= threshold) {
        flags.push(
          makeFlag("T-02", ` (${periods[i - 2].label} to ${periods[i].label})`, {
            periods: [periods[i - 2].label, periods[i - 1].label, periods[i].label],
            grossMarginBps: gm,
            firstDropBps: firstDrop,
            secondDropBps: secondDrop
          })
        );
      }
    }
  }

  // --- T-03: revenue growth decelerating ----------------------------------
  if (periodCount >= RULES_BY_ID["T-03"].minPeriods) {
    for (let i = 2; i < periodCount; i++) {
      const previousGrowth = growth(revenue(i - 2), revenue(i - 1));
      const currentGrowth = growth(revenue(i - 1), revenue(i));
      if (previousGrowth === null || currentGrowth === null) continue;
      const previousBps = toBps(previousGrowth);
      const currentBps = toBps(currentGrowth);
      if (currentBps < previousBps) {
        flags.push(
          makeFlag("T-03", ` (${periods[i - 1].label} to ${periods[i].label})`, {
            periods: [periods[i - 2].label, periods[i - 1].label, periods[i].label],
            previousGrowthBps: previousBps,
            currentGrowthBps: currentBps,
            decelerationBps: previousBps - currentBps
          })
        );
      }
    }
  }

  // --- T-05: EBITDA margin falling while revenue grows --------------------
  if (periodCount >= RULES_BY_ID["T-05"].minPeriods) {
    for (let i = 1; i < periodCount; i++) {
      const revenueGrowth = growth(revenue(i - 1), revenue(i));
      const previous = marginBps(i - 1, "EBITDA");
      const current = marginBps(i, "EBITDA");
      if (revenueGrowth === null || previous === null || current === null) continue;
      const revenueGrowthBps = toBps(revenueGrowth);
      const fall = previous - current;
      if (revenueGrowthBps > 0 && fall >= RULES_BY_ID["T-05"].thresholdBps) {
        flags.push(
          makeFlag("T-05", ` (${periods[i].label} vs ${periods[i - 1].label})`, {
            periodFrom: periods[i - 1].label,
            periodTo: periods[i].label,
            revenueGrowthBps,
            ebitdaMarginBps: [previous, current],
            fallBps: fall
          })
        );
      }
    }
  }

  // --- C-01: entered derived rows that do not reconcile -------------------
  for (let i = 0; i < periodCount; i++) {
    for (const code of DERIVED_ROW_CODES) {
      const entered = get[i](code as DerivedRowCode);
      if (entered === null) continue;
      const recalculated = recalculateDerived(code as DerivedRowCode, get[i]);
      if (recalculated === null) continue;
      const gapBps = disagreementBps(entered, recalculated);
      if (gapBps > RULES_BY_ID["C-01"].thresholdBps) {
        flags.push(
          makeFlag("C-01", ` (${code}, ${periods[i].label})`, {
            period: periods[i].label,
            code,
            enteredMinor: entered.toString(),
            recalculatedMinor: recalculated.toString(),
            differenceMinor: (entered - recalculated).toString(),
            differenceBps: gapBps
          })
        );
      }
    }
  }

  // Severity, then axis, then rule id, then title. Fully determined by the
  // input, so the order is reproducible across runs and machines.
  flags.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      AXIS_ORDER[a.axis] - AXIS_ORDER[b.axis] ||
      a.ruleId.localeCompare(b.ruleId) ||
      a.title.localeCompare(b.title)
  );
  skipped.sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  unbenchmarked.sort((a, b) => a.ruleId.localeCompare(b.ruleId));

  return { rulesetVersion: RULESET_VERSION, flags, skipped, unbenchmarked };
}
