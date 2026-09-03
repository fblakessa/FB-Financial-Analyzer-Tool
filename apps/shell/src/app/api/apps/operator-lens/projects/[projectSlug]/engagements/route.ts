import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@ssa/db";
import { requireProjectAccess } from "@ssa/server/access-service";

import { analyse, type BenchmarkStat } from "@/apps/operator-lens/lib/engine";
import { parseWorkbook } from "@/apps/operator-lens/lib/parse-workbook";
import { RULESET_VERSION } from "@/apps/operator-lens/lib/ruleset";
import { validateFigures, type ValidationError } from "@/apps/operator-lens/lib/validate";

// GET returns the project's engagements with their confirmed figures by period
// and a flag count by severity. POST accepts a workbook upload. Both gate on
// requireProjectAccess before any Prisma call, the same way the Sample Tracker
// route does.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const { projectSlug } = await params;
  await requireProjectAccess(projectSlug, "operatorLens");

  const engagements = await prisma.engagement.findMany({
    where: { projectSlug },
    orderBy: { createdAt: "asc" },
    include: {
      periods: {
        orderBy: { ordinal: "asc" },
        include: { lineItems: { orderBy: { code: "asc" } } }
      },
      flags: { select: { severity: true } }
    }
  });

  // valueMinor is BigInt, which JSON.stringify cannot serialise. Send it as a
  // decimal string and let the client format it.
  return NextResponse.json({
    engagements: engagements.map((engagement) => ({
      id: engagement.id,
      name: engagement.name,
      companyName: engagement.companyName,
      industryCode: engagement.industryCode,
      sizeBand: engagement.sizeBand,
      currency: engagement.currency,
      unitScale: engagement.unitScale,
      status: engagement.status,
      createdAt: engagement.createdAt.toISOString(),
      flagCounts: {
        total: engagement.flags.length,
        high: engagement.flags.filter((flag) => flag.severity === "HIGH").length,
        medium: engagement.flags.filter((flag) => flag.severity === "MEDIUM").length,
        low: engagement.flags.filter((flag) => flag.severity === "LOW").length
      },
      periods: engagement.periods.map((period) => ({
        id: period.id,
        label: period.label,
        ordinal: period.ordinal,
        lineItems: period.lineItems.map((item) => ({
          code: item.code,
          valueMinor: item.valueMinor.toString(),
          wasEditedByOperator: item.wasEditedByOperator
        }))
      }))
    }))
  });
}

// Text fields that accompany the file. The file itself is validated by
// parse-workbook and validateFigures, not by Zod.
const uploadSchema = z.object({
  name: z.string().trim().min(1, "Analysis name is required.").max(200),
  industryCode: z.string().trim().min(1, "Industry code is required."),
  sizeBand: z.string().trim().min(1, "Size band is required.")
});

