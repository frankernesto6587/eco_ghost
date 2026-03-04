import { useMemo } from 'react';
import { Role, WRITE_ROLES, MEMBER_MANAGEMENT_ROLES } from '@ecoghost/shared';
import { useAuthStore } from '@/store/auth.store';

export function usePermissions() {
  const currentOrg = useAuthStore((state) => state.currentOrg);

  return useMemo(() => {
    const role = currentOrg?.role ?? Role.VIEWER;

    return {
      role,
      canWrite: WRITE_ROLES.includes(role),
      canManageMembers: MEMBER_MANAGEMENT_ROLES.includes(role),
      canManageOrg: role === Role.OWNER,
    };
  }, [currentOrg?.role]);
}
