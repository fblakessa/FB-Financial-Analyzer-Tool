"use client";

import { useCallback, useEffect, useState } from "react";

// Findings list for the seeded demo engagement. Each flag shows its title,
// severity, the figures the rule actually used, the threshold it breached and
// the operator prompt. Deliberately unstyled. Filters, triage and the scorecard
// come later.

type Flag = {
  id: string;
  ruleId: string;
  axis: string;
  severity: string;
  title: string;
  operatorPrompt: string;
  computedValues: string;
  thresholdBreached: string;
  status: string;
};

type Engagement = {
  id: string;
  companyName: string;
  industryCode: string;
  sizeBand: string;
  rulesetVersion: string;
  benchmarkSetVersion: string;
  status: string;
  flags: Flag[];
};

const SEVERITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const AXIS_RANK: Record<string, number> = { BENCHMARK: 0, TREND: 1, COHERENCE: 2 };

// Basis points are how the engine compares; percentages are how a consultant
// reads. Convert for display only, never for a decision.
function formatBps(value: number): string {
  return `${(value / 100).toFixed(2)}%`;
}

function describeComputed(raw: string): string[] {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return [raw];
  }

  return Object.entries(parsed).map(([key, value]) => {
    if (Array.isArray(value)) {
      const rendered = value.map((entry) =>
        typeof entry === "number" && key.endsWith("Bps") ? formatBps(entry) : String(entry)
      );
      return `${key}: ${rendered.join(" -> ")}`;
    }
    if (typeof value === "number" && key.endsWith("Bps")) {
      return `${key}: ${formatBps(value)} (${value}bps)`;
    }
    return `${key}: ${String(value)}`;
  });
}

export function OperatorLensWorkspace({ projectId }: { projectId: string }) {
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/apps/operator-lens/projects/${encodeURIComponent(projectId)}/flags`,
        { cache: "no-store" }
      );
      if (!response.ok) throw new Error("Could not load findings.");
      const payload = (await response.json()) as { engagements: Engagement[] };
      setEngagements(payload.engagements);
      setError(null);
    } catch {
      setError("Could not load findings.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>{error}</div>;
  if (engagements.length === 0) return <div>No engagements yet.</div>;

  return (
    <div>
      <h1>Operator Lens findings</h1>
      {engagements.map((engagement) => {
        const flags = [...engagement.flags].sort(
          (a, b) =>
            (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
            (AXIS_RANK[a.axis] ?? 9) - (AXIS_RANK[b.axis] ?? 9) ||
            a.ruleId.localeCompare(b.ruleId) ||
            a.title.localeCompare(b.title)
        );

        return (
          <section key={engagement.id}>
            <h2>{engagement.companyName}</h2>
            <p>
              {engagement.industryCode} · {engagement.sizeBand} · status {engagement.status} ·
              ruleset {engagement.rulesetVersion} · benchmark set {engagement.benchmarkSetVersion}
            </p>
            <p>
              {flags.length} finding{flags.length === 1 ? "" : "s"}
            </p>

            {flags.length === 0 ? (
              <p>No rules fired.</p>
            ) : (
              <ol>
                {flags.map((flag) => (
                  <li key={flag.id}>
                    <h3>
                      [{flag.severity}] {flag.ruleId}: {flag.title}
                    </h3>
                    <p>
                      Axis {flag.axis} · triage {flag.status}
                    </p>
                    <p>
                      <strong>Threshold breached:</strong> {flag.thresholdBreached}
                    </p>
                    <div>
                      <strong>Figures used:</strong>
                      <ul>
                        {describeComputed(flag.computedValues).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </div>
                    <p>
                      <strong>Where to look:</strong> {flag.operatorPrompt}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}