function errorResponse(errors: ValidationError[], status = 400) {
  return NextResponse.json({ errors }, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const { projectSlug } = await params;
  const { user } = await requireProjectAccess(projectSlug, "operatorLens");

  const form = await request.formData().catch(() => null);
  if (!form) {
    return errorResponse([
      { sheet: "Upload", row: "Request", field: "body", message: "Expected a multipart form upload." }
    ]);
  }

  const parsed = uploadSchema.safeParse({
    name: form.get("name"),
    industryCode: form.get("industryCode"),
    sizeBand: form.get("sizeBand")
  });
  if (!parsed.success) {
    return errorResponse(
      parsed.error.issues.map((issue) => ({
        sheet: "Upload",
        row: "Form",
        field: String(issue.path[0] ?? "field"),
        message: issue.message
      }))
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return errorResponse([
      { sheet: "Upload", row: "File", field: "file", message: "Choose a .xlsx workbook to upload." }
    ]);
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return errorResponse([
      {
        sheet: "Upload",
        row: "File",
        field: "file",
        message: `"${file.name}" is not a .xlsx workbook. Only the Operator Lens input workbook is supported today.`
      }
    ]);
  }

  // Stage 1: parse. A structural failure (missing sheet, non-date in a date
  // cell) throws, and is surfaced as one readable error rather than a stack
  // trace.
  let figures;
  try {
    figures = parseWorkbook(Buffer.from(await file.arrayBuffer()));
  } catch (caught) {
    return errorResponse([
      {
        sheet: "Workbook",
        row: "Structure",
        field: file.name,
        message: caught instanceof Error ? caught.message : "Could not read the workbook."
      }
    ]);
  }

  // Stage 2: the door checks, against the benchmark coverage that exists.
  const benchmarkRows = await prisma.benchmarkStat.findMany({ where: { projectSlug } });
  const errors = validateFigures(figures, {
    selectedIndustryCode: parsed.data.industryCode,
    selectedSizeBand: parsed.data.sizeBand,
    allowedIndustryCodes: [...new Set(benchmarkRows.map((row) => row.industryCode))].sort(),
    allowedSizeBands: [...new Set(benchmarkRows.map((row) => row.sizeBand))].sort()
  });
  if (errors.length > 0) {
    // Partial imports are not permitted: nothing has been written yet.
    return errorResponse(errors, 422);
  }

  // Stage 3: analyse and persist. The figures came straight from a workbook the
  // operator filled in and confirmed on upload, so they are treated as
  // confirmed. PHASE-3 and the Review & Confirm screen move this to an
  // explicit operator action.
  const stats: BenchmarkStat[] = benchmarkRows.map((row) => ({
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
  }));

  const analysis = analyse(figures, {
    industryCode: parsed.data.industryCode,
    sizeBand: parsed.data.sizeBand,
    benchmarks: stats
  });

  const benchmarkSetVersion =
    [...new Set(benchmarkRows.map((row) => row.setVersion))].sort().join(",") || "unseeded";

  const engagement = await prisma.engagement.create({
    data: {
      projectSlug,
      name: parsed.data.name,
      companyName: figures.company.companyName,
      industryCode: parsed.data.industryCode,
      sizeBand: parsed.data.sizeBand,
      fiscalYearEnd: figures.company.fiscalYearEnd,
      currency: figures.company.currency,
      unitScale: figures.company.unitScale,
      benchmarkSetVersion,
      rulesetVersion: RULESET_VERSION,
      status: "ANALYSED",
      figuresConfirmedAt: new Date(),
      figuresConfirmedByName: user.name,
      createdByName: user.name,
      documents: {
        create: [
          {
            projectSlug,
            filename: file.name,
            mimeType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            sourceKind: "WORKBOOK_XLSX",
            // The file itself is not retained: file storage and preview are
            // out of scope, so the path records what was read, not where it is.
            storagePath: `upload://${file.name}`,
            extractionStatus: "SUCCEEDED"
          }
        ]
      },
      periods: {
        create: figures.periods.map((period) => ({
          projectSlug,
          label: period.label,
          endDate: period.endDate,
          ordinal: period.ordinal,
          lineItems: {
            create: figures.lineItems
              .filter((item) => item.valuesMinor[period.ordinal] !== null)
              .map((item) => ({
                projectSlug,
                code: item.code,
                valueMinor: item.valuesMinor[period.ordinal] as bigint,
                extractedValueMinor: item.valuesMinor[period.ordinal] as bigint,
                wasEditedByOperator: false
              }))
          }
        }))
      },
      flags: {
        create: analysis.flags.map((flag) => ({
          projectSlug,
          ruleId: flag.ruleId,
          axis: flag.axis,
          severity: flag.severity,
          title: flag.title,
          operatorPrompt: flag.operatorPrompt,
          computedValues: flag.computedValues,
          thresholdBreached: flag.thresholdBreached,
          benchmarkRef: flag.benchmarkRef,
          status: "OPEN"
        }))
      }
    },
    select: { id: true }
  });

  return NextResponse.json(
    {
      engagementId: engagement.id,
      flagCount: analysis.flags.length,
      skipped: analysis.skipped,
      unbenchmarked: analysis.unbenchmarked
    },
    { status: 201 }
  );
}
