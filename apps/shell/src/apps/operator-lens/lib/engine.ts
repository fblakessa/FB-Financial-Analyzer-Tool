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

export type SkippedRule = { ruleId: string; minPeriods: number; periodCount: number };

export type EngineResult = {
  rulesetVersion: string;
  flags: Flag[];
  // Reported so the UI can show reduced coverage rather than implying a pass.
  skipped: SkippedRule[];
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
  computed: Record<string, unknown>
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
    benchmarkRef: null
  };
}

export function analyse(figures: EngineFigures): EngineResult {
  const periods = [...figures.periods].sort((a, b) => a.ordinal - b.ordinal);
  const periodCount = periods.length;
  const flags: Flag[] = [];
  const skipped: SkippedRule[] = [];

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

  return { rulesetVersion: RULESET_VERSION, flags, skipped };
}
