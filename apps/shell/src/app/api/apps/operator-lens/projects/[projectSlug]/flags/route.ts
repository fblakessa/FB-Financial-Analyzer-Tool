import { NextResponse } from "next/server";

import { prisma } from "@ssa/db";
import { requireProjectAccess } from "@ssa/server/access-service";

import { percentilePosition, type BenchmarkStat } from "@/apps/operator-lens/lib/engine";
import { ratio, toBps } from "@/apps/operator-lens/lib/metrics";
import { coverageFor } from "@/apps/operator-lens/lib/scorecard";

// Metric code -> the line item its numerator comes from. Denominator is always
// revenue.
const BENCHMARK_METRICS: Array<{ metricCode: string; numeratorCode: string }> = [
  { metricCode: "GROSS_MARGIN", numeratorCode: "GROSS_PROFIT" },
  { metricCode: "SGA_PCT_REVENUE", numeratorCode: "SGA_TOTAL" },
  { metricCode: "EBITDA_MARGIN", numeratorCode: "EBITDA" }
];

// Read-only findings feed: the persisted flags for this project's engagements,
// already ordered by the engine. Gates on requireProjectAccess before any
// Prisma call. Triage writes come later.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const { projectSlug } = await params;
  await requireProjectAccess(projectSlug, "operatorLens");

  const engagements = await prisma.engagement.findMany({
    where: { projectSlug },
    orderBy: { createdAt: "asc" },
    // severity is a String column, so alphabetical ordering would put LOW
    // before MEDIUM. Order deterministically here and rank severity on the
    // client, which knows HIGH < MEDIUM < LOW.
    include: {
      flags: { orderBy: [{ ruleId: "asc" }, { title: "asc" }] },
      // Latest period only: the industry context strip compares the most
      // recent period, matching what the benchmark rules read.
      periods: {
        orderBy: { ordinal: "desc" },
        take: 1,
        include: { lineItems: true }
      },
      // Total period count drives which rules could have run at all.
      _count: { select: { periods: true } }
    }
  });

  // Industry context for every benchmark metric, whether or not a rule fired.
  // Computed here with the same pure helpers the engine uses, so the strip
  // cannot drift from the rule that reads the same numbers.
  const benchmarkRows = await prisma.benchmarkStat.findMany({ where: { projectSlug } });

  function industryContextFor(engagement: (typeof engagements)[number]) {
    const period = engagement.periods[0];
    if (!period) return [];
    const value = (code: string) =>
      period.lineItems.find((item) => item.code === code)?.valueMinor ?? null;
    const revenue = value("REVENUE");

    return BENCHMARK_METRICS.flatMap(({ metricCode, numeratorCode }) => {
      const row = benchmarkRows.find(
        (candidate) =>
          candidate.metricCode === metricCode &&
          candidate.setVersion === engagement.benchmarkSetVersion &&
          candidate.industryCode === engagement.industryCode &&
          candidate.sizeBand === engagement.sizeBand
      );
      const companyValue = ratio(value(numeratorCode), revenue);
      if (!row || companyValue === null) return [];

      const stat: BenchmarkStat = {
        setVersion: row.setVersion,
        industryCode: row.industryCode,
        sizeBand: row.sizeBand,
        metricCode: row.metricCode,
        p10: row.p10,
        p25: row.p25,
        p50: row.p50,
        p75: row.p75,
        p90: row.p90,
        source: row.source,
        asOfDate: row.asOfDate.toISOString(),
        sampleSize: row.sampleSize
      };

      return [
        {
          metricCode,
          periodLabel: period.label,
          industryCode: stat.industryCode,
          sizeBand: stat.sizeBand,
          p10Bps: toBps(stat.p10),
          p25Bps: toBps(stat.p25),
          p50Bps: toBps(stat.p50),
          p75Bps: toBps(stat.p75),
          p90Bps: toBps(stat.p90),
          companyValueBps: toBps(companyValue),
          percentilePosition: percentilePosition(stat, companyValue),
          source: stat.source,
          asOfDate: stat.asOfDate,
          sampleSize: stat.sampleSize
        }
      ];
    });
  }

  return NextResponse.json({
    engagements: engagements.map((engagement) => ({
      id: engagement.id,
      companyName: engagement.companyName,
      industryCode: engagement.industryCode,
      sizeBand: engagement.sizeBand,
      rulesetVersion: engagement.rulesetVersion,
      benchmarkSetVersion: engagement.benchmarkSetVersion,
      status: engagement.status,
      industryContext: industryContextFor(engagement),
      // Which rules could not run for this engagement. The scorecard shows
      // these as reduced coverage rather than scoring them clean.
      coverage: coverageFor({
        periodCount: engagement._count.periods,
        benchmarkMetricCodes: [
          ...new Set(
            benchmarkRows
              .filter(
                (row) =>
                  row.setVersion === engagement.benchmarkSetVersion &&
                  row.industryCode === engagement.industryCode &&
                  row.sizeBand === engagement.sizeBand
              )
              .map((row) => row.metricCode)
          )
        ]
      }),
      flags: engagement.flags.map((flag) => ({
        id: flag.id,
        ruleId: flag.ruleId,
        axis: flag.axis,
        severity: flag.severity,
        title: flag.title,
        operatorPrompt: flag.operatorPrompt,
        // Stored as a JSON string; parsed by the client for display.
        computedValues: flag.computedValues,
        thresholdBreached: flag.thresholdBreached,
        status: flag.status,
        ownerName: flag.ownerName,
        note: flag.note,
        updatedAt: flag.updatedAt.toISOString()
      }))
    }))
  });
}
