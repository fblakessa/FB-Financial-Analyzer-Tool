import { describe, expect, it } from "vitest";

import { buildScorecard } from "./scorecard";
import { exportFilename, toCsv, type ExportPayload } from "./to-csv";

function payload(overrides: Partial<ExportPayload> = {}): ExportPayload {
  return {
    engagement: {
      name: "Epirote Furs diligence",
      companyName: "Epirote Furs, Inc.",
      industryCode: "CONSUMER_RETAIL",
      sizeBand: "$25M - $100M",
      currency: "USD",
      unitScale: "THOUSANDS",
      fiscalYearEnd: "2025-12-31",
      status: "ANALYSED",
      rulesetVersion: "1.2.0",
      benchmarkSetVersion: "consumer-retail-v1",
      figuresConfirmedAt: "2026-02-14T00:00:00.000Z",
      figuresConfirmedByName: "A. Consultant",
      createdByName: "Demo User",
      createdAt: "2026-09-02T12:00:00.000Z",
      ...overrides.engagement
    },
    scorecard: buildScorecard({
      flags: [{ ruleId: "T-01", severity: "HIGH", status: "OPEN" }],
      skipped: [{ ruleId: "T-02", minPeriods: 3, periodCount: 2 }]
    }),
    flags: [
      {
        ruleId: "T-01",
        axis: "TREND",
        severity: "HIGH",
        category: "COST_STRUCTURE",
        title: "SG&A growth outpaced revenue growth (FY2025 vs FY2024)",
        status: "OPEN",
        ownerName: null,
        note: null,
        thresholdBreached: "SG&A growth exceeds revenue growth by 5.00pp or more",
        computedValues: '{"gapBps":592}',
        benchmarkRef: null,
        benchmarkSource: null,
        benchmarkAsOfDate: null,
        benchmarkSampleSize: null,
        updatedAt: "2026-09-02T12:00:00.000Z"
      }
    ],
    figures: [
      {
        code: "COGS",
        periodLabel: "FY2024",
        periodOrdinal: 0,
        periodEndDate: "2024-12-31",
        valueMinor: "1790000000",
        extractedValueMinor: "1790000000",
        wasEditedByOperator: false
      },
      {
        code: "REVENUE",
        periodLabel: "FY2024",
        periodOrdinal: 0,
        periodEndDate: "2024-12-31",
        valueMinor: "3600000000",
        extractedValueMinor: "3600000000",
        wasEditedByOperator: false
      },
      {
        code: "REVENUE",
        periodLabel: "FY2025",
        periodOrdinal: 1,
        periodEndDate: "2025-12-31",
        valueMinor: "3820000000",
        extractedValueMinor: null,
        wasEditedByOperator: true
      }
    ],
    benchmarks: [
      {
        setVersion: "consumer-retail-v1",
        industryCode: "CONSUMER_RETAIL",
        sizeBand: "$25M - $100M",
        metricCode: "SGA_PCT_REVENUE",
        p10: 0.4011,
        p25: 0.4321,
        p50: 0.4717,
        p75: 0.5408,
        p90: 0.5606,
        source: "SEC XBRL company facts, 8 retailers, revenue $270M-$565M",
        asOfDate: "2026-02-01",
        sampleSize: 8
      },
      {
        setVersion: "consumer-retail-v1",
        industryCode: "CONSUMER_RETAIL",
        sizeBand: "$25M - $100M",
        metricCode: "GROSS_MARGIN",
        p10: 0.3918,
        p25: 0.4339,
        p50: 0.4804,
        p75: 0.5397,
        p90: 0.5594,
        source: "SEC XBRL company facts, 8 retailers, revenue $270M-$565M",
        asOfDate: "2026-02-01",
        sampleSize: 8
      }
    ],
    ...overrides
  };
}

