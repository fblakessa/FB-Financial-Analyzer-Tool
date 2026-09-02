import { describe, expect, it } from "vitest";

import { analyse } from "./engine";
import {
  buildFigures,
  C01_COMPANY,
  CLEAN_COMPANY,
  T01_COMPANY,
  T02_COMPANY,
  T03_COMPANY,
  T04_COMPANY,
  T05_COMPANY
} from "./fixtures";
import { RULES } from "./ruleset";

function firedRuleIds(spec: Parameters<typeof buildFigures>[0]): string[] {
  return [...new Set(analyse(buildFigures(spec)).flags.map((flag) => flag.ruleId))].sort();
}

describe("clean company", () => {
  it("fires nothing", () => {
    expect(firedRuleIds(CLEAN_COMPANY)).toEqual([]);
  });
});

describe("one fixture per rule", () => {
  const cases: Array<[string, Parameters<typeof buildFigures>[0]]> = [
    ["T-01", T01_COMPANY],
    ["T-02", T02_COMPANY],
    ["T-03", T03_COMPANY],
    ["T-04", T04_COMPANY],
    ["T-05", T05_COMPANY],
    ["C-01", C01_COMPANY]
  ];

  for (const [ruleId, spec] of cases) {
    it(`${ruleId} fires exactly ${ruleId}`, () => {
      expect(firedRuleIds(spec)).toEqual([ruleId]);
    });
  }
});

describe("flag content", () => {
  it("carries the threshold and operator prompt from the ruleset", () => {
    const [flag] = analyse(buildFigures(T01_COMPANY)).flags;
    const rule = RULES.find((candidate) => candidate.id === "T-01");
    expect(flag.thresholdBreached).toBe(rule?.threshold);
    expect(flag.operatorPrompt).toBe(rule?.operatorPrompt);
    expect(flag.severity).toBe("HIGH");
    expect(flag.axis).toBe("TREND");
  });

  it("records the figures the rule used", () => {
    const [flag] = analyse(buildFigures(T01_COMPANY)).flags;
    expect(JSON.parse(flag.computedValues)).toMatchObject({
      revenueGrowthBps: 1000,
      sgaGrowthBps: 1500,
      gapBps: 500
    });
  });

  it("names the periods compared in the title", () => {
    const [flag] = analyse(buildFigures(T01_COMPANY)).flags;
    expect(flag.title).toContain("FY2024");
    expect(flag.title).toContain("FY2023");
  });
});

describe("degradation", () => {
  it("skips the trend rules on a single period and says which", () => {
    const result = analyse(buildFigures(C01_COMPANY));
    expect(result.skipped.map((entry) => entry.ruleId)).toEqual([
      "T-01",
      "T-02",
      "T-03",
      "T-04",
      "T-05"
    ]);
    expect(result.skipped[0]).toMatchObject({ minPeriods: 2, periodCount: 1 });
  });

  it("skips only the three-period rules on two periods", () => {
    const result = analyse(buildFigures(T01_COMPANY));
    expect(result.skipped.map((entry) => entry.ruleId)).toEqual(["T-02", "T-03"]);
  });
});

describe("ordering", () => {
  it("sorts HIGH before MEDIUM", () => {
    const flags = analyse(
      buildFigures({
        ...T02_COMPANY,
        // Break the flat growth so T-03 fires alongside the T-02 highs.
        rows: { ...T02_COMPANY.rows, REVENUE: [1000, 1100, 1155] }
      })
    ).flags;
    const severities = flags.map((flag) => flag.severity);
    expect(severities.indexOf("MEDIUM")).toBe(severities.length - 1);
  });
});
