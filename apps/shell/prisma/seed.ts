import { readFileSync } from "node:fs";
import { join } from "node:path";

import { prisma } from "@ssa/db";

import { parseWorkbook } from "../src/apps/operator-lens/lib/parse-workbook";

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
      benchmarkSetVersion: "unseeded",
      rulesetVersion: "unseeded",
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
      }
    }
  });

  console.log(
    `Seeded Operator Lens demo "${company.companyName}": ${periods.length} period(s), ${lineItems.length} line item(s).`
  );
}

async function main() {
  await seedSampleItems();
  await seedOperatorLensDemo();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
