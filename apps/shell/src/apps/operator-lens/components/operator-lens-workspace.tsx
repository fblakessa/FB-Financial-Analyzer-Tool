"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// Findings list with triage. Each flag shows its title, severity, the figures
// the rule used, the threshold it breached, the operator prompt, and controls to
// move it between the four triage states with an optional note. Deliberately
// unstyled.

const FLAG_STATUSES = ["OPEN", "REVIEWED", "ESCALATED", "DISMISSED"] as const;
const SEVERITIES = ["HIGH", "MEDIUM", "LOW"] as const;

type FlagStatus = (typeof FLAG_STATUSES)[number];

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
  ownerName: string | null;
  note: string | null;
  updatedAt: string;
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
  const [savingId, setSavingId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

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

  const triage = async (engagementId: string, flag: Flag, status: FlagStatus) => {
    setSavingId(flag.id);
    setError(null);
    try {
      const draft = noteDrafts[flag.id];
      const response = await fetch(
        `/api/apps/operator-lens/projects/${encodeURIComponent(projectId)}/engagements/${encodeURIComponent(engagementId)}/flags/${encodeURIComponent(flag.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          // Only send a note when the operator actually typed one, so a status
          // change never silently wipes an existing note.
          body: JSON.stringify(draft === undefined ? { status } : { status, note: draft })
        }
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not update the flag.");
      }
      setNoteDrafts((current) => {
        const next = { ...current };
        delete next[flag.id];
        return next;
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the flag.");
    } finally {
      setSavingId(null);
    }
  };

  const visible = useMemo(
    () =>
      engagements.map((engagement) => ({
        ...engagement,
        sortedFlags: [...engagement.flags]
          .filter((flag) => severityFilter === "ALL" || flag.severity === severityFilter)
          .filter((flag) => statusFilter === "ALL" || flag.status === statusFilter)
          .sort(
            (a, b) =>
              (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
              (AXIS_RANK[a.axis] ?? 9) - (AXIS_RANK[b.axis] ?? 9) ||
              a.ruleId.localeCompare(b.ruleId) ||
              a.title.localeCompare(b.title)
          )
      })),
    [engagements, severityFilter, statusFilter]
  );

  if (loading) return <div>Loading...</div>;
  if (engagements.length === 0) return <div>No engagements yet.</div>;

  return (
    <div>
      <h1>Operator Lens findings</h1>

      <div>
        <label htmlFor="severity-filter">Severity </label>
        <select
          id="severity-filter"
          value={severityFilter}
          onChange={(event) => setSeverityFilter(event.target.value)}
        >
          <option value="ALL">All</option>
          {SEVERITIES.map((severity) => (
            <option key={severity} value={severity}>
              {severity}
            </option>
          ))}
        </select>

        <label htmlFor="status-filter"> Status </label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="ALL">All</option>
          {FLAG_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      {error ? <p>{error}</p> : null}

      {visible.map((engagement) => (
        <section key={engagement.id}>
          <h2>{engagement.companyName}</h2>
          <p>
            {engagement.industryCode} · {engagement.sizeBand} · status {engagement.status} ·
            ruleset {engagement.rulesetVersion} · benchmark set {engagement.benchmarkSetVersion}
          </p>
          <p>
            Showing {engagement.sortedFlags.length} of {engagement.flags.length} finding
            {engagement.flags.length === 1 ? "" : "s"}
          </p>

          {engagement.sortedFlags.length === 0 ? (
            <p>No findings match the current filters.</p>
          ) : (
            <ol>
              {engagement.sortedFlags.map((flag) => (
                <li key={flag.id}>
                  <h3>
                    [{flag.severity}] {flag.ruleId}: {flag.title}
                  </h3>
                  <p>
                    Axis {flag.axis} · <strong>triage {flag.status}</strong>
                    {flag.ownerName ? ` · ${flag.ownerName}` : ""} · updated{" "}
                    {flag.updatedAt.slice(0, 19).replace("T", " ")}
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
                  {flag.note ? (
                    <p>
                      <strong>Note:</strong> {flag.note}
                    </p>
                  ) : null}

                  <div>
                    <label htmlFor={`note-${flag.id}`}>Note </label>
                    <input
                      id={`note-${flag.id}`}
                      value={noteDrafts[flag.id] ?? ""}
                      placeholder={flag.note ?? "Add a note"}
                      onChange={(event) =>
                        setNoteDrafts((current) => ({ ...current, [flag.id]: event.target.value }))
                      }
                    />
                    {FLAG_STATUSES.map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={savingId === flag.id || flag.status === status}
                        onClick={() => triage(engagement.id, flag, status)}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}
