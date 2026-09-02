import { NextResponse } from "next/server";

import { prisma } from "@ssa/db";
import { requireProjectAccess } from "@ssa/server/access-service";

// The industry codes and size bands that actually have seeded benchmark rows.
// The upload screen populates its dropdowns from this, so an operator cannot
// choose a combination the engine has no distribution for.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const { projectSlug } = await params;
  await requireProjectAccess(projectSlug, "operatorLens");

  const rows = await prisma.benchmarkStat.findMany({
    where: { projectSlug },
    select: { setVersion: true, industryCode: true, sizeBand: true },
    orderBy: [{ industryCode: "asc" }, { sizeBand: "asc" }]
  });

  const industryCodes = [...new Set(rows.map((row) => row.industryCode))].sort();
  const sizeBands = [...new Set(rows.map((row) => row.sizeBand))].sort();
  const setVersions = [...new Set(rows.map((row) => row.setVersion))].sort();

  // Valid pairs, so the screen can narrow size bands to the chosen industry
  // rather than offering a combination with no rows behind it.
  const pairs = [
    ...new Set(rows.map((row) => `${row.industryCode}|${row.sizeBand}`))
  ].map((key) => {
    const [industryCode, sizeBand] = key.split("|");
    return { industryCode, sizeBand };
  });

  return NextResponse.json({ industryCodes, sizeBands, pairs, setVersions });
}
