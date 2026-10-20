-- Fase 0 (integridad): las deudas guardan su moneda y se borran en suave.

ALTER TABLE "debts" ADD COLUMN "currency" TEXT;
ALTER TABLE "debts" ADD COLUMN "createdBy" TEXT;
ALTER TABLE "debts" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Moneda: la de la cuenta del movimiento mas antiguo de la deuda (el inicial);
-- si no tiene ninguno, la moneda base de la organizacion.
UPDATE "debts" d
SET "currency" = COALESCE(
  (SELECT a."currency"
     FROM "transactions" t JOIN "accounts" a ON a."id" = t."accountId"
    WHERE t."debtId" = d."id"
    ORDER BY t."createdAt" ASC
    LIMIT 1),
  (SELECT o."baseCurrency" FROM "organizations" o WHERE o."id" = d."orgId")
);

-- Autor: el del movimiento inicial.
UPDATE "debts" d
SET "createdBy" = (
  SELECT t."createdBy" FROM "transactions" t
   WHERE t."debtId" = d."id"
   ORDER BY t."createdAt" ASC
   LIMIT 1
);

ALTER TABLE "debts" ALTER COLUMN "currency" SET NOT NULL;
