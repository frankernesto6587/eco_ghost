-- Fase 2b: presupuestos en la moneda de estadisticas y cierre de mes.

-- NATIVE: solo el gasto de las cuentas de su moneda. REPORT: todo, valorado por FIFO.
ALTER TABLE "budgets" ADD COLUMN "basis" TEXT NOT NULL DEFAULT 'NATIVE';

-- Ultimo mes cerrado ('YYYY-MM').
ALTER TABLE "organizations" ADD COLUMN "closedThrough" TEXT;
