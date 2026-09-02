-- CreateTable
CREATE TABLE "Engagement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectSlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "industryCode" TEXT NOT NULL,
    "sizeBand" TEXT NOT NULL,
    "fiscalYearEnd" DATETIME NOT NULL,
    "currency" TEXT NOT NULL,
    "unitScale" TEXT NOT NULL,
    "benchmarkSetVersion" TEXT NOT NULL,
    "rulesetVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "figuresConfirmedAt" DATETIME,
    "figuresConfirmedByName" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Period" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectSlug" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "endDate" DATETIME NOT NULL,
    "ordinal" INTEGER NOT NULL,
    CONSTRAINT "Period_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectSlug" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "extractionStatus" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourceDocument_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectSlug" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "valueMinor" BIGINT NOT NULL,
    "extractedValueMinor" BIGINT,
    "wasEditedByOperator" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "LineItem_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Flag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectSlug" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "axis" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "operatorPrompt" TEXT NOT NULL,
    "computedValues" TEXT NOT NULL,
    "thresholdBreached" TEXT NOT NULL,
    "benchmarkRef" TEXT,
    "status" TEXT NOT NULL,
    "ownerName" TEXT,
    "note" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Flag_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BenchmarkStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectSlug" TEXT NOT NULL,
    "setVersion" TEXT NOT NULL,
    "industryCode" TEXT NOT NULL,
    "sizeBand" TEXT NOT NULL,
    "metricCode" TEXT NOT NULL,
    "p10" REAL NOT NULL,
    "p25" REAL NOT NULL,
    "p50" REAL NOT NULL,
    "p75" REAL NOT NULL,
    "p90" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "asOfDate" DATETIME NOT NULL,
    "sampleSize" INTEGER NOT NULL
);

-- CreateIndex
CREATE INDEX "Engagement_projectSlug_idx" ON "Engagement"("projectSlug");

-- CreateIndex
CREATE INDEX "Period_projectSlug_idx" ON "Period"("projectSlug");

-- CreateIndex
CREATE INDEX "Period_engagementId_idx" ON "Period"("engagementId");

-- CreateIndex
CREATE INDEX "SourceDocument_projectSlug_idx" ON "SourceDocument"("projectSlug");

-- CreateIndex
CREATE INDEX "SourceDocument_engagementId_idx" ON "SourceDocument"("engagementId");

-- CreateIndex
CREATE INDEX "LineItem_projectSlug_idx" ON "LineItem"("projectSlug");

-- CreateIndex
CREATE INDEX "LineItem_periodId_idx" ON "LineItem"("periodId");

-- CreateIndex
CREATE INDEX "Flag_projectSlug_idx" ON "Flag"("projectSlug");

-- CreateIndex
CREATE INDEX "Flag_engagementId_idx" ON "Flag"("engagementId");

-- CreateIndex
CREATE INDEX "BenchmarkStat_projectSlug_idx" ON "BenchmarkStat"("projectSlug");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkStat_projectSlug_setVersion_industryCode_sizeBand_metricCode_key" ON "BenchmarkStat"("projectSlug", "setVersion", "industryCode", "sizeBand", "metricCode");
