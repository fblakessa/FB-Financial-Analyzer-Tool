import { describe, expect, it } from "vitest";

import {
  describeCoverage,
  describeCoverageGap,
  earliestPeriodIndex,
  groupFindingsByPeriod,
  interpretBenchmark,
  latestPeriodIndex,
  sortFindings,
  summariseFindings
} from "./interpret";

const PERIODS = ["FY2023", "FY2024", "FY2025"];

describe("interpretBenchmark", () => {
  describe("higher is better (gross margin)", () => {
    it("calls below the lower quartile a Concern", () => {
      const result = interpretBenchmark("GROSS_MARGIN", 18);
      expect(result.verdict).toBe("CONCERN");
      expect(result.verdictLabel).toBe("Concern");
      expect(result.sentence).toContain("lower quartile");
    });

    it("calls below the median but inside the middle half a Watch", () => {
      expect(interpretBenchmark("GROSS_MARGIN", 40).verdict).toBe("WATCH");
    });

    it("calls at or above the median a Good, in line with peers", () => {
      const result = interpretBenchmark("GROSS_MARGIN", 53);
      expect(result.verdict).toBe("GOOD");
      expect(result.sentence).toBe(
        "In line with peers. Not a concern on level, see the trend findings."
      );
    });

    it("calls above the upper quartile a strength", () => {
      const result = interpretBenchmark("GROSS_MARGIN", 85);
      expect(result.verdict).toBe("GOOD");
      expect(result.sentence).toContain("strength");
    });
  });

  describe("higher is worse (SG&A ratio)", () => {
    it("calls above the upper quartile a Concern", () => {
      const result = interpretBenchmark("SGA_PCT_REVENUE", 85);
      expect(result.verdict).toBe("CONCERN");
      expect(result.sentence).toContain("upper quartile");
    });

    it("calls above the median but inside the middle half a Watch", () => {
      expect(interpretBenchmark("SGA_PCT_REVENUE", 60).verdict).toBe("WATCH");
    });

    it("calls below the median a Good", () => {
      expect(interpretBenchmark("SGA_PCT_REVENUE", 45).verdict).toBe("GOOD");
    });

    it("calls below the lower quartile a strength, not a concern", () => {
      const result = interpretBenchmark("SGA_PCT_REVENUE", 15);
      expect(result.verdict).toBe("GOOD");
      expect(result.sentence).toContain("strength");
    });
  });

  it("treats direction as opposite for the two metric kinds at the same percentile", () => {
    expect(interpretBenchmark("GROSS_MARGIN", 85).verdict).toBe("GOOD");
    expect(interpretBenchmark("SGA_PCT_REVENUE", 85).verdict).toBe("CONCERN");
  });

  it("does not call sitting exactly on a quartile a Concern", () => {
    expect(interpretBenchmark("GROSS_MARGIN", 25).verdict).toBe("WATCH");
    expect(interpretBenchmark("SGA_PCT_REVENUE", 75).verdict).toBe("WATCH");
  });

  it("is deterministic for the same input", () => {
    const first = interpretBenchmark("EBITDA_MARGIN", 50);
    const second = interpretBenchmark("EBITDA_MARGIN", 50);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("defaults an unknown metric to higher-is-better rather than throwing", () => {
    expect(interpretBenchmark("SOMETHING_NEW", 90).verdict).toBe("GOOD");
  });
});

describe("latestPeriodIndex", () => {
  it("reads periodTo from a two-period rule", () => {
    expect(latestPeriodIndex('{"periodFrom":"FY2023","periodTo":"FY2024"}', PERIODS)).toBe(1);
  });

  it("reads the last entry of a periods array", () => {
    expect(
      latestPeriodIndex('{"periods":["FY2023","FY2024","FY2025"]}', PERIODS)
    ).toBe(2);
  });

  it("reads a single period", () => {
    expect(latestPeriodIndex('{"period":"FY2025","code":"GROSS_PROFIT"}', PERIODS)).toBe(2);
  });

  it("returns -1 for unparseable values rather than throwing", () => {
    expect(latestPeriodIndex("not json", PERIODS)).toBe(-1);
  });

  it("returns -1 when no period label is present", () => {
    expect(latestPeriodIndex('{"gapBps":541}', PERIODS)).toBe(-1);
  });
});

describe("sortFindings", () => {
  const flag = (
    ruleId: string,
    severity: string,
    axis: string,
    computedValues: string,
    title = ruleId
  ) => ({ ruleId, severity, axis, title, computedValues });

  it("puts the most recent period first, ahead of severity", () => {
    const older = flag("T-01", "HIGH", "TREND", '{"periodTo":"FY2024"}');
    const newerButLower = flag("T-03", "MEDIUM", "TREND", '{"periodTo":"FY2025"}');
    const sorted = sortFindings([older, newerButLower], PERIODS);
    expect(sorted.map((entry) => entry.ruleId)).toEqual(["T-03", "T-01"]);
  });

  it("orders by severity within the same period", () => {
    const medium = flag("T-03", "MEDIUM", "TREND", '{"periodTo":"FY2025"}');
    const high = flag("T-01", "HIGH", "TREND", '{"periodTo":"FY2025"}');
    const sorted = sortFindings([medium, high], PERIODS);
    expect(sorted.map((entry) => entry.ruleId)).toEqual(["T-01", "T-03"]);
  });

  it("sorts a multi-period finding on its latest period", () => {
    const spanning = flag("T-02", "HIGH", "TREND", '{"periods":["FY2023","FY2024","FY2025"]}');
    const single = flag("T-01", "HIGH", "TREND", '{"periodTo":"FY2024"}');
    expect(sortFindings([single, spanning], PERIODS).map((e) => e.ruleId)).toEqual([
      "T-02",
      "T-01"
    ]);
  });

  it("puts flags with no recognisable period last", () => {
    const dated = flag("T-01", "HIGH", "TREND", '{"periodTo":"FY2023"}');
    const undated = flag("C-01", "HIGH", "COHERENCE", '{"gapBps":100}');
    expect(sortFindings([undated, dated], PERIODS).map((e) => e.ruleId)).toEqual([
      "T-01",
      "C-01"
    ]);
  });

  it("does not depend on input order", () => {
    const flags = [
      flag("T-01", "HIGH", "TREND", '{"periodTo":"FY2024"}'),
      flag("T-03", "MEDIUM", "TREND", '{"periodTo":"FY2025"}'),
      flag("B-01", "HIGH", "BENCHMARK", '{"period":"FY2025"}')
    ];
    const forward = sortFindings(flags, PERIODS).map((e) => e.ruleId);
    const backward = sortFindings([...flags].reverse(), PERIODS).map((e) => e.ruleId);
    expect(backward).toEqual(forward);
  });

  it("does not mutate the input array", () => {
    const flags = [
      flag("T-01", "HIGH", "TREND", '{"periodTo":"FY2023"}'),
      flag("T-03", "MEDIUM", "TREND", '{"periodTo":"FY2025"}')
    ];
    const before = flags.map((entry) => entry.ruleId);
    sortFindings(flags, PERIODS);
    expect(flags.map((entry) => entry.ruleId)).toEqual(before);
  });
});

describe("tie-breaking on span", () => {
  const flag = (
    ruleId: string,
    severity: string,
    axis: string,
    computedValues: string,
    title = ruleId
  ) => ({ ruleId, severity, axis, title, computedValues });

  it("puts a finding confined to the recent window before one spanning further back", () => {
    // Both end in FY2025 and both are HIGH. T-02 reaches back to FY2023.
    const spanning = flag("T-02", "HIGH", "TREND", '{"periods":["FY2023","FY2024","FY2025"]}');
    const recent = flag("T-04", "HIGH", "TREND", '{"periodFrom":"FY2024","periodTo":"FY2025"}');
    expect(sortFindings([spanning, recent], PERIODS).map((e) => e.ruleId)).toEqual([
      "T-04",
      "T-02"
    ]);
  });

  it("still puts severity ahead of span", () => {
    const recentButLower = flag(
      "T-03",
      "MEDIUM",
      "TREND",
      '{"periodFrom":"FY2024","periodTo":"FY2025"}'
    );
    const spanningHigh = flag("T-02", "HIGH", "TREND", '{"periods":["FY2023","FY2024","FY2025"]}');
    expect(sortFindings([recentButLower, spanningHigh], PERIODS).map((e) => e.ruleId)).toEqual([
      "T-02",
      "T-03"
    ]);
  });

  it("reproduces the demo company's expected reading order", () => {
    const flags = [
      flag("T-01", "HIGH", "TREND", '{"periodFrom":"FY2024","periodTo":"FY2025"}', "T-01 late"),
      flag("T-02", "HIGH", "TREND", '{"periods":["FY2023","FY2024","FY2025"]}', "T-02 span"),
      flag("T-03", "MEDIUM", "TREND", '{"periods":["FY2023","FY2024","FY2025"]}', "T-03 span"),
      flag("T-04", "HIGH", "TREND", '{"periodFrom":"FY2024","periodTo":"FY2025"}', "T-04 late"),
      flag("T-05", "HIGH", "TREND", '{"periodFrom":"FY2024","periodTo":"FY2025"}', "T-05 late"),
      flag("T-01b", "HIGH", "TREND", '{"periodFrom":"FY2023","periodTo":"FY2024"}', "T-01 early")
    ];
    expect(sortFindings(flags, PERIODS).map((e) => e.ruleId)).toEqual([
      // FY2025 group: highs confined to FY2024-FY2025 first, then the span, then the medium
      "T-01",
      "T-04",
      "T-05",
      "T-02",
      "T-03",
      // FY2024 group
      "T-01b"
    ]);
  });
});

describe("groupFindingsByPeriod", () => {
  const flag = (ruleId: string, severity: string, computedValues: string) => ({
    ruleId,
    severity,
    axis: "TREND",
    title: ruleId,
    computedValues
  });

  it("groups by the period each finding sorts on, newest group first", () => {
    const groups = groupFindingsByPeriod(
      [
        flag("T-01", "HIGH", '{"periodTo":"FY2024"}'),
        flag("T-04", "HIGH", '{"periodTo":"FY2025"}')
      ],
      PERIODS
    );
    expect(groups.map((group) => group.periodLabel)).toEqual(["FY2025", "FY2024"]);
    expect(groups[0].flags.map((f) => f.ruleId)).toEqual(["T-04"]);
  });

  it("keeps a spanning finding in the group of its latest period", () => {
    const groups = groupFindingsByPeriod(
      [flag("T-02", "HIGH", '{"periods":["FY2023","FY2024","FY2025"]}')],
      PERIODS
    );
    expect(groups[0].periodLabel).toBe("FY2025");
  });

  it("puts findings with no period in a trailing null group", () => {
    const groups = groupFindingsByPeriod(
      [flag("C-01", "HIGH", '{"gapBps":100}'), flag("T-04", "HIGH", '{"periodTo":"FY2025"}')],
      PERIODS
    );
    expect(groups.map((group) => group.periodLabel)).toEqual(["FY2025", null]);
  });

  it("returns no groups for no flags", () => {
    expect(groupFindingsByPeriod([], PERIODS)).toEqual([]);
  });

  it("does not lose or duplicate any flag", () => {
    const flags = [
      flag("T-01", "HIGH", '{"periodTo":"FY2024"}'),
      flag("T-02", "HIGH", '{"periods":["FY2023","FY2024","FY2025"]}'),
      flag("C-01", "HIGH", '{"gapBps":1}')
    ];
    const grouped = groupFindingsByPeriod(flags, PERIODS).flatMap((group) => group.flags);
    expect(grouped).toHaveLength(flags.length);
    expect(new Set(grouped.map((f) => f.ruleId))).toEqual(new Set(["T-01", "T-02", "C-01"]));
  });
});

describe("earliestPeriodIndex", () => {
  it("finds the earliest period a finding touches", () => {
    expect(earliestPeriodIndex('{"periods":["FY2023","FY2024","FY2025"]}', PERIODS)).toBe(0);
    expect(earliestPeriodIndex('{"periodFrom":"FY2024","periodTo":"FY2025"}', PERIODS)).toBe(1);
  });

  it("returns -1 when no period is present", () => {
    expect(earliestPeriodIndex('{"gapBps":1}', PERIODS)).toBe(-1);
  });
});

describe("summariseFindings", () => {
  const base = { companyName: "Epirote Furs, Inc.", periodCount: 3, ruleCount: 9, coverageGapCount: 0 };

  it("says nothing fired, and what was checked, when there are no flags", () => {
    const summary = summariseFindings({ ...base, flags: [] });
    expect(summary).toBe("No findings. All 9 of 9 rules that could run against 3 periods passed.");
  });

  it("counts findings by severity and names the dominant category", () => {
    const summary = summariseFindings({
      ...base,
      flags: [
        { ruleId: "T-01", axis: "TREND", severity: "HIGH" },
        { ruleId: "T-04", axis: "TREND", severity: "HIGH" },
        { ruleId: "T-03", axis: "TREND", severity: "MEDIUM" }
      ]
    });
    expect(summary).toContain("3 findings on Epirote Furs, Inc.: 2 high, 1 medium");
    expect(summary).toContain("Most sit in Cost Structure (2 of 3)");
  });

  it("calls it a trend problem when only trend rules fired", () => {
    const summary = summariseFindings({
      ...base,
      flags: [{ ruleId: "T-01", axis: "TREND", severity: "HIGH" }]
    });
    expect(summary).toContain("direction of travel rather than the level");
  });

  it("calls it a level problem when only benchmark rules fired", () => {
    const summary = summariseFindings({
      ...base,
      flags: [{ ruleId: "B-01", axis: "BENCHMARK", severity: "HIGH" }]
    });
    expect(summary).toContain("level of the business rather than its direction");
  });

  it("says both when level and trend rules fired", () => {
    const summary = summariseFindings({
      ...base,
      flags: [
        { ruleId: "B-01", axis: "BENCHMARK", severity: "HIGH" },
        { ruleId: "T-01", axis: "TREND", severity: "HIGH" }
      ]
    });
    expect(summary).toContain("Both the level and the direction of travel");
  });

  it("leads on reconciliation when only a coherence rule fired", () => {
    const summary = summariseFindings({
      ...base,
      flags: [{ ruleId: "C-01", axis: "COHERENCE", severity: "HIGH" }]
    });
    expect(summary).toContain("does not reconcile");
  });

  it("appends a reconciliation note alongside other findings", () => {
    const summary = summariseFindings({
      ...base,
      flags: [
        { ruleId: "T-01", axis: "TREND", severity: "HIGH" },
        { ruleId: "C-01", axis: "COHERENCE", severity: "HIGH" }
      ]
    });
    expect(summary).toContain("and the statement does not reconcile");
  });

  it("uses the singular for one finding", () => {
    const summary = summariseFindings({
      ...base,
      flags: [{ ruleId: "T-01", axis: "TREND", severity: "HIGH" }]
    });
    expect(summary).toContain("1 finding on");
  });

  it("does not depend on flag order", () => {
    const flags = [
      { ruleId: "T-01", axis: "TREND", severity: "HIGH" },
      { ruleId: "T-03", axis: "TREND", severity: "MEDIUM" }
    ];
    expect(summariseFindings({ ...base, flags: [...flags].reverse() })).toBe(
      summariseFindings({ ...base, flags })
    );
  });
});

describe("coverage wording", () => {
  it("names the rule and the reason", () => {
    expect(
      describeCoverageGap({
        ruleId: "T-02",
        reason: "SKIPPED",
        detail: "needs 3 periods, this analysis has 2"
      })
    ).toBe("T-02 needs 3 periods, this analysis has 2.");
  });

  it("states full coverage plainly", () => {
    expect(describeCoverage({ ruleCount: 9, gapCount: 0, periodCount: 3 })).toBe(
      "All 9 rules ran against 3 periods."
    );
  });

  it("states partial coverage without implying a pass", () => {
    expect(describeCoverage({ ruleCount: 9, gapCount: 2, periodCount: 2 })).toBe(
      "7 of 9 rules ran against 2 periods. 2 could not run."
    );
  });
});
