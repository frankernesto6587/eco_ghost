-- Fase 2 (valoracion FIFO en la moneda de estadisticas).

CREATE TYPE "ValuationStatus" AS ENUM ('EXACT', 'ESTIMATE', 'MISSING_RATE');

ALTER TABLE "organizations"
  ADD COLUMN "reportCurrency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "valuationEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "valuationFingerprint" TEXT,
  ADD COLUMN "valuedAt" TIMESTAMP(3),
  ADD COLUMN "valuationIssues" JSONB;

ALTER TABLE "transactions"
  ADD COLUMN "reportAmount" INTEGER,
  ADD COLUMN "valuationStatus" "ValuationStatus",
  ADD COLUMN "fxResult" INTEGER;

-- exchange_rates nunca se uso (vacia): se sustituye por las dos tablas nuevas.
DROP TABLE "exchange_rates";

CREATE TABLE "reference_rates" (
    "day" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "mnPerUnit" DECIMAL(16,6) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ELTOQUE',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reference_rates_pkey" PRIMARY KEY ("day","currency")
);

CREATE TABLE "rate_overrides" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "mnPerUnit" DECIMAL(16,6) NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orgId" TEXT NOT NULL,
    CONSTRAINT "rate_overrides_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rate_overrides_orgId_day_currency_key" ON "rate_overrides"("orgId", "day", "currency");
ALTER TABLE "rate_overrides" ADD CONSTRAINT "rate_overrides_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "fx_lots" (
    "id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "sourceTxId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "costMicros" BIGINT,
    "estimated" BOOLEAN NOT NULL DEFAULT false,
    "remainingQty" INTEGER NOT NULL,
    "remainingCostMicros" BIGINT,
    "orgId" TEXT NOT NULL,
    CONSTRAINT "fx_lots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "fx_lots_orgId_currency_idx" ON "fx_lots"("orgId", "currency");
ALTER TABLE "fx_lots" ADD CONSTRAINT "fx_lots_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "fx_allocations" (
    "id" TEXT NOT NULL,
    "consumerTxId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "lotSeq" INTEGER,
    "qty" INTEGER NOT NULL,
    "costMicros" BIGINT,
    "kind" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    CONSTRAINT "fx_allocations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "fx_allocations_orgId_consumerTxId_idx" ON "fx_allocations"("orgId", "consumerTxId");
ALTER TABLE "fx_allocations" ADD CONSTRAINT "fx_allocations_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
