"use client";

import type { CategoryScore, Scorecard } from "../lib/scorecard";
import type { ScorecardCategory } from "../lib/ruleset";

// Four category scores derived from the same flags (SPEC §8.5). A view, not a
// second analysis. Clicking a category filters the findings list to its flags.

const CARD = "rounded-[28px] bg-card p-6 shadow-ambient ring-1 ring-slate-200/70";

// Bands rather than a continuous colour ramp, so the same score always reads
// the same way.
function scoreStyle(score: number): string {
  if (score >= 90) return "text-teal";
  if (score >= 70) return "text-ink";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

function CategoryTile({
  entry,
  selected,
  onSelect
}: {
  entry: CategoryScore;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`rounded-2xl p-4 text-left transition ${
        selected
          ? "bg-canvas ring-2 ring-ink/40"
          : "bg-canvas ring-1 ring-slate-200 hover:ring-ink/30"
      }`}
    >
      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-outline">
        {entry.label}
      </p>
      <p className={`mt-2 font-display text-3xl font-semibold tabular-nums ${scoreStyle(entry.score)}`}>
        {entry.score}
      </p>

      <p className="mt-2 text-xs text-muted">
        {entry.deductedFlagCount === 0
          ? "Nothing outstanding"
          : `${entry.deductedFlagCount} outstanding, -${100 - entry.score} points`}
      </p>

      {entry.dismissedFlagCount > 0 || entry.reviewedFlagCount > 0 ? (
        <p className="mt-1 text-xs text-outline">
          {[
            entry.dismissedFlagCount > 0 ? `${entry.dismissedFlagCount} dismissed` : null,
            entry.reviewedFlagCount > 0 ? `${entry.reviewedFlagCount} reviewed` : null
          ]
            .filter(Boolean)
            .join(", ")}{" "}
          excluded
        </p>
      ) : null}

      {/* A category with a gap is not a clean bill of health, however high the
          number is, so the caveat sits on the tile itself. */}
      {entry.coverageGaps.length > 0 ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
          Reduced coverage: {entry.coverageGaps.length} rule
          {entry.coverageGaps.length === 1 ? "" : "s"} could not run
        </p>
      ) : null}
    </button>
  );
}

export function ScorecardPanel({
  scorecard,
  selectedCategory,
  onSelectCategory
}: {
  scorecard: Scorecard;
  selectedCategory: ScorecardCategory | "ALL";
  onSelectCategory: (category: ScorecardCategory | "ALL") => void;
}) {
  // The detailed gap list lives on the findings screen so it is stated once,
  // and prominently. The per-tile badge below keeps the caveat attached to the
  // score it qualifies.
  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-ink">Scorecard</p>
        {selectedCategory === "ALL" ? (
          <p className="text-xs text-outline">Select a category to filter the findings</p>
        ) : (
          <button
            type="button"
            onClick={() => onSelectCategory("ALL")}
            className="text-xs font-semibold text-muted underline hover:text-ink"
          >
            Clear category filter
          </button>
        )}
      </div>

      <p className="mt-1 text-sm text-muted">
        Each category starts at 100. Open and escalated findings deduct 25 for high, 10 for medium
        and 5 for low. Dismissed findings are excluded.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {scorecard.categories.map((entry) => (
          <CategoryTile
            key={entry.category}
            entry={entry}
            selected={selectedCategory === entry.category}
            onSelect={() =>
              onSelectCategory(selectedCategory === entry.category ? "ALL" : entry.category)
            }
          />
        ))}
      </div>


    </div>
  );
}
