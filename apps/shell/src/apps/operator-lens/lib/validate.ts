// Door checks for an uploaded workbook (SPEC §6). Pure: no React, no Prisma,
// no clock, no network.
//
// Returns every problem it finds rather than throwing on the first, because an
// operator fixing a spreadsheet needs the whole list, not one error at a time.
// Nothing is persisted unless this returns an empty array.

import {
  DERIVED_ROW_CODES,
  disagreementBps,
  recalculateDerived,
  type DerivedRowCode
} from "./metrics";

export type ValidationError = {
  // Where to look, in the operator's terms: the sheet, the row, the field.
  sheet: string;
  row: string;
  field: string;
  message: string;
};

// Structural shape only, so this works on parsed workbook figures or on
// figures read back out of the database.
export type ValidatableFigures = {
  company: {
    companyName: string;
    industryCode: string;
    sizeBand: string;
  };
  periods: { label: string; endDate: Date; ordinal: number }[];
  lineItems: { code: string; valuesMinor: (bigint | null)[] }[];
};

export type ValidateOptions = {
  // What the operator selected on the upload screen. Authoritative, because
  // industry classification is a confirmed input, never inferred.
  selectedIndustryCode: string;
  selectedSizeBand: string;
  // Distinct values present in the seeded benchmark table.
  allowedIndustryCodes: string[];
  allowedSizeBands: string[];
};

const MAX_PERIODS = 8;
const DERIVED_TOLERANCE_BPS = 50; // 0.50%

const COMPANY_SHEET = "Company";
const INCOME_SHEET = "Income Statement";

export function validateFigures(
  figures: ValidatableFigures,
  options: ValidateOptions
): ValidationError[] {
  const errors: ValidationError[] = [];

  // --- Company sheet -----------------------------------------------------
  if (!options.allowedIndustryCodes.includes(options.selectedIndustryCode)) {
    errors.push({
      sheet: COMPANY_SHEET,
      row: "Industry",
      field: "INDUSTRY_CODE",
      message: `"${options.selectedIndustryCode}" has no benchmark data. Valid codes: ${options.allowedIndustryCodes.join(", ")}.`
    });
  }

  if (!options.allowedSizeBands.includes(options.selectedSizeBand)) {
    errors.push({
      sheet: COMPANY_SHEET,
      row: "Size band (annual revenue)",
      field: "SIZE_BAND",
      message: `"${options.selectedSizeBand}" has no benchmark data. Valid bands: ${options.allowedSizeBands.join(", ")}.`
    });
  }

  // The selection wins, so a disagreement is reported rather than silently
  // overriding what the workbook says.
  if (figures.company.industryCode !== options.selectedIndustryCode) {
    errors.push({
      sheet: COMPANY_SHEET,
      row: "Industry",
      field: "INDUSTRY_CODE",
      message: `Workbook says "${figures.company.industryCode}" but "${options.selectedIndustryCode}" was selected. Make them match.`
    });
  }

  if (figures.company.sizeBand !== options.selectedSizeBand) {
    errors.push({
      sheet: COMPANY_SHEET,
      row: "Size band (annual revenue)",
      field: "SIZE_BAND",
      message: `Workbook says "${figures.company.sizeBand}" but "${options.selectedSizeBand}" was selected. Make them match.`
    });
  }

  if (!figures.company.companyName.trim()) {
    errors.push({
      sheet: COMPANY_SHEET,
      row: "Company name",
      field: "COMPANY_NAME",
      message: "Company name is required."
    });
  }

  // --- Income Statement sheet -------------------------------------------
  if (figures.periods.length === 0) {
    errors.push({
      sheet: INCOME_SHEET,
      row: "Period label",
      field: "PERIOD_LABEL",
      message: "No period columns found. Fill in at least one."
    });
  }

  if (figures.periods.length > MAX_PERIODS) {
    errors.push({
      sheet: INCOME_SHEET,
      row: "Period label",
      field: "PERIOD_LABEL",
      message: `${figures.periods.length} period columns found; the maximum is ${MAX_PERIODS}.`
    });
  }

  const ordered = [...figures.periods].sort((a, b) => a.ordinal - b.ordinal);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].endDate.getTime() <= ordered[i - 1].endDate.getTime()) {
      errors.push({
        sheet: INCOME_SHEET,
        row: "Period end date",
        field: "PERIOD_END",
        message: `${ordered[i].label} ends on or before ${ordered[i - 1].label}. Period columns must run oldest to newest, left to right.`
      });
    }
  }

  const valueAt = (code: string, ordinal: number): bigint | null => {
    const item = figures.lineItems.find((candidate) => candidate.code === code);
    if (!item) return null;
    return item.valuesMinor[ordinal] ?? null;
  };

  for (const period of ordered) {
    const revenue = valueAt("REVENUE", period.ordinal);
    if (revenue === null || revenue === 0n) {
      errors.push({
        sheet: INCOME_SHEET,
        row: "Revenue",
        field: "REVENUE",
        message: `Revenue is blank or zero for ${period.label}. Every period needs revenue.`
      });
    }
  }

  // Entered derived rows must reconcile with their recalculation. Partial
  // imports are not permitted, so any disagreement blocks the whole upload.
  for (const period of ordered) {
    const get = (code: string) => valueAt(code, period.ordinal);
    for (const code of DERIVED_ROW_CODES) {
      const entered = get(code);
      if (entered === null) continue;
      const recalculated = recalculateDerived(code as DerivedRowCode, get);
      if (recalculated === null) continue;
      const gapBps = disagreementBps(entered, recalculated);
      if (gapBps > DERIVED_TOLERANCE_BPS) {
        errors.push({
          sheet: INCOME_SHEET,
          row: code,
          field: `${code} / ${period.label}`,
          message: `Entered ${(Number(entered) / 100).toLocaleString("en-US")} but the statement recalculates to ${(Number(recalculated) / 100).toLocaleString("en-US")}, a ${(gapBps / 100).toFixed(2)}% difference. Tolerance is 0.50%.`
        });
      }
    }
  }

  return errors;
}
