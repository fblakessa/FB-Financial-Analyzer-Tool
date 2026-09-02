import { NextResponse } from "next/server";

import { prisma } from "@ssa/db";
import { requireProjectAccess } from "@ssa/server/access-service";

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
    include: { flags: { orderBy: [{ ruleId: "asc" }, { title: "asc" }] } }
  });

  return NextResponse.json({
    engagements: engagements.map((engagement) => ({
      id: engagement.id,
      companyName: engagement.companyName,
      industryCode: engagement.industryCode,
      sizeBand: engagement.sizeBand,
      rulesetVersion: engagement.rulesetVersion,
      benchmarkSetVersion: engagement.benchmarkSetVersion,
      status: engagement.status,
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
        status: flag.status
      }))
    }))
  });
}
