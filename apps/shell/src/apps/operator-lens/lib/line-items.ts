// Presentation metadata for income statement line items. Pure: no React, no
// Prisma, no clock, no network.
//
// The order here is income statement order, which is the only order a
// consultant reads a P&L in. Alphabetical would put COGS above Revenue and
// scatter the derived subtotals, so never sort these by code.

import type { UnitScale } from "./parse-workbook";

export type LineItemMeta = {
  code: string;
  label: string;
  // Derived rows are recalculated by the engine and shown as subtotals.
  derived: boolean;
};

export const LINE_ITEM_ORDER: LineItemMeta[] = [
  { code: "REVENUE", label: "Revenue", derived: false },
  { code: "COGS", label: "Cost of Goods Sold", derived: false },
  { code: "GROSS_PROFIT", label: "Gross Profit", derived: true },
  { code: "SELLING", label: "Selling Expense", derived: false },
  { code: "G_AND_A", label: "General & Administrative", derived: false },
  { code: "SGA_TOTAL", label: "SG&A Total", derived: true },
  { code: "R_AND_D", label: "Research & Development", derived: false },
  { code: "OTHER_OPEX", label: "Other Operating Expense", derived: false },
  { code: "EBITDA", label: "EBITDA", derived: true },
  { code: "D_AND_A", label: "Depreciation & Amortisation", derived: false },
  { code: "EBIT", label: "EBIT (Operating Income)", derived: true },
  { code: "INTEREST", label: "Interest Expense", derived: false },
  { code: "OTHER_INCOME", label: "Other Income / (Expense)", derived: false },
  { code: "PRETAX_INCOME", label: "Pre-tax Income", derived: true },
  { code: "INCOME_TAX", label: "Income Tax", derived: false },
  { code: "NET_INCOME", label: "Net Income", derived: true }
];

const ORDER_INDEX = new Map(LINE_ITEM_ORDER.map((item, index) => [item.code, index]));

// Any code not in the canonical list sorts after the ones that are, rather
// than being dropped, so an unexpected row stays visible.
export function lineItemRank(code: string): number {
  return ORDER_INDEX.get(code) ?? LINE_ITEM_ORDER.length;
}

export function lineItemLabel(code: string): string {
  return LINE_ITEM_ORDER.find((item) => item.code === code)?.label ?? code;
}

export function isDerivedRow(code: string): boolean {
  return LINE_ITEM_ORDER.find((item) => item.code === code)?.derived ?? false;
}

// Minor units are hundredths of the currency unit. Operators enter figures at a
// declared scale, and expect to read them back at the same scale: a company
// entered in thousands shows 32,000, not 3,200,000,000 cents.
const SCALE_DIVISOR: Record<UnitScale, number> = {
  ACTUALS: 100,
  THOUSANDS: 100_000,
  MILLIONS: 100_000_000
};

const SCALE_LABEL: Record<UnitScale, string> = {
  ACTUALS: "actuals",
  THOUSANDS: "thousands",
  MILLIONS: "millions"
};

export function unitScaleLabel(currency: string, unitScale: string): string {
  const label = SCALE_LABEL[unitScale as UnitScale];
  return label ? `${currency} ${label}` : currency;
}

// Display only. Comparisons happen on integer minor units and basis points
// inside the engine, never on this value.
export function formatMoney(valueMinor: string, unitScale: string): string {
  const divisor = SCALE_DIVISOR[unitScale as UnitScale] ?? 100;
  const value = Number(BigInt(valueMinor)) / divisor;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}
