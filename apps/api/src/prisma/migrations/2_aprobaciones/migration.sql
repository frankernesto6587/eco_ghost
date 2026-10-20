-- Fase 1 (aprobaciones). Todo lo que ya existe queda como aprobado.

CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- El DEFAULT solo sirve para rellenar las filas existentes; luego se quita para
-- que cada alta tenga que decidir el estado.
ALTER TABLE "transactions"
  ADD COLUMN "status" "TransactionStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedBy" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "originalSnapshot" JSONB;
ALTER TABLE "transactions" ALTER COLUMN "status" DROP DEFAULT;

DROP INDEX "transactions_orgId_deletedAt_type_date_idx";
CREATE INDEX "transactions_orgId_deletedAt_status_type_date_idx" ON "transactions"("orgId", "deletedAt", "status", "type", "date");
CREATE INDEX "transactions_orgId_status_createdAt_idx" ON "transactions"("orgId", "status", "createdAt");

ALTER TABLE "org_members"
  ADD COLUMN "autoApprove" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autoApproveLimits" JSONB;

ALTER TABLE "debts" ADD COLUMN "approvalStatus" "TransactionStatus" NOT NULL DEFAULT 'APPROVED';
