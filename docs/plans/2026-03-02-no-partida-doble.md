# Decision: No implementar partida doble

**Fecha:** 2026-03-02
**Estado:** Aprobado
**Contexto:** Evaluar si migrar de contabilidad de entrada simple a partida doble

---

## Resumen

EcoGhost mantiene contabilidad de **entrada simple**. No se implementa partida doble.

---

## Contexto de la decision

Se evaluo si convenia migrar el modelo contable de EcoGhost (entrada simple con tipos INCOME/EXPENSE/TRANSFER) a un sistema de partida doble (debito/credito en cada transaccion).

### Modelo actual
- Cada `Transaction` tiene un `accountId`, un `type` (INCOME/EXPENSE/TRANSFER) y un `amount`
- El balance de una cuenta se calcula como `SUM(INCOME) - SUM(EXPENSE)`
- Las transferencias enlazan dos transacciones via `linkedTransactionId`
- No hay libro mayor, plan de cuentas contable, ni asientos formales

---

## Analisis

### Usuario objetivo
- Familias cubanas e individuos
- Necesidad principal: saber cuanto tienen, en que gastan, quien les debe
- Contexto multi-moneda real: USD, MN, MLC
- Colaboracion familiar con roles (owner + contable/viewer)
- No requieren reportes fiscales ni contables formales

### Por que NO partida doble

1. **Los usuarios no lo necesitan.** Quieren ver numeros simples: "tengo $500 USD y 20,000 MN, gaste $150 en comida, Elvis me debe $2,000". No necesitan entender debitos y creditos.

2. **No requieren reportes contables formales.** No necesitan balance general, estado de resultados, ni reportes para impuestos. Solo resumen de gastos e ingresos.

3. **Complejidad sin beneficio.** Migrar implicaria:
   - Cada transaccion genera 2+ registros (debito y credito)
   - Plan de cuentas contable con naturaleza (deudora/acreedora)
   - UI que explique debitos y creditos a usuarios no contables
   - Duplicar la complejidad de queries para calcular balances
   - Refactorear todo el esquema, servicios y frontend

4. **Las apps exitosas de finanzas personales no lo usan.** YNAB, Bluecoins, Wallet, Money Manager — todas usan entrada simple. Partida doble es para software contable empresarial (QuickBooks, Odoo, GnuCash).

5. **Friccion de adopcion.** Cada concepto contable que se agrega es una barrera mas para usuarios no tecnicos.

### Lo que SI diferencia a EcoGhost

| Feature | Valor para el usuario |
|---------|----------------------|
| Multi-moneda real (USD/MN/MLC) | Killer feature para Cuba — pocas apps lo manejan bien |
| Colaboracion familiar con roles | Toda la familia registra gastos en un solo lugar |
| Deudas con pagos parciales | "Elvis me debe $2,000, ya pago $200" |
| Arqueo de caja | Funcionalidad unica que la mayoria de apps no tienen |
| Offline-first (futuro mobile) | Contexto Cuba = internet inestable |

---

## App movil Android

La app se expondra en internet y se planea una version Android. Esto refuerza la decision:

- **Partida doble en movil es hostil.** Registrar un gasto desde el telefono debe ser: monto + cuenta + categoria + guardar. Agregar debitos/creditos lo hace inutilizable.
- **Offline-first es mas importante.** El esfuerzo de ingenieria debe ir a sincronizacion offline, no a complejidad contable.
- **Stack recomendado para Android:** React Native (reutiliza logica TypeScript y conocimiento del equipo) o PWA con service workers como primer paso rapido.

---

## Decision final

**Mantener entrada simple.** Invertir el esfuerzo en:
1. Pulir multi-moneda (tasas de cambio, conversion)
2. App Android / PWA
3. Modo offline con sincronizacion
4. Transacciones recurrentes
5. Telegram bot para registro rapido

---

## Referencias
- Documento de diseno original: `docs/plans/2026-02-22-ecoghost-design.md`
- Schema actual: `apps/api/src/prisma/schema.prisma`
