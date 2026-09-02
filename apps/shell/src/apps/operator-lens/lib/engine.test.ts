import { describe, expect, it } from "vitest";

import { analyse, percentilePosition, type BenchmarkStat } from "./engine";
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

// Stub distribution, not the seeded one: these tests check the comparison
// logic, not the peer data.
const INDUSTRY = "TEST_INDUSTRY";
const BAND = "$25M - $100M";

function stat(metricCode: string, percentiles: [number, number, number, number, number]): BenchmarkStat {
  const [p10, p25, p50, p75, p90] = percentiles;
  return {
    setVersion: "test-v1",
    industryCode: INDUSTRY,
    sizeBand: BAND,
    metricCode,
    p10,
    p25,
    p50,
    p75,
    p90,
    source: "Stub",
    asOfDate: "2026-01-31",
    sampleSize: 8
  };
}

const BENCHMARKS = [
  stat("GROSS_MARGIN", [0.35, 0.45, 0.5, 0.55, 0.6]),
  stat("SGA_PCT_REVENUE", [0.2, 0.25, 0.3, 0.35, 0.4]),
  stat("EBITDA_MARGIN", [0.02, 0.05, 0.1, 0.15, 0.2])
];

const CONTEXT = { industryCode: INDUSTRY, sizeBand: BAND, benchmarks: BENCHMARKS };

describe("benchmark axis", () => {
  // CLEAN_COMPANY: gross margin 60%, SG&A 30%, EBITDA margin 25%.
  it("fires nothing when the company sits inside the distribution", () => {
    const flags = analyse(buildFigures(CLEAN_COMPANY), CONTEXT).flags;
    expect(flags.filter((flag) => flag.axis === "BENCHMARK")).toEqual([]);
  });

  it("fires B-01 when gross margin is below P25", () => {
    // Gross margin 40% against a P25 of 45%.
    const figures = buildFigures({
      periods: ["FY2025"],
      rows: { REVENUE: [1000], COGS: [600], GROSS_PROFIT: [400], SGA_TOTAL: [300], EBITDA: [100] }
    });
    const ids = analyse(figures, CONTEXT).flags.map((flag) => flag.ruleId);
    expect(ids).toContain("B-01");
    expect(ids).not.toContain("B-02");
    expect(ids).not.toContain("B-03");
  });

  it("fires B-02 when SG&A percent of revenue is above P75", () => {
    const figures = buildFigures({
      periods: ["FY2025"],
      rows: { REVENUE: [1000], COGS: [400], GROSS_PROFIT: [600], SGA_TOTAL: [400], EBITDA: [150] }
    });
    const ids = analyse(figures, CONTEXT).flags.map((flag) => flag.ruleId);
    expect(ids).toContain("B-02");
    expect(ids).not.toContain("B-01");
  });

  it("fires B-03 when EBITDA margin is below P25", () => {
    const figures = buildFigures({
      periods: ["FY2025"],
      rows: { REVENUE: [1000], COGS: [400], GROSS_PROFIT: [600], SGA_TOTAL: [300], EBITDA: [30] }
    });
    const ids = analyse(figures, CONTEXT).flags.map((flag) => flag.ruleId);
    expect(ids).toContain("B-03");
  });

  it("carries the whole distribution and provenance on the flag", () => {
    const figures = buildFigures({
      periods: ["FY2025"],
      rows: { REVENUE: [1000], COGS: [600], GROSS_PROFIT: [400], SGA_TOTAL: [300], EBITDA: [100] }
    });
    const flag = analyse(figures, CONTEXT).flags.find((entry) => entry.ruleId === "B-01");
    expect(flag?.benchmarkRef).toBe("test-v1:GROSS_MARGIN");
    const computed = JSON.parse(flag?.computedValues ?? "{}");
    expect(computed.benchmark).toMatchObject({
      p10Bps: 3500,
      p25Bps: 4500,
      p50Bps: 5000,
      p75Bps: 5500,
      p90Bps: 6000,
      sampleSize: 8,
      asOfDate: "2026-01-31"
    });
    expect(computed.companyValueBps).toBe(4000);
  });

  it("reports rules as unbenchmarked when no row matches the industry", () => {
    const result = analyse(buildFigures(CLEAN_COMPANY), {
      industryCode: "NO_SUCH_INDUSTRY",
      sizeBand: BAND,
      benchmarks: BENCHMARKS
    });
    expect(result.unbenchmarked.map((entry) => entry.ruleId)).toEqual(["B-01", "B-02", "B-03"]);
    expect(result.flags.filter((flag) => flag.axis === "BENCHMARK")).toEqual([]);
  });

  it("reports rules as unbenchmarked when no benchmarks are supplied at all", () => {
    const result = analyse(buildFigures(CLEAN_COMPANY));
    expect(result.unbenchmarked.map((entry) => entry.ruleId)).toEqual(["B-01", "B-02", "B-03"]);
  });
});

describe("percentilePosition", () => {
  const gm = stat("GROSS_MARGIN", [0.35, 0.45, 0.5, 0.55, 0.6]);

  it("clamps at the published ends", () => {
    expect(percentilePosition(gm, 0.2)).toBe(10);
    expect(percentilePosition(gm, 0.9)).toBe(90);
  });

  it("returns the exact percentile at a published point", () => {
    expect(percentilePosition(gm, 0.5)).toBe(50);
  });

  it("interpolates between published points", () => {
    // Halfway between P50 (0.50) and P75 (0.55).
    expect(percentilePosition(gm, 0.525)).toBe(63);
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
