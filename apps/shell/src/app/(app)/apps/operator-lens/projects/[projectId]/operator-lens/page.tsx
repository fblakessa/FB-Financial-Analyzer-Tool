"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

import { ModuleGate } from "@ssa/ui/module-gate";

// The module index: the engagement list. Client-only via next/dynamic with
// ssr false, wrapped in ModuleGate, matching Sample Tracker.
const EngagementList = dynamic(
  () =>
    import("@/apps/operator-lens/components/engagement-list").then((mod) => mod.EngagementList),
  { ssr: false }
);

export default function OperatorLensIndexPage() {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <ModuleGate projectId={projectId} moduleKey="operatorLens">
      <EngagementList projectId={projectId} />
    </ModuleGate>
  );
}
