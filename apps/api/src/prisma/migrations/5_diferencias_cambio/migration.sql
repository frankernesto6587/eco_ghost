-- Fase 2c: cada gasto a la tasa de mercado de su dia y, aparte, la diferencia
-- de cambio con su coste FIFO (por cambio y por retener), como la NIC 21.

ALTER TABLE "transactions" ADD COLUMN "marketAmount" INTEGER;
ALTER TABLE "transactions" ADD COLUMN "fxExchange" INTEGER;
ALTER TABLE "transactions" ADD COLUMN "fxHolding" INTEGER;

ALTER TABLE "fx_lots" ADD COLUMN "marketMicros" BIGINT;
ALTER TABLE "fx_lots" ADD COLUMN "remainingMarketMicros" BIGINT;
ALTER TABLE "fx_allocations" ADD COLUMN "marketMicros" BIGINT;

-- Las organizaciones que ya valoran se recalculan en la siguiente lectura.
UPDATE "organizations" SET "valuationFingerprint" = NULL WHERE "valuationEnabled";
