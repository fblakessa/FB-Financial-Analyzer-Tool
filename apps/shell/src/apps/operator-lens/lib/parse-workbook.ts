// Reads the Operator Lens input workbook into canonical figures. Pure: no
// React, no Prisma, no clock, no network, no randomness. The workbook is read
// by the machine codes in column A, never by row position, so inserting a row
// in the sheet cannot silently shift a figure onto the wrong line item.
//
// Money leaves here as integer minor units (bigint), scaled by the workbook's
// declared UNIT_SCALE. Never a float.

import * as XLSX from "xlsx";

export type UnitScale = "ACTUALS" | "THOUSANDS" | "MILLIONS";

export type CanonicalCompany = {
  companyName: string;
  industryCode: string;
  sizeBand: string;
  fiscalYearEnd: Date;
  currency: string;
  unitScale: UnitScale;
  preparedBy: string;
  asOfDate: Date;
};

export type CanonicalPeriod = {
  label: string;
  endDate: Date;
  ordinal: number;
};

export type CanonicalLineItem = {
  code: string;
  // One entry per period, index-aligned with CanonicalFigures.periods.
  valuesMinor: (bigint | null)[];
};

export type CanonicalFigures = {
  company: CanonicalCompany;
  periods: CanonicalPeriod[];
  lineItems: CanonicalLineItem[];
};

const COMPANY_SHEET = "Company";
const INCOME_SHEET = "Income Statement";

// Column A codes on the Income Statement sheet that carry period metadata
// rather than figures.
const PERIOD_LABEL_CODE = "PERIOD_LABEL";
const PERIOD_END_CODE = "PERIOD_END";

const UNIT_SCALE_BY_LABEL: Record<string, UnitScale> = {
  actuals: "ACTUALS",
  thousands: "THOUSANDS",
  millions: "MILLIONS"
};

const SCALE_MULTIPLIER: Record<UnitScale, bigint> = {
  ACTUALS: 1n,
  THOUSANDS: 1000n,
  MILLIONS: 1000000n
};

// Figures are entered at the declared scale; minor units are hundredths of the
// currency unit. 32000 thousands becomes 3_200_000_000 minor units.
export function toMinorUnits(value: number, scale: UnitScale): bigint {
  return BigInt(Math.round(value * 100)) * SCALE_MULTIPLIER[scale];
}

type Grid = unknown[][];

function sheetGrid(workbook: XLSX.WorkBook, name: string): Grid {
  const sheet = workbook.Sheets[name];
  if (!sheet) {
    throw new Error(`Workbook is missing the "${name}" sheet.`);
  }
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true
  });
}

function cellText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function cellNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function cellDate(value: unknown, label: string): Date {
  if (value instanceof Date) return value;
  throw new Error(`${label} is not a date. Format the cell as a date and re-upload.`);
}

// Column A holds the code, column C the value.
function companyFields(grid: Grid): Map<string, unknown> {
  const fields = new Map<string, unknown>();
  for (const row of grid) {
    const code = cellText(row?.[0]);
    if (code) fields.set(code, row?.[2] ?? null);
  }
  return fields;
}

function requireText(fields: Map<string, unknown>, code: string): string {
  const text = cellText(fields.get(code));
  if (!text) throw new Error(`Company sheet is missing a value for ${code}.`);
  return text;
}

function parseUnitScale(raw: string): UnitScale {
  const scale = UNIT_SCALE_BY_LABEL[raw.toLowerCase()];
  if (!scale) {
    throw new Error(
      `UNIT_SCALE "${raw}" is not one of Actuals, Thousands or Millions.`
    );
  }
  return scale;
}

function parseCompany(grid: Grid): CanonicalCompany {
  const fields = companyFields(grid);
  return {
    companyName: requireText(fields, "COMPANY_NAME"),
    industryCode: requireText(fields, "INDUSTRY_CODE"),
    sizeBand: requireText(fields, "SIZE_BAND"),
    fiscalYearEnd: cellDate(fields.get("FISCAL_YEAR_END"), "FISCAL_YEAR_END"),
    currency: requireText(fields, "CURRENCY"),
    unitScale: parseUnitScale(requireText(fields, "UNIT_SCALE")),
    preparedBy: requireText(fields, "PREPARED_BY"),
    asOfDate: cellDate(fields.get("AS_OF_DATE"), "AS_OF_DATE")
  };
}

function findRow(grid: Grid, code: string): unknown[] {
  const row = grid.find((candidate) => cellText(candidate?.[0]) === code);
  if (!row) throw new Error(`Income Statement sheet is missing the ${code} row.`);
  return row;
}

// Period columns start at column C (index 2) and run left to right, oldest
// first. The count comes from how many period labels are filled in.
function parsePeriods(grid: Grid): CanonicalPeriod[] {
  const labelRow = findRow(grid, PERIOD_LABEL_CODE);
  const endRow = findRow(grid, PERIOD_END_CODE);

  const periods: CanonicalPeriod[] = [];
  for (let column = 2; column < labelRow.length; column++) {
    const label = cellText(labelRow[column]);
    if (!label) break;
    periods.push({
      label,
      endDate: cellDate(endRow[column], `PERIOD_END for "${label}"`),
      ordinal: periods.length
    });
  }

  if (periods.length === 0) {
    throw new Error("Income Statement sheet has no period columns.");
  }
  if (periods.length > 8) {
    throw new Error(`Income Statement sheet has ${periods.length} period columns; the maximum is 8.`);
  }
  return periods;
}

function parseLineItems(grid: Grid, periodCount: number, scale: UnitScale): CanonicalLineItem[] {
  const items: CanonicalLineItem[] = [];
  for (const row of grid) {
    const code = cellText(row?.[0]);
    if (!code || code === PERIOD_LABEL_CODE || code === PERIOD_END_CODE) continue;
    // Codes are UPPER_SNAKE; anything else on the sheet is prose, not a figure.
    if (!/^[A-Z][A-Z0-9_]*$/.test(code)) continue;

    const valuesMinor: (bigint | null)[] = [];
    for (let column = 2; column < 2 + periodCount; column++) {
      const value = cellNumber(row[column]);
      valuesMinor.push(value === null ? null : toMinorUnits(value, scale));
    }
    items.push({ code, valuesMinor });
  }

  if (items.length === 0) {
    throw new Error("Income Statement sheet has no line item rows.");
  }
  return items;
}

export function parseWorkbook(data: Buffer | Uint8Array): CanonicalFigures {
  // cellDates so Excel serials arrive as Date objects rather than numbers.
  const workbook = XLSX.read(data, { type: "buffer", cellDates: true });

  const company = parseCompany(sheetGrid(workbook, COMPANY_SHEET));
  const incomeGrid = sheetGrid(workbook, INCOME_SHEET);
  const periods = parsePeriods(incomeGrid);
  const lineItems = parseLineItems(incomeGrid, periods.length, company.unitScale);

  return { company, periods, lineItems };
}
