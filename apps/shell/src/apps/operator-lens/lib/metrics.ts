// Ratios, growth rates and derived-row recalculation. Pure: no React, no
// Prisma, no clock, no network, no randomness.
//
// Two rules make the engine reproducible:
//   1. Money arrives as integer minor units (bigint) and is never a float.
//   2. Every ratio passes through roundRatio() once, and comparisons happen on
//      integer basis points from toBps(). Nothing else rounds.

export const RATIO_DECIMALS = 4;

const RATIO_SCALE = 10 ** RATIO_DECIMALS;
const BPS_PER_UNIT = 10000;

// THE rounding choke point. Every ratio in the engine goes through here exactly
// once, so two runs on the same figures cannot diverge in the last decimal.
export function roundRatio(value: number): number {
  return Math.round(value * RATIO_SCALE) / RATIO_SCALE;
}

// Integer basis points from an already-rounded ratio. Rule thresholds are
// compared in bps so no float comparison ever decides whether a flag fires.
export function toBps(ratio: number): number {
  return Math.round(roundRatio(ratio) * BPS_PER_UNIT);
}

// Minor units are well inside Number.MAX_SAFE_INTEGER for the revenue bands
// this module covers, so ratio arithmetic in Number is safe once the division
// happens.
function toNumber(minor: bigint): number {
  return Number(minor);
}

export function ratio(numerator: bigint | null, denominator: bigint | null): number | null {
  if (numerator === null || denominator === null || denominator === 0n) return null;
  return roundRatio(toNumber(numerator) / toNumber(denominator));
}

// Period-over-period growth as a rounded ratio. Null when there is no usable
// base to grow from, which is what makes a rule skip rather than fire.
export function growth(previous: bigint | null, current: bigint | null): number | null {
  if (previous === null || current === null || previous === 0n) return null;
  return roundRatio(toNumber(current - previous) / Math.abs(toNumber(previous)));
}

export type ValueLookup = (code: string) => bigint | null;

// Derived rows, each recalculated from ENTERED PRIMITIVES rather than from
// other entered derived rows. That isolation matters: one wrong derived cell
// then reconciles against exactly one recalculation, instead of cascading a
// single operator error into a flag on every row beneath it.
export const DERIVED_ROW_CODES = [
  "GROSS_PROFIT",
  "SGA_TOTAL",
  "EBITDA",
  "EBIT",
  "PRETAX_INCOME",
  "NET_INCOME"
] as const;

export type DerivedRowCode = (typeof DERIVED_ROW_CODES)[number];

function add(...values: (bigint | null)[]): bigint | null {
  let total = 0n;
  for (const value of values) {
    if (value === null) return null;
    total += value;
  }
  return total;
}

function negate(value: bigint | null): bigint | null {
  return value === null ? null : -value;
}

export function recalculateDerived(code: DerivedRowCode, get: ValueLookup): bigint | null {
  const grossProfit = add(get("REVENUE"), negate(get("COGS")));
  const sgaTotal = add(get("SELLING"), get("G_AND_A"));
  const ebitda = add(grossProfit, negate(sgaTotal), negate(get("R_AND_D")), negate(get("OTHER_OPEX")));
  const ebit = add(ebitda, negate(get("D_AND_A")));
  const pretax = add(ebit, negate(get("INTEREST")), get("OTHER_INCOME"));

  switch (code) {
    case "GROSS_PROFIT":
      return grossProfit;
    case "SGA_TOTAL":
      return sgaTotal;
    case "EBITDA":
      return ebitda;
    case "EBIT":
      return ebit;
    case "PRETAX_INCOME":
      return pretax;
    case "NET_INCOME":
      return add(pretax, negate(get("INCOME_TAX")));
  }
}

// Relative disagreement between an entered derived row and its recalculation,
// in integer basis points. When the recalculation is zero any non-zero entry is
// a full disagreement, since there is no base to take a percentage of.
export function disagreementBps(entered: bigint, recalculated: bigint): number {
  if (recalculated === 0n) return entered === 0n ? 0 : BPS_PER_UNIT;
  const relative = Math.abs(toNumber(entered - recalculated)) / Math.abs(toNumber(recalculated));
  return toBps(relative);
}
