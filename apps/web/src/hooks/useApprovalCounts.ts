import { useQuery } from '@tanstack/react-query';
import { approvalsService } from '@/services/approvals.service';
import { useAuthStore } from '@/store/auth.store';
import { usePermissions } from './usePermissions';

/**
 * Numeros para las insignias de Aprobaciones. Se refrescan cada minuto y al
 * volver a la ventana: no hay avisos en vivo y quien aprueba tiene que enterarse.
 */
export function useApprovalCounts() {
  const orgId = useAuthStore((s) => s.currentOrg?.id);
  const { canWrite } = usePermissions();
  return useQuery({
    queryKey: ['approvals', 'counts', orgId],
    queryFn: () => approvalsService.counts(),
    enabled: !!orgId && canWrite,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}
