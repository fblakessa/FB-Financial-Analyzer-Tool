import { NextResponse } from "next/server";

import { prisma } from "@ssa/db";
import { requireProjectAccess } from "@ssa/server/access-service";

// Read-only for now: returns the project's engagements with their confirmed
// figures by period. Gates on requireProjectAccess before any Prisma call, the
// same way the Sample Tracker route does.

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
      }
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
