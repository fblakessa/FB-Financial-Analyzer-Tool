import { describe, expect, it } from "vitest";

import { validateFigures, type ValidatableFigures } from "./validate";

const OPTIONS = {
  selectedIndustryCode: "CONSUMER_RETAIL",
  selectedSizeBand: "$25M - $100M",
  allowedIndustryCodes: ["CONSUMER_RETAIL", "SOFTWARE_SAAS"],
  allowedSizeBands: ["$25M - $100M", "$100M - $500M"]
};

// A statement that reconciles: revenue 1000, COGS 400, SG&A 300, D&A 50.
function figures(overrides: Partial<ValidatableFigures> = {}): ValidatableFigures {
  return {
    company: {
      companyName: "Test Co",
      industryCode: "CONSUMER_RETAIL",
      sizeBand: "$25M - $100M"
    },
    periods: [
      { label: "FY2024", endDate: new Date("2024-12-31"), ordinal: 0 },
      { label: "FY2025", endDate: new Date("2025-12-31"), ordinal: 1 }
    ],
    lineItems: [
      { code: "REVENUE", valuesMinor: [100000n, 110000n] },
      { code: "COGS", valuesMinor: [40000n, 44000n] },
      { code: "GROSS_PROFIT", valuesMinor: [60000n, 66000n] },
      { code: "SELLING", valuesMinor: [20000n, 22000n] },
      { code: "G_AND_A", valuesMinor: [10000n, 11000n] },
      { code: "SGA_TOTAL", valuesMinor: [30000n, 33000n] },
      { code: "R_AND_D", valuesMinor: [0n, 0n] },
      { code: "OTHER_OPEX", valuesMinor: [5000n, 5500n] },
      { code: "EBITDA", valuesMinor: [25000n, 27500n] },
      { code: "D_AND_A", valuesMinor: [5000n, 5500n] },
      { code: "EBIT", valuesMinor: [20000n, 22000n] }
    ],
    ...overrides
  };
}

describe("validateFigures", () => {
  it("passes a clean workbook", () => {
    expect(validateFigures(figures(), OPTIONS)).toEqual([]);
  });

  it("rejects an industry with no benchmark data and lists the valid codes", () => {
    const errors = validateFigures(figures(), { ...OPTIONS, selectedIndustryCode: "NOPE" });
    const error = errors.find((entry) => entry.field === "INDUSTRY_CODE");
    expect(error?.sheet).toBe("Company");
    expect(error?.message).toContain("CONSUMER_RETAIL");
  });

  it("rejects a size band with no benchmark data", () => {
    const errors = validateFigures(figures(), { ...OPTIONS, selectedSizeBand: "Over $500M" });
    expect(errors.some((entry) => entry.field === "SIZE_BAND")).toBe(true);
  });

  it("reports a workbook that disagrees with the selection rather than overriding it", () => {
    const subject = figures();
    subject.company.industryCode = "SOFTWARE_SAAS";
    const errors = validateFigures(subject, OPTIONS);
    const error = errors.find((entry) => entry.field === "INDUSTRY_CODE");
    expect(error?.message).toContain("SOFTWARE_SAAS");
    expect(error?.message).toContain("CONSUMER_RETAIL");
  });

  it("rejects more than eight periods", () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      label: `FY${2017 + index}`,
      endDate: new Date(`${2017 + index}-12-31`),
      ordinal: index
    }));
    const errors = validateFigures(figures({ periods: many }), OPTIONS);
    expect(errors.some((entry) => entry.message.includes("maximum is 8"))).toBe(true);
  });

  it("rejects period end dates that do not strictly increase", () => {
    const subject = figures();
    subject.periods[1].endDate = new Date("2024-12-31");
    const errors = validateFigures(subject, OPTIONS);
    expect(errors.some((entry) => entry.field === "PERIOD_END")).toBe(true);
  });

  it("rejects blank or zero revenue, naming the period", () => {
    const subject = figures();
    subject.lineItems[0].valuesMinor = [100000n, 0n];
    const errors = validateFigures(subject, OPTIONS);
    const error = errors.find((entry) => entry.field === "REVENUE");
    expect(error?.message).toContain("FY2025");
  });

  it("rejects a derived row that does not reconcile, naming the row and period", () => {
    const subject = figures();
    // Gross profit entered 20% too high.
    subject.lineItems[2].valuesMinor = [72000n, 66000n];
    const errors = validateFigures(subject, OPTIONS);
    const error = errors.find((entry) => entry.row === "GROSS_PROFIT");
    expect(error?.sheet).toBe("Income Statement");
    expect(error?.field).toContain("FY2024");
  });

  it("allows a derived row inside the 0.50% tolerance", () => {
    const subject = figures();
    // 60000 -> 60200 is 0.33%.
    subject.lineItems[2].valuesMinor = [60200n, 66000n];
    expect(validateFigures(subject, OPTIONS)).toEqual([]);
  });

  it("returns every problem at once rather than stopping at the first", () => {
    const subject = figures();
    subject.company.companyName = "";
    subject.lineItems[0].valuesMinor = [0n, 0n];
    const errors = validateFigures(subject, { ...OPTIONS, selectedIndustryCode: "NOPE" });
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });
});
