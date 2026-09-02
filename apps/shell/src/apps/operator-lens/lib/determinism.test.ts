import { describe, expect, it } from "vitest";

import { analyse } from "./engine";
import {
  buildFigures,
  C01_COMPANY,
  CLEAN_COMPANY,
  T01_COMPANY,
  T02_COMPANY,
  T03_COMPANY,
  T04_COMPANY,
  T05_COMPANY
} from "./fixtures";
import { RULESET_VERSION } from "./ruleset";

const ALL_FIXTURES = [
  CLEAN_COMPANY,
  T01_COMPANY,
  T02_COMPANY,
  T03_COMPANY,
  T04_COMPANY,
  T05_COMPANY,
  C01_COMPANY
];

describe("determinism", () => {
  it("produces identical output for the same input, twice", () => {
    for (const spec of ALL_FIXTURES) {
      const first = analyse(buildFigures(spec));
      const second = analyse(buildFigures(spec));
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    }
  });

  it("does not depend on the order line items arrive in", () => {
    const figures = buildFigures(T02_COMPANY);
    const reversed = { ...figures, lineItems: [...figures.lineItems].reverse() };
    expect(JSON.stringify(analyse(reversed))).toBe(JSON.stringify(analyse(figures)));
  });

  it("does not depend on the order periods arrive in", () => {
    const figures = buildFigures(T02_COMPANY);
    const shuffled = { ...figures, periods: [...figures.periods].reverse() };
    expect(JSON.stringify(analyse(shuffled))).toBe(JSON.stringify(analyse(figures)));
  });

  it("stamps the ruleset version on every result", () => {
    expect(analyse(buildFigures(CLEAN_COMPANY)).rulesetVersion).toBe(RULESET_VERSION);
  });
});
