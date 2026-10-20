-- Revision de integridad (SOLO LECTURA) antes de desplegar la Fase 0.
-- Uso, en el contenedor de la base de datos:
--   docker exec -i <contenedor-db> psql -U <usuario> -d <base> < apps/api/scripts/audit-integridad.sql
-- Cada bloque imprime cuantos casos hay y hasta 20 ejemplos. Nada se modifica.

BEGIN TRANSACTION READ ONLY;

\echo '== 1. Cambios (EXCHANGE) entre cuentas de la MISMA moneda'
SELECT o.id, o.date::date, o.description, ao.currency AS sale, ai.currency AS entra, o.amount, i.amount AS recibido
FROM transactions o
JOIN transactions i ON i.id = o."linkedTransactionId"
JOIN accounts ao ON ao.id = o."accountId"
JOIN accounts ai ON ai.id = i."accountId"
WHERE o.type = 'EXCHANGE' AND ao.currency = ai.currency
ORDER BY o.date DESC LIMIT 20;

\echo '== 2. Traspasos (TRANSFER) entre monedas DISTINTAS'
SELECT o.id, o.date::date, o.description, ao.currency AS sale, ai.currency AS entra, o.amount, i.amount AS recibido
FROM transactions o
JOIN transactions i ON i.id = o."linkedTransactionId"
JOIN accounts ao ON ao.id = o."accountId"
JOIN accounts ai ON ai.id = i."accountId"
WHERE o.type = 'TRANSFER' AND ao.currency <> ai.currency
ORDER BY o.date DESC LIMIT 20;

\echo '== 3. Pares descuadrados: fecha, importe (traspaso) o borrado distintos entre las dos piernas'
SELECT o.id, o.type, o.date AS fecha_sale, i.date AS fecha_entra, o.amount, i.amount AS amount_entra,
       o."deletedAt" IS NOT NULL AS sale_borrada, i."deletedAt" IS NOT NULL AS entra_borrada
FROM transactions o
JOIN transactions i ON i.id = o."linkedTransactionId"
WHERE o.date <> i.date
   OR (o.type = 'TRANSFER' AND o.amount <> i.amount)
   OR (o."deletedAt" IS NULL) <> (i."deletedAt" IS NULL)
   OR o.type <> i.type
ORDER BY o.date DESC LIMIT 20;

\echo '== 4. Piernas huerfanas (TRANSFER/EXCHANGE sin la otra pierna)'
SELECT t.id, t.type, t.date::date, t.description, t.amount, t."deletedAt" IS NOT NULL AS borrada
FROM transactions t
WHERE t.type IN ('TRANSFER', 'EXCHANGE')
  AND t."linkedTransactionId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM transactions o WHERE o."linkedTransactionId" = t.id)
ORDER BY t.date DESC LIMIT 20;

\echo '== 5. Deudas con movimientos en mas de una moneda'
SELECT d.id, d."personName", d.description, string_agg(DISTINCT a.currency, ', ') AS monedas
FROM debts d
JOIN transactions t ON t."debtId" = d.id AND t."deletedAt" IS NULL
JOIN accounts a ON a.id = t."accountId"
GROUP BY d.id
HAVING count(DISTINCT a.currency) > 1
LIMIT 20;

\echo '== 6. Deudas cuyo pagado guardado no coincide con la suma de sus pagos (se recalculara)'
SELECT d.id, d."personName", d.type, d."paidAmount" AS pagado_guardado,
       COALESCE(SUM(t.amount) FILTER (
         WHERE t."deletedAt" IS NULL
           AND t.type = CASE WHEN d.type = 'RECEIVABLE' THEN 'INCOME' ELSE 'EXPENSE' END::"TransactionType"
       ), 0) AS pagado_real,
       d."totalAmount" AS total_guardado,
       COALESCE(SUM(t.amount) FILTER (
         WHERE t."deletedAt" IS NULL
           AND t.type = CASE WHEN d.type = 'RECEIVABLE' THEN 'EXPENSE' ELSE 'INCOME' END::"TransactionType"
       ), 0) AS total_real
FROM debts d
LEFT JOIN transactions t ON t."debtId" = d.id
GROUP BY d.id
HAVING d."paidAmount" <> COALESCE(SUM(t.amount) FILTER (
         WHERE t."deletedAt" IS NULL
           AND t.type = CASE WHEN d.type = 'RECEIVABLE' THEN 'INCOME' ELSE 'EXPENSE' END::"TransactionType"
       ), 0)
LIMIT 20;

\echo '== 7. Movimientos que apuntan a cuenta, categoria, proyecto o deuda de OTRA organizacion'
SELECT t.id, t."orgId", 'account' AS ref FROM transactions t JOIN accounts a ON a.id = t."accountId" WHERE a."orgId" <> t."orgId"
UNION ALL
SELECT t.id, t."orgId", 'category' FROM transactions t JOIN categories c ON c.id = t."categoryId" WHERE c."orgId" <> t."orgId"
UNION ALL
SELECT t.id, t."orgId", 'project' FROM transactions t JOIN projects p ON p.id = t."projectId" WHERE p."orgId" <> t."orgId"
UNION ALL
SELECT t.id, t."orgId", 'debt' FROM transactions t JOIN debts d ON d.id = t."debtId" WHERE d."orgId" <> t."orgId"
LIMIT 20;

\echo '== 8. Movimientos a medianoche UTC exacta (fecha sin hora: caen el dia anterior en La Habana)'
SELECT COALESCE(source, '(web/app)') AS origen, count(*) AS cuantos, min(date)::date AS desde, max(date)::date AS hasta
FROM transactions
WHERE date = date_trunc('day', date)
GROUP BY 1
ORDER BY 2 DESC;

ROLLBACK;
