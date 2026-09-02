// The rule catalogue. Definitions and operator prompts live together so a rule
// and its prompt can never drift apart (SPEC §7).
//
// RULESET_VERSION is stamped on every engagement. Bump it whenever a rule id,
// threshold, severity or prompt changes, so re-running an old engagement
// reproduces what it originally said rather than what the rules say today.

export const RULESET_VERSION = "1.1.0";

export type RuleAxis = "BENCHMARK" | "TREND" | "COHERENCE";
export type RuleSeverity = "HIGH" | "MEDIUM" | "LOW";

export type RuleDefinition = {
  id: string;
  axis: RuleAxis;
  severity: RuleSeverity;
  // Periods required before the rule is evaluated at all. Below this the rule
  // is skipped and reported as reduced coverage, never as a pass.
  minPeriods: number;
  // Short label for the flag title; the engine appends the periods compared.
  title: string;
  // Human-readable threshold, rendered on the flag next to the computed value.
  threshold: string;
  // Integer basis points, so no float comparison decides whether a flag fires.
  thresholdBps: number;
  operatorPrompt: string;
};

// Nine of the fourteen rules in SPEC §7. Not implemented yet: B-04 (R&D
// outside P10-P90), T-06, C-02, C-03, C-04. The engine does not claim coverage
// of them.
export const RULES: RuleDefinition[] = [
  {
    id: "B-01",
    axis: "BENCHMARK",
    severity: "HIGH",
    minPeriods: 1,
    title: "Gross margin below the industry lower quartile",
    threshold: "Gross margin below industry P25",
    // Benchmark rules compare against a seeded percentile, not a fixed gap, so
    // the threshold is the percentile itself rather than a bps constant.
    thresholdBps: 0,
    operatorPrompt:
      "Establish whether this is price or cost before anything else. Get the gross margin split by product category and channel, and compare the discounting calendar against the peer set. A structurally low margin and a promotional habit need different remedies."
  },
  {
    id: "B-02",
    axis: "BENCHMARK",
    severity: "HIGH",
    minPeriods: 1,
    title: "SG&A as a percent of revenue above the industry upper quartile",
    threshold: "SG&A as a percent of revenue above industry P75",
    thresholdBps: 0,
    operatorPrompt:
      "Compare the SG&A build to the benchmark composition. Overweight sales spend and overweight G&A point at different problems and different remedies."
  },
  {
    id: "B-03",
    axis: "BENCHMARK",
    severity: "HIGH",
    minPeriods: 1,
    title: "EBITDA margin below the industry lower quartile",
    threshold: "EBITDA margin below industry P25",
    thresholdBps: 0,
    operatorPrompt:
      "Work out whether the gap sits in gross margin or below it by walking the peer median down the statement line by line. Ask which cost lines management believes are structural and which they believe are discretionary, and get the evidence for each claim."
  },
  {
    id: "T-01",
    axis: "TREND",
    severity: "HIGH",
    minPeriods: 2,
    title: "SG&A growth outpaced revenue growth",
    threshold: "SG&A growth exceeds revenue growth by 5.00pp or more",
    thresholdBps: 500,
    operatorPrompt:
      "Pull headcount adds by function for the period. Check for sales comp plan changes, new fixed overhead (office, software licences, insurance) and any one-time professional fees sitting in G&A."
  },
  {
    id: "T-02",
    axis: "TREND",
    severity: "HIGH",
    minPeriods: 3,
    title: "Gross margin compressed in consecutive periods",
    threshold: "Gross margin falls 150bps or more in each of two consecutive periods",
    thresholdBps: 150,
    operatorPrompt:
      "Two consecutive compressions is a trend, not a bad quarter. Get a volume-price-mix bridge for both periods and establish whether the driver is the same one twice or two different ones. Ask what pricing actions were taken between them and what they achieved."
  },
  {
    id: "T-03",
    axis: "TREND",
    severity: "MEDIUM",
    minPeriods: 3,
    title: "Revenue growth decelerated",
    threshold: "Revenue growth rate is lower than the preceding period's growth rate",
    thresholdBps: 0,
    operatorPrompt:
      "Separate deceleration from seasonality before treating it as a problem: check the same period a year earlier. Then split the change into new customers, expansion and churn, and ask which of the three moved."
  },
  {
    id: "T-04",
    axis: "TREND",
    severity: "HIGH",
    minPeriods: 2,
    title: "COGS growth outpaced revenue growth",
    threshold: "COGS growth exceeds revenue growth by 3.00pp or more",
    thresholdBps: 300,
    operatorPrompt:
      "Ask whether this is input cost inflation, mix shift toward lower-margin products, or a pricing failure. Request a volume-price-mix bridge before accepting the first explanation offered."
  },
  {
    id: "T-05",
    axis: "TREND",
    severity: "HIGH",
    minPeriods: 2,
    title: "EBITDA margin fell while revenue grew",
    threshold: "EBITDA margin falls 200bps or more in a period where revenue grows",
    thresholdBps: 200,
    operatorPrompt:
      "Growth that costs margin is the pattern to understand here. Establish whether the incremental revenue carries a lower gross margin or whether operating cost was added ahead of it, and get the cost adds split into fixed and variable."
  },
  {
    id: "C-01",
    axis: "COHERENCE",
    severity: "HIGH",
    minPeriods: 1,
    title: "Derived row does not reconcile",
    threshold: "An entered derived row differs from its recalculation by more than 0.50%",
    thresholdBps: 50,
    operatorPrompt:
      "The statement does not foot, so treat every figure on it as unconfirmed until this is resolved. Ask for the source export rather than a corrected number, and check whether the difference is a reclassification between lines or a genuine error."
  }
];

export const RULES_BY_ID: Record<string, RuleDefinition> = Object.fromEntries(
  RULES.map((rule) => [rule.id, rule])
);
