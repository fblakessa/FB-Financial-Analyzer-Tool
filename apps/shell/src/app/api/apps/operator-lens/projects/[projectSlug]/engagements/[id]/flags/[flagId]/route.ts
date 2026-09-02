import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@ssa/db";
import { requireProjectAccess } from "@ssa/server/access-service";

// Triage: move a flag between OPEN, REVIEWED, ESCALATED and DISMISSED, with an
// optional note. Every transition records who made it and when.
//
// Triage is the only thing an operator changes after confirmation. It never
// touches the figures or the flag's computed values, so a triaged engagement
// still reproduces the same flags on re-analysis.

// PHASE-3: becomes the platform's FlagStatus enum. SQLite has no enums, so the
// union is enforced here and stored as a String.
const FLAG_STATUSES = ["OPEN", "REVIEWED", "ESCALATED", "DISMISSED"] as const;

const patchSchema = z.object({
  status: z.enum(FLAG_STATUSES),
  // Explicit null clears an existing note; omitting the field leaves it alone.
  note: z.string().trim().max(2000).nullish()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectSlug: string; id: string; flagId: string }> }
) {
  const { projectSlug, id, flagId } = await params;
  const { user } = await requireProjectAccess(projectSlug, "operatorLens");

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid triage update." },
      { status: 400 }
    );
  }

  // Scope the lookup by project and engagement, so a flag id from another
  // project cannot be reached through this route.
  const existing = await prisma.flag.findFirst({
    where: { id: flagId, projectSlug, engagementId: id },
    select: { id: true }
  });
  if (!existing) {
    return NextResponse.json({ error: "Flag not found." }, { status: 404 });
  }

  const { status, note } = parsed.data;
  const flag = await prisma.flag.update({
    where: { id: flagId },
    data: {
      status,
      // Every transition is attributed. PHASE-3: an FK to the real user.
      ownerName: user.name,
      ...(note === undefined ? {} : { note: note === null || note === "" ? null : note })
    }
  });

  return NextResponse.json({
    flag: {
      id: flag.id,
      status: flag.status,
      ownerName: flag.ownerName,
      note: flag.note,
      updatedAt: flag.updatedAt.toISOString()
    }
  });
}
