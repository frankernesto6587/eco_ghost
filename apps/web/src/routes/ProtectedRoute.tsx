import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuthStore } from '@/store/auth.store';
import { authService } from '@/services/auth.service';

export function ProtectedRoute() {
  const tokens = useAuthStore((state) => state.tokens);
  const user = useAuthStore((state) => state.user);
  const setAuth = useAuthStore((state) => state.setAuth);
  const logout = useAuthStore((state) => state.logout);
  const [loading, setLoading] = useState(!user && !!tokens?.accessToken);

  // On page refresh, tokens exist but user/organizations are lost.
  // Fetch profile to restore them.
  useEffect(() => {
    if (tokens?.accessToken && !user) {
      authService
        .getProfile()
        .then(({ user: freshUser, organizations }) => {
          setAuth(freshUser, tokens, organizations);
        })
        .catch(() => {
          logout();
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tokens?.accessToken) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return <Outlet />;
}
