"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

import { ModuleGate } from "@ssa/ui/module-gate";

// Findings for one engagement. The workspace renders every engagement it is
// given, so passing engagementId narrows it to this one.
const OperatorLensWorkspace = dynamic(
  () =>
    import("@/apps/operator-lens/components/operator-lens-workspace").then(
      (mod) => mod.OperatorLensWorkspace
    ),
  { ssr: false }
);

export default function OperatorLensFindingsPage() {
  const { projectId, engagementId } = useParams<{ projectId: string; engagementId: string }>();

  return (
    <ModuleGate projectId={projectId} moduleKey="operatorLens">
      <OperatorLensWorkspace projectId={projectId} engagementId={engagementId} />
    </ModuleGate>
  );
}
