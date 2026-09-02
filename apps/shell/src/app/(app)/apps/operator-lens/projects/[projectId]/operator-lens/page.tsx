"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

import { ModuleGate } from "@ssa/ui/module-gate";

// Day 1 registration placeholder. Mirrors the Sample Tracker route shape: the
// module UI is loaded client-side and wrapped in <ModuleGate>, which blocks the
// module unless it is enabled for this project. No feature logic yet.
const OperatorLensPlaceholder = dynamic(
  () =>
    import("@/apps/operator-lens/components/operator-lens-placeholder").then(
      (mod) => mod.OperatorLensPlaceholder
    ),
  { ssr: false }
);

export default function OperatorLensPage() {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <ModuleGate projectId={projectId} moduleKey="operatorLens">
      <OperatorLensPlaceholder />
    </ModuleGate>
  );
}
