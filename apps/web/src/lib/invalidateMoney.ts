import type { QueryClient } from '@tanstack/react-query';

/**
 * Claves que dependen del dinero: cualquier movimiento las deja obsoletas.
 *
 * Existe porque cada pantalla invalidaba su propia lista y se olvidaba del
 * resto: registrar el pago de una deuda crea una transaccion, pero Deudas solo
 * invalidaba ['debts'], asi que el dashboard, la lista de movimientos y
 * Analisis seguian mostrando datos viejos hasta recargar a mano (con
 * `staleTime` de 5 min, navegar entre pantallas no bastaba).
 */
const MONEY_KEYS = [
  'transactions',
  'transactions-summary',
  'accounts',
  'dashboard',
  'analytics',
  'budgets',
  'debts',
] as const;

export function invalidateMoneyQueries(queryClient: QueryClient) {
  for (const key of MONEY_KEYS) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}
