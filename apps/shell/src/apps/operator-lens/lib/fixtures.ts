// Test fixtures for the rules engine. One company per rule, each built so that
// exactly one rule fires, plus a clean company where none do.
//
// Every fixture reconciles its derived rows unless it is the C-01 fixture, so a
// coherence flag never contaminates a trend fixture. Figures are whole currency
// units and are converted to minor units here.

import type { EngineFigures } from "./engine";

type FixtureSpec = {
  periods: string[];
  // Code -> one value per period, in whole currency units.
  rows: Record<string, number[]>;
};

export function buildFigures(spec: FixtureSpec): EngineFigures {
  return {
    periods: spec.periods.map((label, ordinal) => ({ label, ordinal })),
    lineItems: Object.entries(spec.rows).map(([code, values]) => ({
      code,
      valuesMinor: values.map((value) => BigInt(Math.round(value * 100)))
    }))
  };
}

// Three periods scaled by exactly 1.10 then 1.21, so every ratio is constant:
// flat gross margin, flat EBITDA margin, cost growth equal to revenue growth,
// and equal growth rates so nothing decelerates.
export const CLEAN_COMPANY: FixtureSpec = {
  periods: ["FY2023", "FY2024", "FY2025"],
  rows: {
    REVENUE: [1000, 1100, 1210],
    COGS: [400, 440, 484],
    GROSS_PROFIT: [600, 660, 726],
    SELLING: [200, 220, 242],
    G_AND_A: [100, 110, 121],
    SGA_TOTAL: [300, 330, 363],
    R_AND_D: [0, 0, 0],
    OTHER_OPEX: [50, 55, 60.5],
    EBITDA: [250, 275, 302.5],
    D_AND_A: [50, 55, 60.5],
    EBIT: [200, 220, 242],
    INTEREST: [20, 22, 24.2],
    OTHER_INCOME: [0, 0, 0],
    PRETAX_INCOME: [180, 198, 217.8],
    INCOME_TAX: [40, 44, 48.4],
    NET_INCOME: [140, 154, 169.4]
  }
};

// SG&A grows 15.00% against revenue at 10.00%: a 5.00pp gap, exactly at the
// threshold. COGS tracks revenue and gross margin holds, so T-04 stays quiet;
// the EBITDA margin fall is 136bps, under T-05's 200bps. Two periods, so the
// three-period rules are skipped rather than passed.
export const T01_COMPANY: FixtureSpec = {
  periods: ["FY2023", "FY2024"],
  rows: {
    REVENUE: [1000, 1100],
    COGS: [400, 440],
    GROSS_PROFIT: [600, 660],
    SELLING: [200, 230],
    G_AND_A: [100, 115],
    SGA_TOTAL: [300, 345],
    R_AND_D: [0, 0],
    OTHER_OPEX: [50, 55],
    EBITDA: [250, 260],
    D_AND_A: [50, 55],
    EBIT: [200, 205],
    INTEREST: [20, 22],
    OTHER_INCOME: [0, 0],
    PRETAX_INCOME: [180, 183],
    INCOME_TAX: [40, 44],
    NET_INCOME: [140, 139]
  }
};

// Gross margin 40.00% -> 38.50% -> 37.00%: two consecutive 150bps
// compressions. A low gross margin is what keeps the COGS/revenue growth gap
// (275bps then 268bps) under T-04's 300bps, and SG&A tracks revenue so T-01
// stays quiet. Revenue growth is a flat 10.00%, so T-03 does not fire.
export const T02_COMPANY: FixtureSpec = {
  periods: ["FY2023", "FY2024", "FY2025"],
  rows: {
    REVENUE: [1000, 1100, 1210],
    COGS: [600, 676.5, 762.3],
    GROSS_PROFIT: [400, 423.5, 447.7],
    SELLING: [200, 220, 242],
    G_AND_A: [100, 110, 121],
    SGA_TOTAL: [300, 330, 363],
    R_AND_D: [0, 0, 0],
    OTHER_OPEX: [20, 22, 24.2],
    EBITDA: [80, 71.5, 60.5],
    D_AND_A: [10, 11, 12.1],
    EBIT: [70, 60.5, 48.4],
    INTEREST: [5, 5.5, 6.05],
    OTHER_INCOME: [0, 0, 0],
    PRETAX_INCOME: [65, 55, 42.35],
    INCOME_TAX: [15, 12, 10],
    NET_INCOME: [50, 43, 32.35]
  }
};

