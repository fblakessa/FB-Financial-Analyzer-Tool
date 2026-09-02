"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

import { ModuleGate } from "@ssa/ui/module-gate";

const NewAnalysisForm = dynamic(
  () =>
    import("@/apps/operator-lens/components/new-analysis-form").then((mod) => mod.NewAnalysisForm),
  { ssr: false }
);

export default function OperatorLensNewPage() {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <ModuleGate projectId={projectId} moduleKey="operatorLens">
      <NewAnalysisForm projectId={projectId} />
    </ModuleGate>
  );
}
