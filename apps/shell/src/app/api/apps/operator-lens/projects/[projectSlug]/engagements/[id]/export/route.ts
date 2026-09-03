import { NextResponse } from "next/server";

import { prisma } from "@ssa/db";
import { requireProjectAccess } from "@ssa/server/access-service";

import { RULES_BY_ID } from "@/apps/operator-lens/lib/ruleset";
import { buildScorecard, coverageFor } from "@/apps/operator-lens/lib/scorecard";
import {
  exportFilename,
  toCsv,
  type ExportBenchmark,
  type ExportFigure,
  type ExportFlag,
  type ExportPayload
} from "@/apps/operator-lens/lib/to-csv";

// CSV export for one engagement (SPEC §8.7). Everything the CSV contains is
// read from the database and handed to a pure builder, so exporting twice with
// no intervening change produces byte-identical bytes. Nothing here calls the
// clock.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectSlug: string; id: string }> }
) {
  const { projectSlug, id } = await params;
  await requireProjectAccess(projectSlug, "operatorLens");

  // Scoped by project as well as id, so an engagement from another project
  // cannot be exported through this route.
  const engagement = await prisma.engagement.findFirst({
    where: { id, projectSlug },
    include: {
      flags: true,
      periods: { orderBy: { ordinal: "asc" }, include: { lineItems: true } }
    }
  });
  if (!engagement) {
    return NextResponse.json({ error: "Engagement not found." }, { status: 404 });
  }

  const benchmarkRows = await prisma.benchmarkStat.findMany({
    where: {
      projectSlug,
      setVersion: engagement.benchmarkSetVersion,
      industryCode: engagement.industryCode,
      sizeBand: engagement.sizeBand
    }
  });

  const benchmarkByMetric = new Map(benchmarkRows.map((row) => [row.metricCode, row]));

  const flags: ExportFlag[] = engagement.flags.map((flag) => {
    // benchmarkRef is "<setVersion>:<metricCode>", written by the engine.
    const metricCode = flag.benchmarkRef?.split(":")[1];
    const stat = metricCode ? benchmarkByMetric.get(metricCode) : undefined;
    return {
      ruleId: flag.ruleId,
      axis: flag.axis,
      severity: flag.severity,
      category: RULES_BY_ID[flag.ruleId]?.category ?? "",
      title: flag.title,
      status: flag.status,
      ownerName: flag.ownerName,
      note: flag.note,
      thresholdBreached: flag.thresholdBreached,
      computedValues: flag.computedValues,
      benchmarkRef: flag.benchmarkRef,
      benchmarkSource: stat?.source ?? null,
      benchmarkAsOfDate: stat ? stat.asOfDate.toISOString().slice(0, 10) : null,
      benchmarkSampleSize: stat?.sampleSize ?? null,
      updatedAt: flag.updatedAt.toISOString()
    };
  });

  const figures: ExportFigure[] = engagement.periods.flatMap((period) =>
    period.lineItems.map<ExportFigure>((item) => ({
      code: item.code,
      periodLabel: period.label,
      periodOrdinal: period.ordinal,
      periodEndDate: period.endDate.toISOString().slice(0, 10),
      valueMinor: item.valueMinor.toString(),
      extractedValueMinor:
        item.extractedValueMinor === null ? null : item.extractedValueMinor.toString(),
      wasEditedByOperator: item.wasEditedByOperator
    }))
  );

  const benchmarks: ExportBenchmark[] = benchmarkRows.map((row) => ({
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
    asOfDate: row.asOfDate.toISOString().slice(0, 10),
    sampleSize: row.sampleSize
  }));

  const coverage = coverageFor({
    periodCount: engagement.periods.length,
    benchmarkMetricCodes: [...new Set(benchmarkRows.map((row) => row.metricCode))]
  });

  const payload: ExportPayload = {
    engagement: {
      name: engagement.name,
      companyName: engagement.companyName,
      industryCode: engagement.industryCode,
      sizeBand: engagement.sizeBand,
      currency: engagement.currency,
      unitScale: engagement.unitScale,
      fiscalYearEnd: engagement.fiscalYearEnd.toISOString().slice(0, 10),
      status: engagement.status,
      rulesetVersion: engagement.rulesetVersion,
      benchmarkSetVersion: engagement.benchmarkSetVersion,
      figuresConfirmedAt: engagement.figuresConfirmedAt
        ? engagement.figuresConfirmedAt.toISOString()
        : null,
      figuresConfirmedByName: engagement.figuresConfirmedByName,
      createdByName: engagement.createdByName,
      createdAt: engagement.createdAt.toISOString()
    },
    scorecard: buildScorecard({
      flags: engagement.flags,
      skipped: coverage.skipped,
      unbenchmarked: coverage.unbenchmarked
    }),
    flags,
    figures,
    benchmarks
  };

  const csv = toCsv(payload);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(payload)}"`,
      // No caching, so a triage change is reflected on the next download.
      "Cache-Control": "no-store"
    }
  });
}
