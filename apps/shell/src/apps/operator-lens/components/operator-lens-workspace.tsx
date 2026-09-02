"use client";

import { useCallback, useEffect, useState } from "react";

// Day 2 slice: the seeded demo engagement's confirmed figures, line item codes
// down the left and periods across the top. Deliberately unstyled. The review
// grid, rules engine and triage screens come later.

type LineItem = { code: string; valueMinor: string; wasEditedByOperator: boolean };
type Period = { id: string; label: string; ordinal: number; lineItems: LineItem[] };
type Engagement = {
  id: string;
  name: string;
  companyName: string;
  industryCode: string;
  sizeBand: string;
  currency: string;
  unitScale: string;
  status: string;
  periods: Period[];
};

// Minor units are hundredths of the currency unit. Whole units read better in a
// figures table, and every seeded figure is a whole unit.
function formatMinor(valueMinor: string): string {
  return (BigInt(valueMinor) / 100n).toLocaleString("en-US");
}

export function OperatorLensWorkspace({ projectId }: { projectId: string }) {
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/apps/operator-lens/projects/${encodeURIComponent(projectId)}/engagements`,
        { cache: "no-store" }
      );
      if (!response.ok) throw new Error("Could not load engagements.");
      const payload = (await response.json()) as { engagements: Engagement[] };
      setEngagements(payload.engagements);
      setError(null);
    } catch {
      setError("Could not load engagements.");
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
      <h1>Operator Lens</h1>
      {engagements.map((engagement) => {
        // Union of codes across periods, ordered by first appearance.
        const codes: string[] = [];
        for (const period of engagement.periods) {
          for (const item of period.lineItems) {
            if (!codes.includes(item.code)) codes.push(item.code);
          }
        }
        const valueFor = (period: Period, code: string) =>
          period.lineItems.find((item) => item.code === code)?.valueMinor ?? null;

        return (
          <section key={engagement.id}>
            <h2>{engagement.companyName}</h2>
            <p>
              {engagement.industryCode} · {engagement.sizeBand} · {engagement.currency} ·
              entered as {engagement.unitScale} · status {engagement.status}
            </p>
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  {engagement.periods.map((period) => (
                    <th key={period.id}>{period.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {codes.map((code) => (
                  <tr key={code}>
                    <td>{code}</td>
                    {engagement.periods.map((period) => {
                      const value = valueFor(period, code);
                      return <td key={period.id}>{value === null ? "" : formatMinor(value)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
