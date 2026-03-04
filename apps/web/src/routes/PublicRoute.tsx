import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';

export function PublicRoute() {
  const tokens = useAuthStore((state) => state.tokens);

  if (tokens?.accessToken) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
