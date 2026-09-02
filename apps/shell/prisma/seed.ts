import { readFileSync } from "node:fs";
import { join } from "node:path";

import { prisma } from "@ssa/db";

import { analyse, type BenchmarkStat } from "../src/apps/operator-lens/lib/engine";
import { parseWorkbook } from "../src/apps/operator-lens/lib/parse-workbook";
import { RULESET_VERSION } from "../src/apps/operator-lens/lib/ruleset";

// Synthetic seed for the Sample Tracker module. Idempotent: it only inserts when
// the table is empty, so ./scripts/run.sh can call it on every start. Run
// ./scripts/reset.sh to wipe and reseed.
const PROJECT_SLUG = "northwind-rollout";

const SAMPLE_ITEMS = [
  { title: "Kickoff checklist", category: "Planning", owner: "Demo User" },
  { title: "Stakeholder map", category: "Planning", owner: "Sam Rivera" },
  { title: "Data access request", category: "Data", owner: "Sam Rivera" },
  { title: "Environment setup", category: "Engineering", owner: "Demo User" },
  { title: "Draft milestone plan", category: "Planning", owner: "Jordan Lee" },
  { title: "Risk register", category: "Governance", owner: "Jordan Lee" },
  { title: "Weekly status template", category: "Reporting", owner: "Demo User" },
  { title: "Retro notes", category: "Reporting", owner: "Sam Rivera" }
];

// Operator Lens demo engagement, parsed from the committed demo workbook so the
// seeded figures and the workbook can never drift apart. Synthetic data.
const DEMO_WORKBOOK = join(__dirname, "..", "..", "..", "templates", "OperatorLens_Demo_EpiroteFurs.xlsx");
const DEMO_ENGAGEMENT_NAME = "Epirote Furs diligence";

// Generated offline by scripts/analysis/build_benchmarks.py from a committed
// CSV of 10-K figures. Never hand-edited.
const BENCHMARKS_JSON = join(__dirname, "..", "..", "..", "packages", "db", "prisma", "benchmarks.v1.json");

type BenchmarkFile = {
  setVersion: string;
  stats: BenchmarkStat[];
};

function loadBenchmarkFile(): BenchmarkFile {
  return JSON.parse(readFileSync(BENCHMARKS_JSON, "utf8")) as BenchmarkFile;
}

async function seedBenchmarks(stats: BenchmarkStat[]) {
  const existing = await prisma.benchmarkStat.count({ where: { projectSlug: PROJECT_SLUG } });
  if (existing > 0) {
    console.log(`Benchmarks skipped: ${existing} row(s) already present.`);
    return;
  }

  await prisma.benchmarkStat.createMany({
    data: stats.map((stat) => ({
      projectSlug: PROJECT_SLUG,
      setVersion: stat.setVersion,
      industryCode: stat.industryCode,
      sizeBand: stat.sizeBand,
      metricCode: stat.metricCode,
      p10: stat.p10,
      p25: stat.p25,
      p50: stat.p50,
      p75: stat.p75,
      p90: stat.p90,
      source: stat.source,
      asOfDate: new Date(stat.asOfDate),
      sampleSize: stat.sampleSize
    }))
  });
  console.log(`Seeded ${stats.length} benchmark row(s) for set "${stats[0]?.setVersion}".`);
}

async function seedSampleItems() {
  const existing = await prisma.sampleItem.count();
  if (existing > 0) {
    console.log(`Sample Tracker skipped: ${existing} sample item(s) already present.`);
    return;
  }

  await prisma.sampleItem.createMany({
    data: SAMPLE_ITEMS.map((item) => ({ projectSlug: PROJECT_SLUG, ...item }))
  });
  console.log(`Seeded ${SAMPLE_ITEMS.length} sample item(s) for "${PROJECT_SLUG}".`);
}

async function seedOperatorLensDemo() {
  const existing = await prisma.engagement.count({ where: { projectSlug: PROJECT_SLUG } });
  if (existing > 0) {
    console.log(`Operator Lens skipped: ${existing} engagement(s) already present.`);
    return;
  }

  const figures = parseWorkbook(readFileSync(DEMO_WORKBOOK));
  const { company, periods, lineItems } = figures;

  // Figures come straight from the workbook, so they count as confirmed for the
  // demo. A real upload sets these only when the operator clicks Confirm.
  const confirmedAt = company.asOfDate;

  // The engine runs on the confirmed figures only, and is pure, so seeding the
  // flags here produces exactly what a live analysis would.
  const benchmarkFile = loadBenchmarkFile();
  const analysis = analyse(figures, {
    industryCode: company.industryCode,
    sizeBand: company.sizeBand,
    benchmarks: benchmarkFile.stats
  });

  await prisma.engagement.create({
    data: {
      projectSlug: PROJECT_SLUG,
      name: DEMO_ENGAGEMENT_NAME,
      companyName: company.companyName,
      industryCode: company.industryCode,
      sizeBand: company.sizeBand,
      fiscalYearEnd: company.fiscalYearEnd,
      currency: company.currency,
      unitScale: company.unitScale,
      benchmarkSetVersion: benchmarkFile.setVersion,
      rulesetVersion: analysis.rulesetVersion,
      status: "ANALYSED",
      figuresConfirmedAt: confirmedAt,
      figuresConfirmedByName: company.preparedBy,
      createdByName: "Demo User",
      periods: {
        create: periods.map((period) => ({
          projectSlug: PROJECT_SLUG,
          label: period.label,
          endDate: period.endDate,
          ordinal: period.ordinal,
          lineItems: {
            create: lineItems
              .filter((item) => item.valuesMinor[period.ordinal] !== null)
              .map((item) => ({
                projectSlug: PROJECT_SLUG,
                code: item.code,
                valueMinor: item.valuesMinor[period.ordinal] as bigint,
                extractedValueMinor: item.valuesMinor[period.ordinal] as bigint,
                wasEditedByOperator: false
              }))
          }
        }))
      },
      flags: {
        create: analysis.flags.map((flag) => ({
          projectSlug: PROJECT_SLUG,
          ruleId: flag.ruleId,
          axis: flag.axis,
          severity: flag.severity,
          title: flag.title,
          operatorPrompt: flag.operatorPrompt,
          computedValues: flag.computedValues,
          thresholdBreached: flag.thresholdBreached,
          benchmarkRef: flag.benchmarkRef,
          status: "OPEN"
        }))
      }
    }
  });

  console.log(
    `Seeded Operator Lens demo "${company.companyName}": ${periods.length} period(s), ${lineItems.length} line item(s), ${analysis.flags.length} flag(s), ${analysis.skipped.length} rule(s) skipped, ${analysis.unbenchmarked.length} rule(s) unbenchmarked.`
  );
}

async function main() {
  await seedSampleItems();
  // Benchmarks first: the engine needs the seeded distribution to fire the
  // benchmark axis when the demo engagement is analysed.
  await seedBenchmarks(loadBenchmarkFile().stats);
  await seedOperatorLensDemo();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
