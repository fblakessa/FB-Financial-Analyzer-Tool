import { describe, expect, it } from "vitest";

import { buildScorecard, coverageFor, type ScoredFlag } from "./scorecard";
import { RULES, SCORECARD_CATEGORIES } from "./ruleset";

function scoreOf(flags: ScoredFlag[], category: string): number {
  const card = buildScorecard({ flags });
  return card.categories.find((entry) => entry.category === category)?.score ?? -1;
}

describe("buildScorecard", () => {
  it("returns the four categories in a fixed order", () => {
    const card = buildScorecard({ flags: [] });
    expect(card.categories.map((entry) => entry.category)).toEqual(SCORECARD_CATEGORIES);
    expect(card.categories.map((entry) => entry.label)).toEqual([
      "Profitability",
      "Cost Structure",
      "Growth",
      "Data Quality"
    ]);
  });

  it("starts every category at 100 with no flags", () => {
    const card = buildScorecard({ flags: [] });
    expect(card.categories.every((entry) => entry.score === 100)).toBe(true);
  });

  it("deducts 25 for an open HIGH", () => {
    // T-02 is a Profitability rule.
    expect(scoreOf([{ ruleId: "T-02", severity: "HIGH", status: "OPEN" }], "PROFITABILITY")).toBe(75);
  });

  it("deducts 10 for an open MEDIUM", () => {
    // T-03 is a Growth rule.
    expect(scoreOf([{ ruleId: "T-03", severity: "MEDIUM", status: "OPEN" }], "GROWTH")).toBe(90);
  });

  it("deducts 5 for an open LOW", () => {
    expect(scoreOf([{ ruleId: "T-03", severity: "LOW", status: "OPEN" }], "GROWTH")).toBe(95);
  });

  it("deducts for an escalated flag as well as an open one", () => {
    expect(
      scoreOf([{ ruleId: "T-02", severity: "HIGH", status: "ESCALATED" }], "PROFITABILITY")
    ).toBe(75);
  });

  it("dismissing a HIGH raises its category by exactly 25", () => {
    const open: ScoredFlag[] = [
      { ruleId: "T-02", severity: "HIGH", status: "OPEN" },
      { ruleId: "T-05", severity: "HIGH", status: "OPEN" }
    ];
    const before = scoreOf(open, "PROFITABILITY");

    const dismissed: ScoredFlag[] = [
      { ruleId: "T-02", severity: "HIGH", status: "DISMISSED" },
      { ruleId: "T-05", severity: "HIGH", status: "OPEN" }
    ];
    const after = scoreOf(dismissed, "PROFITABILITY");

    expect(before).toBe(50);
    expect(after).toBe(75);
    expect(after - before).toBe(25);
  });

  it("excludes dismissed flags from the maths and counts them separately", () => {
    const card = buildScorecard({
      flags: [{ ruleId: "T-02", severity: "HIGH", status: "DISMISSED" }]
    });
    const profitability = card.categories.find((entry) => entry.category === "PROFITABILITY");
    expect(profitability?.score).toBe(100);
    expect(profitability?.dismissedFlagCount).toBe(1);
    expect(profitability?.deductedFlagCount).toBe(0);
  });

  it("does not deduct for a reviewed flag but records it", () => {
    const card = buildScorecard({
      flags: [{ ruleId: "T-02", severity: "HIGH", status: "REVIEWED" }]
    });
    const profitability = card.categories.find((entry) => entry.category === "PROFITABILITY");
    expect(profitability?.score).toBe(100);
    expect(profitability?.reviewedFlagCount).toBe(1);
  });

  it("floors at 0 rather than going negative", () => {
    const many: ScoredFlag[] = Array.from({ length: 6 }, () => ({
      ruleId: "T-02",
      severity: "HIGH",
      status: "OPEN"
    }));
    expect(scoreOf(many, "PROFITABILITY")).toBe(0);
  });

  it("scores each category independently", () => {
    const card = buildScorecard({
      flags: [
        { ruleId: "T-02", severity: "HIGH", status: "OPEN" },
        { ruleId: "T-01", severity: "HIGH", status: "OPEN" },
        { ruleId: "C-01", severity: "HIGH", status: "OPEN" }
      ]
    });
    const byCategory = Object.fromEntries(
      card.categories.map((entry) => [entry.category, entry.score])
    );
    expect(byCategory).toEqual({
      PROFITABILITY: 75,
      COST_STRUCTURE: 75,
      GROWTH: 100,
      DATA_QUALITY: 75
    });
  });

  it("reports skipped rules as coverage gaps rather than scoring them clean", () => {
    const card = buildScorecard({
      flags: [],
      skipped: [{ ruleId: "T-02", minPeriods: 3, periodCount: 1 }]
    });
    const profitability = card.categories.find((entry) => entry.category === "PROFITABILITY");
    expect(profitability?.score).toBe(100);
    expect(profitability?.coverageGaps).toEqual([
      { ruleId: "T-02", reason: "SKIPPED", detail: "needs 3 periods, this analysis has 1" }
    ]);
    expect(card.hasCoverageGaps).toBe(true);
  });

  it("reports unbenchmarked rules as coverage gaps", () => {
    const card = buildScorecard({
      flags: [],
      unbenchmarked: [{ ruleId: "B-01", metricCode: "GROSS_MARGIN" }]
    });
    const profitability = card.categories.find((entry) => entry.category === "PROFITABILITY");
    expect(profitability?.coverageGaps[0]).toMatchObject({
      ruleId: "B-01",
      reason: "UNBENCHMARKED"
    });
    expect(card.hasCoverageGaps).toBe(true);
  });

  it("has no coverage gaps when nothing was skipped", () => {
    expect(buildScorecard({ flags: [] }).hasCoverageGaps).toBe(false);
  });

  it("ignores a flag whose rule id is not in the ruleset", () => {
    const card = buildScorecard({
      flags: [{ ruleId: "X-99", severity: "HIGH", status: "OPEN" }]
    });
    expect(card.categories.every((entry) => entry.score === 100)).toBe(true);
  });

  it("assigns every built rule to a category", () => {
    const card = buildScorecard({ flags: [] });
    const counted = card.categories.reduce((sum, entry) => sum + entry.rulesInCategory, 0);
    expect(counted).toBe(RULES.length);
  });
});