describe("toCsv", () => {
  it("produces byte-identical output for the same payload, twice", () => {
    const first = toCsv(payload());
    const second = toCsv(payload());
    expect(second).toBe(first);
    expect(Buffer.from(second, "utf8").equals(Buffer.from(first, "utf8"))).toBe(true);
  });

  it("uses CRLF line endings on every line", () => {
    const csv = toCsv(payload());
    const lf = (csv.match(/\n/g) ?? []).length;
    const crlf = (csv.match(/\r\n/g) ?? []).length;
    expect(crlf).toBe(lf);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("contains all five sections", () => {
    const csv = toCsv(payload());
    for (const section of [
      "SECTION,ENGAGEMENT",
      "SECTION,SCORECARD",
      "SECTION,SCORECARD_COVERAGE_GAPS",
      "SECTION,FLAGS",
      "SECTION,BENCHMARKS"
    ]) {
      expect(csv).toContain(section);
    }
    expect(csv).toContain("SECTION,FIGURES");
  });

  it("carries the engagement's stamped versions", () => {
    const csv = toCsv(payload());
    expect(csv).toContain("ruleset_version,1.2.0");
    expect(csv).toContain("benchmark_set_version,consumer-retail-v1");
  });

  it("quotes fields containing commas and doubles embedded quotes", () => {
    const csv = toCsv(
      payload({
        flags: [
          {
            ...payload().flags[0],
            note: 'Ask about the "one-time" fees, then escalate',
            ownerName: "Demo User"
          }
        ]
      })
    );
    expect(csv).toContain('"Ask about the ""one-time"" fees, then escalate"');
    // The size band contains a comma-free dash but the source string has commas.
    expect(csv).toContain('"SEC XBRL company facts, 8 retailers, revenue $270M-$565M"');
  });

  it("writes the scorecard by category with its coverage gap count", () => {
    const csv = toCsv(payload());
    expect(csv).toContain("COST_STRUCTURE,Cost Structure,75,1,0,0,3,0");
    // T-02 is a Profitability rule, skipped for want of a third period.
    expect(csv).toContain("PROFITABILITY,T-02,SKIPPED,");
  });

  it("writes figures in income statement order, oldest period first", () => {
    const csv = toCsv(payload());
    const lines = csv.split("\r\n");
    const start = lines.findIndex((line) => line === "SECTION,FIGURES");
    const rows = lines.slice(start + 2, start + 5);
    expect(rows[0]).toMatch(/^REVENUE,Revenue,false,FY2024/);
    expect(rows[1]).toMatch(/^REVENUE,Revenue,false,FY2025/);
    expect(rows[2]).toMatch(/^COGS,Cost of Goods Sold,false,FY2024/);
  });

  it("emits exact minor units alongside the entered scale, without grouping", () => {
    const csv = toCsv(payload());
    expect(csv).toContain("value_in_thousands");
    // 3_820_000_000 minor units at THOUSANDS is 38200.00, no thousands separator.
    expect(csv).toContain(",3820000000,38200.00,");
  });

  it("records benchmark provenance on the benchmark rows", () => {
    const csv = toCsv(payload());
    expect(csv).toContain("GROSS_MARGIN,0.3918,0.4339,0.4804,0.5397,0.5594,");
    expect(csv).toContain(",2026-02-01,8");
  });

  it("orders benchmarks by metric code", () => {
    const csv = toCsv(payload());
    expect(csv.indexOf("GROSS_MARGIN,0.3918")).toBeLessThan(csv.indexOf("SGA_PCT_REVENUE,0.4011"));
  });

  it("does not depend on the order rows arrive in", () => {
    const base = payload();
    const shuffled = payload({
      flags: [...base.flags].reverse(),
      figures: [...base.figures].reverse(),
      benchmarks: [...base.benchmarks].reverse()
    });
    expect(toCsv(shuffled)).toBe(toCsv(base));
  });
});

describe("exportFilename", () => {
  it("encodes company, benchmark as-of date and benchmark set version", () => {
    expect(exportFilename(payload())).toBe(
      "operator-lens_epirote-furs-inc_2026-02-01_consumer-retail-v1.csv"
    );
  });

  it("is stable across calls", () => {
    expect(exportFilename(payload())).toBe(exportFilename(payload()));
  });

  it("falls back to the latest period end when there are no benchmarks", () => {
    expect(exportFilename(payload({ benchmarks: [] }))).toBe(
      "operator-lens_epirote-furs-inc_2025-12-31_consumer-retail-v1.csv"
    );
  });

  it("survives a company name with no usable characters", () => {
    const named = payload();
    named.engagement.companyName = "!!!";
    expect(exportFilename(named)).toContain("operator-lens_engagement_");
  });
});
