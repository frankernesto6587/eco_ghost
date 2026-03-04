import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { App } from 'antd';
import { useAuthStore } from '@/store/auth.store';
import { authService } from '@/services/auth.service';
import { LoadingScreen } from '@/components/feedback';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { message } = App.useApp();
  const setAuth = useAuthStore((state) => state.setAuth);

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');

    if (!accessToken || !refreshToken) {
      message.error('Error en la autenticacion');
      navigate('/login', { replace: true });
      return;
    }

    // Temporarily store tokens so the API client can use them
    useAuthStore.getState().setTokens({ accessToken, refreshToken });

    // Fetch the user profile and organizations
    authService
      .getProfile()
      .then(({ user, organizations }) => {
        setAuth(user, { accessToken, refreshToken }, organizations);
        navigate('/dashboard', { replace: true });
      })
      .catch(() => {
        useAuthStore.getState().logout();
        message.error('Error al obtener el perfil');
        navigate('/login', { replace: true });
      });
  }, [searchParams, navigate, setAuth, message]);

  return <LoadingScreen />;
}
