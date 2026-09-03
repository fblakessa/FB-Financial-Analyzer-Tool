"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PageShell } from "@ssa/ui/page-shell";

// New analysis: download the input workbook, fill it in, upload it. The
// industry and size band dropdowns are populated from the seeded benchmark
// table, so an operator cannot choose a combination the engine has no
// distribution for.

type ValidationError = { sheet: string; row: string; field: string; message: string };

type Options = {
  industryCodes: string[];
  sizeBands: string[];
  pairs: { industryCode: string; sizeBand: string }[];
};

const CARD = "rounded-[28px] bg-card p-6 shadow-ambient ring-1 ring-slate-200/70";
const LABEL = "block text-[11px] font-extrabold uppercase tracking-[0.14em] text-outline";
const FIELD =
  "mt-1.5 w-full rounded-2xl border border-slate-200 bg-canvas px-4 py-2.5 text-sm text-ink outline-none focus:border-ink/40";
const PRIMARY_BUTTON =
  "rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50";
const COLUMN_HEAD = "px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-outline";

// Streamed by a route handler rather than served from public/, so the single
// committed copy in templates/ stays the only one.
const WORKBOOK_ROUTE = "workbook";

export function NewAnalysisForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const basePath = `/apps/operator-lens/projects/${encodeURIComponent(projectId)}/operator-lens`;
  const apiPath = `/api/apps/operator-lens/projects/${encodeURIComponent(projectId)}`;

  const [options, setOptions] = useState<Options>({ industryCodes: [], sizeBands: [], pairs: [] });
  const [name, setName] = useState("");
  const [industryCode, setIndustryCode] = useState("");
  const [sizeBand, setSizeBand] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadOptions = useCallback(async () => {
    try {
      const response = await fetch(`${apiPath}/benchmark-options`, { cache: "no-store" });
      if (!response.ok) throw new Error("no options");
      const payload = (await response.json()) as Options;
      setOptions(payload);
      setIndustryCode((current) => current || payload.industryCodes[0] || "");
    } catch {
      setMessage("Could not load the benchmark coverage. Reload the page.");
    }
  }, [apiPath]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  // Narrow the bands to those that exist for the chosen industry.
  const bandsForIndustry = useMemo(() => {
    const bands = options.pairs
      .filter((pair) => pair.industryCode === industryCode)
      .map((pair) => pair.sizeBand);
    return bands.length > 0 ? [...new Set(bands)].sort() : options.sizeBands;
  }, [options, industryCode]);

  useEffect(() => {
    if (bandsForIndustry.length > 0 && !bandsForIndustry.includes(sizeBand)) {
      setSizeBand(bandsForIndustry[0]);
    }
  }, [bandsForIndustry, sizeBand]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrors([]);
    setMessage(null);
    try {
      const body = new FormData();
      body.set("name", name);
      body.set("industryCode", industryCode);
      body.set("sizeBand", sizeBand);
      if (file) body.set("file", file);

      const response = await fetch(`${apiPath}/engagements`, { method: "POST", body });
      const payload = (await response.json().catch(() => ({}))) as {
        engagementId?: string;
        errors?: ValidationError[];
      };

      if (!response.ok) {
        if (payload.errors?.length) {
          setErrors(payload.errors);
        } else {
          setMessage("The upload failed. Nothing was saved.");
        }
        return;
      }

      router.push(`${basePath}/${encodeURIComponent(payload.engagementId ?? "")}`);
    } catch {
      setMessage("The upload failed. Nothing was saved.");
    } finally {
      setSubmitting(false);
    }
  };

  const noCoverage = options.industryCodes.length === 0;

  return (
    <PageShell
      eyebrow="Operator Lens"
      title="New analysis"
      description="Fill in the input workbook and upload it. Every figure is checked before anything is saved, and nothing is stored if a check fails."
    >
      <div className="space-y-6">
        <div className={CARD}>
          <p className="text-sm font-bold text-ink">1. Get the workbook</p>
          <p className="mt-1 text-sm leading-6 text-muted">
            Two sheets: Company and Income Statement. Column A holds machine codes the app reads,
            so leave them alone. Enter expenses as positive numbers, at one scale, and say which
            scale on the Company sheet. One to eight period columns, oldest to newest.
          </p>
          <a
            href={`${apiPath}/${WORKBOOK_ROUTE}`}
            download
            className="mt-4 inline-block rounded-full border border-slate-200 bg-canvas px-5 py-2.5 text-sm font-bold text-ink transition hover:border-ink/40"
          >
            Download input workbook (.xlsx)
          </a>
        </div>

        <form onSubmit={submit} className={CARD}>
          <p className="text-sm font-bold text-ink">2. Upload it</p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="analysis-name" className={LABEL}>
                Analysis name
              </label>
              <input
                id="analysis-name"
                className={FIELD}
                value={name}
                required
                placeholder="e.g. Project Northwind diligence"
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div>
              <label htmlFor="industry-code" className={LABEL}>
                Industry code
              </label>
              <select
                id="industry-code"
                className={FIELD}
                value={industryCode}
                onChange={(event) => setIndustryCode(event.target.value)}
                disabled={noCoverage}
              >
                {options.industryCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="size-band" className={LABEL}>
                Size band
              </label>
              <select
                id="size-band"
                className={FIELD}
                value={sizeBand}
                onChange={(event) => setSizeBand(event.target.value)}
                disabled={noCoverage}
              >
                {bandsForIndustry.map((band) => (
                  <option key={band} value={band}>
                    {band}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="workbook-file" className={LABEL}>
                Completed workbook
              </label>
              <input
                id="workbook-file"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                required
                className={FIELD}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <p className="mt-3 text-xs leading-5 text-outline">
            Only these industry and size band combinations have benchmark data, so only these can
            be selected. Anything else would leave the benchmark rules with nothing to compare
            against.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
            <button type="submit" className={PRIMARY_BUTTON} disabled={submitting || noCoverage}>
              {submitting ? "Checking and analysing..." : "Upload and analyse"}
            </button>
            <Link href={basePath} className="text-sm font-semibold text-muted hover:text-ink">
              Cancel
            </Link>
          </div>

          {noCoverage ? (
            <p className="mt-3 text-sm font-semibold text-red-600">
              No benchmark data is seeded for this project, so an analysis cannot be created.
            </p>
          ) : null}

          {message ? <p className="mt-3 text-sm font-semibold text-red-600">{message}</p> : null}

          {errors.length > 0 ? (
            <div className="mt-5 rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
              <p className="text-sm font-bold text-red-700">
                {errors.length} problem{errors.length === 1 ? "" : "s"} found. Nothing was saved.
              </p>
              <p className="mt-1 text-xs text-red-700">
                Fix these in the workbook and upload it again.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className={COLUMN_HEAD}>Sheet</th>
                      <th className={COLUMN_HEAD}>Row</th>
                      <th className={COLUMN_HEAD}>Field</th>
                      <th className={COLUMN_HEAD}>Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errors.map((error, index) => (
                      <tr key={index} className="border-t border-red-200/70 align-top">
                        <td className="px-4 py-2 font-semibold text-ink">{error.sheet}</td>
                        <td className="px-4 py-2 text-muted">{error.row}</td>
                        <td className="px-4 py-2 text-muted">{error.field}</td>
                        <td className="px-4 py-2 text-text">{error.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </form>
      </div>
    </PageShell>
  );
}