// Revenue growth 10.00% then 5.00%. Every other ratio is held constant by
// scaling the whole statement, so only the deceleration is visible.
export const T03_COMPANY: FixtureSpec = {
  periods: ["FY2023", "FY2024", "FY2025"],
  rows: {
    REVENUE: [1000, 1100, 1155],
    COGS: [400, 440, 462],
    GROSS_PROFIT: [600, 660, 693],
    SELLING: [200, 220, 231],
    G_AND_A: [100, 110, 115.5],
    SGA_TOTAL: [300, 330, 346.5],
    R_AND_D: [0, 0, 0],
    OTHER_OPEX: [50, 55, 57.75],
    EBITDA: [250, 275, 288.75],
    D_AND_A: [50, 55, 57.75],
    EBIT: [200, 220, 231],
    INTEREST: [20, 22, 23.1],
    OTHER_INCOME: [0, 0, 0],
    PRETAX_INCOME: [180, 198, 207.9],
    INCOME_TAX: [40, 44, 46.2],
    NET_INCOME: [140, 154, 161.7]
  }
};

// COGS grows 13.00% against revenue at 10.00%: a 3.00pp gap, exactly at the
// threshold. SG&A tracks revenue, and the EBITDA margin fall is 109bps.
export const T04_COMPANY: FixtureSpec = {
  periods: ["FY2023", "FY2024"],
  rows: {
    REVENUE: [1000, 1100],
    COGS: [400, 452],
    GROSS_PROFIT: [600, 648],
    SELLING: [200, 220],
    G_AND_A: [100, 110],
    SGA_TOTAL: [300, 330],
    R_AND_D: [0, 0],
    OTHER_OPEX: [50, 55],
    EBITDA: [250, 263],
    D_AND_A: [50, 55],
    EBIT: [200, 208],
    INTEREST: [20, 22],
    OTHER_INCOME: [0, 0],
    PRETAX_INCOME: [180, 186],
    INCOME_TAX: [40, 44],
    NET_INCOME: [140, 142]
  }
};

// EBITDA margin 25.00% -> 23.00% on 10.00% revenue growth: a 200bps fall,
// exactly at the threshold. The fall comes entirely from other operating
// expense, so gross margin holds and both cost-growth rules stay quiet.
export const T05_COMPANY: FixtureSpec = {
  periods: ["FY2023", "FY2024"],
  rows: {
    REVENUE: [1000, 1100],
    COGS: [400, 440],
    GROSS_PROFIT: [600, 660],
    SELLING: [200, 220],
    G_AND_A: [100, 110],
    SGA_TOTAL: [300, 330],
    R_AND_D: [0, 0],
    OTHER_OPEX: [50, 77],
    EBITDA: [250, 253],
    D_AND_A: [50, 55],
    EBIT: [200, 198],
    INTEREST: [20, 22],
    OTHER_INCOME: [0, 0],
    PRETAX_INCOME: [180, 176],
    INCOME_TAX: [40, 44],
    NET_INCOME: [140, 132]
  }
};

// One period, so every trend rule is skipped. Entered GROSS_PROFIT is 620
// against a recalculation of 600: a 3.33% disagreement. Because derived rows
// are recalculated from primitives, only GROSS_PROFIT flags.
export const C01_COMPANY: FixtureSpec = {
  periods: ["FY2023"],
  rows: {
    REVENUE: [1000],
    COGS: [400],
    GROSS_PROFIT: [620],
    SELLING: [200],
    G_AND_A: [100],
    SGA_TOTAL: [300],
    R_AND_D: [0],
    OTHER_OPEX: [50],
    EBITDA: [250],
    D_AND_A: [50],
    EBIT: [200],
    INTEREST: [20],
    OTHER_INCOME: [0],
    PRETAX_INCOME: [180],
    INCOME_TAX: [40],
    NET_INCOME: [140]
  }
};