describe("coverageFor", () => {
  const ALL_METRICS = ["GROSS_MARGIN", "SGA_PCT_REVENUE", "EBITDA_MARGIN"];

  it("skips the multi-period rules on a single period", () => {
    const { skipped } = coverageFor({ periodCount: 1, benchmarkMetricCodes: ALL_METRICS });
    expect(skipped.map((entry) => entry.ruleId)).toEqual(["T-01", "T-02", "T-03", "T-04", "T-05"]);
  });

  it("skips only the three-period rules on two periods", () => {
    const { skipped } = coverageFor({ periodCount: 2, benchmarkMetricCodes: ALL_METRICS });
    expect(skipped.map((entry) => entry.ruleId)).toEqual(["T-02", "T-03"]);
  });

  it("skips nothing on three periods with full benchmark coverage", () => {
    const result = coverageFor({ periodCount: 3, benchmarkMetricCodes: ALL_METRICS });
    expect(result.skipped).toEqual([]);
    expect(result.unbenchmarked).toEqual([]);
  });

  it("reports every benchmark rule as unbenchmarked when nothing is seeded", () => {
    const { unbenchmarked } = coverageFor({ periodCount: 3, benchmarkMetricCodes: [] });
    expect(unbenchmarked.map((entry) => entry.ruleId)).toEqual(["B-01", "B-02", "B-03"]);
  });

  it("reports only the metrics that are missing", () => {
    const { unbenchmarked } = coverageFor({
      periodCount: 3,
      benchmarkMetricCodes: ["GROSS_MARGIN"]
    });
    expect(unbenchmarked.map((entry) => entry.ruleId)).toEqual(["B-02", "B-03"]);
  });
});
