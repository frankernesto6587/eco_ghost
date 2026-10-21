-- Cada categoria sale solo en los movimientos de su tipo (gasto, ingreso o los
-- dos). Lo decide el grupo y lo heredan sus subcategorias. Transferencias y
-- cambios dejan de llevar categoria.

CREATE TYPE "CategoryKind" AS ENUM ('EXPENSE', 'INCOME', 'BOTH');
ALTER TABLE "categories" ADD COLUMN "kind" "CategoryKind" NOT NULL DEFAULT 'EXPENSE';

-- Una pierna suelta de transferencia o cambio con categoria de ajuste era un
-- saldo inicial anotado como transferencia: pasa a ajuste de entrada. Ya
-- contaba como entrada, asi que el saldo y la valoracion no cambian.
UPDATE "transactions" t SET "type" = 'INCOME'
WHERE t."type" IN ('TRANSFER', 'EXCHANGE')
  AND t."linkedTransactionId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "transactions" o WHERE o."linkedTransactionId" = t."id")
  AND EXISTS (SELECT 1 FROM "categories" c WHERE c."id" = t."categoryId" AND c."isAdjustment");

UPDATE "transactions" SET "categoryId" = NULL
WHERE "type" IN ('TRANSFER', 'EXCHANGE') AND "categoryId" IS NOT NULL;

-- El tipo de cada grupo sale de su uso, para que nada de lo anotado quede
-- fuera: si tiene gastos e ingresos, los dos. Sin uso, "Ingresos" es de
-- ingreso y el resto de gasto. Los ajustes y "Prestamos" (deudas), los dos.
WITH RECURSIVE tree AS (
  SELECT "id", "id" AS root FROM "categories" WHERE "parentId" IS NULL
  UNION ALL
  SELECT c."id", t.root FROM "categories" c JOIN tree t ON c."parentId" = t."id"
), uso AS (
  SELECT tr.root,
    bool_or(x."type" = 'INCOME') AS ing,
    bool_or(x."type" = 'EXPENSE') AS gas
  FROM tree tr
  JOIN "transactions" x ON x."categoryId" = tr."id" AND x."deletedAt" IS NULL
  GROUP BY tr.root
), kinds AS (
  SELECT r."id" AS root,
    (CASE
      WHEN r."isAdjustment" OR r."name" = 'Prestamos' OR (u.ing AND u.gas) THEN 'BOTH'
      WHEN u.ing THEN 'INCOME'
      WHEN u.gas THEN 'EXPENSE'
      WHEN r."name" = 'Ingresos' THEN 'INCOME'
      ELSE 'EXPENSE'
    END)::"CategoryKind" AS kind
  FROM "categories" r
  LEFT JOIN uso u ON u.root = r."id"
  WHERE r."parentId" IS NULL
)
UPDATE "categories" c SET "kind" = k.kind
FROM tree t JOIN kinds k ON k.root = t.root
WHERE c."id" = t."id";

-- Las organizaciones que ya valoran se recalculan en la siguiente lectura.
UPDATE "organizations" SET "valuationFingerprint" = NULL WHERE "valuationEnabled";
