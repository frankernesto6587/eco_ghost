-- Arreglos de categorias de la organizacion "Home", acordados con Frank el
-- 2026-10-20. Se corre una vez, DESPUES de desplegar la migracion 6_tipo_categoria
-- (que ya quito la categoria a transferencias y cambios y paso los saldos
-- iniciales anotados como transferencia a ajuste).
--
--   1. Los gastos del grupo "Cambios" (compras de divisa sin la pata que entra)
--      pasan a ajuste con "Correccion": el saldo no cambia y dejan de ser gasto.
--   2. "Negocio > Transferencias" pasa a llamarse "Envios al negocio".
--   3. Se borra el grupo "Cambios" si ya nada lo usa.
--
-- Uso, en el contenedor de la base de datos. Primero sin guardar (muestra lo
-- que haria y deshace), luego con guardar=1:
--   docker exec -i <contenedor-db> psql -U <usuario> -d <base> -v org=Home -v guardar=0 < apps/api/scripts/categorias-home.sql

\set ON_ERROR_STOP 1
BEGIN;

SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'kind'
) AS migrada \gset
\if :migrada
\else
  \echo 'Falta la migracion 6_tipo_categoria: despliega primero y vuelve a correrlo. No se toca nada'
  ROLLBACK;
  \quit
\endif

SELECT count(*) = 1 AS una_org FROM organizations WHERE name = :'org' \gset
\if :una_org
\else
  \echo 'No hay exactamente una organizacion con ese nombre: no se toca nada'
  ROLLBACK;
  \quit
\endif

SELECT id AS org_id FROM organizations WHERE name = :'org' \gset
SELECT count(*) = 1 AS una_correccion FROM categories
WHERE "orgId" = :'org_id' AND name = 'Correccion' AND "isAdjustment" AND "parentId" IS NULL \gset
\if :una_correccion
\else
  \echo 'No hay exactamente un ajuste "Correccion": no se toca nada'
  ROLLBACK;
  \quit
\endif

CREATE TEMP TABLE cambios ON COMMIT DROP AS
WITH RECURSIVE t AS (
  SELECT id FROM categories WHERE "orgId" = :'org_id' AND name = 'Cambios' AND "parentId" IS NULL
  UNION ALL
  SELECT c.id FROM categories c JOIN t ON c."parentId" = t.id
)
SELECT id FROM t;

\echo '== 1. Gastos e ingresos del grupo Cambios -> Correccion'
UPDATE transactions SET
  "categoryId" = (SELECT id FROM categories WHERE "orgId" = :'org_id' AND name = 'Correccion' AND "isAdjustment" AND "parentId" IS NULL),
  "updatedAt" = now()
WHERE "orgId" = :'org_id' AND "categoryId" IN (SELECT id FROM cambios) AND type IN ('EXPENSE', 'INCOME') AND "deletedAt" IS NULL
RETURNING to_char(date, 'YYYY-MM-DD') AS fecha, type AS tipo, round(amount / 100.0, 2) AS importe, description AS descripcion;

\echo '== 2. Negocio > Transferencias -> Envios al negocio'
UPDATE categories c SET name = 'Envíos al negocio'
FROM categories p
WHERE p.id = c."parentId" AND p."orgId" = :'org_id' AND p.name = 'Negocio' AND p."parentId" IS NULL AND c.name = 'Transferencias'
RETURNING p.name AS grupo, c.name AS nuevo_nombre;

\echo '== 3. Borrar el grupo Cambios (solo si nada lo usa: ni movimientos ni presupuestos)'
DELETE FROM categories
WHERE id IN (SELECT id FROM cambios)
  AND NOT EXISTS (SELECT 1 FROM transactions WHERE "categoryId" IN (SELECT id FROM cambios) AND "deletedAt" IS NULL)
  AND NOT EXISTS (SELECT 1 FROM budgets WHERE "categoryId" IN (SELECT id FROM cambios))
RETURNING name AS borrada;

\echo '== Lo que queda con categoria que no le toca (deberia salir vacio)'
SELECT to_char(t.date, 'YYYY-MM-DD') AS fecha, t.type AS tipo, t.description AS descripcion, c.name AS categoria, c.kind AS tipo_categoria
FROM transactions t JOIN categories c ON c.id = t."categoryId"
WHERE t."orgId" = :'org_id' AND t."deletedAt" IS NULL
  AND (t.type NOT IN ('EXPENSE', 'INCOME') OR (c.kind <> 'BOTH' AND c.kind::text <> t.type::text));

\if :guardar
  COMMIT;
  \echo 'Guardado.'
\else
  ROLLBACK;
  \echo 'Prueba: no se guardo nada. Para guardar, repite con -v guardar=1'
\endif
