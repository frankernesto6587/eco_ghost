import { useQuery } from '@tanstack/react-query';
import { valuationService } from '@/services/valuation.service';
import { useAuthStore } from '@/store/auth.store';

/**
 * Estado de la valoracion en la moneda de estadisticas (activa, moneda, tasas
 * que faltan). Va bajo la clave 'analytics' para que cualquier movimiento lo
 * refresque (ver invalidateMoney).
 */
export function useValuationStatus() {
  const orgId = useAuthStore((s) => s.currentOrg?.id);
  return useQuery({
    queryKey: ['analytics', 'valuation-status', orgId],
    queryFn: () => valuationService.status(),
    enabled: !!orgId,
    staleTime: 60_000,
  });
}

/** "≈ 10,67 USD" para mostrar al lado de un importe en otra moneda. */
export function approxReport(cents: number | null | undefined, reportCurrency: string, status?: string | null) {
  if (cents === null || cents === undefined) return status === 'MISSING_RATE' ? 'falta tasa' : null;
  const v = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(cents) / 100);
  return `≈ ${v} ${reportCurrency}${status === 'ESTIMATE' ? ' (estimado)' : ''}`;
}
