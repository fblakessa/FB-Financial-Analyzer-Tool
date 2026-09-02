"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

import { ModuleGate } from "@ssa/ui/module-gate";

// Mirrors the Sample Tracker route shape: the module UI is loaded client-side
// and wrapped in <ModuleGate>, which blocks the module unless it is enabled for
// this project.
const OperatorLensWorkspace = dynamic(
  () =>
    import("@/apps/operator-lens/components/operator-lens-workspace").then(
      (mod) => mod.OperatorLensWorkspace
    ),
  { ssr: false }
);

export default function OperatorLensPage() {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <ModuleGate projectId={projectId} moduleKey="operatorLens">
      <OperatorLensWorkspace projectId={projectId} />
    </ModuleGate>
  );
}
