import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { App } from 'antd';
import { useAuthStore } from '@/store/auth.store';
import { authService } from '@/services/auth.service';

export function useAuth() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { user, tokens, currentOrg, organizations, setAuth, logout: storeLogout } =
    useAuthStore();

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authService.login(email, password),
    onSuccess: (data) => {
      setAuth(data.user, data.tokens, data.organizations);
      queryClient.clear();
      message.success('Inicio de sesion exitoso');
      navigate('/dashboard');
    },
    onError: () => {
      message.error('Credenciales incorrectas');
    },
  });

  const registerMutation = useMutation({
    mutationFn: ({
      name,
      email,
      password,
    }: {
      name: string;
      email: string;
      password: string;
    }) => authService.register(name, email, password),
    onSuccess: (data) => {
      setAuth(data.user, data.tokens, data.organizations);
      queryClient.clear();
      message.success('Registro exitoso');
      navigate('/dashboard');
    },
    onError: () => {
      message.error('Error al registrar. Intente de nuevo.');
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      if (tokens?.refreshToken) {
        await authService.logout(tokens.refreshToken).catch(() => {
          // Ignore server errors on logout
        });
      }
    },
    onSettled: () => {
      storeLogout();
      queryClient.clear();
      navigate('/login');
    },
  });

  return {
    user,
    tokens,
    currentOrg,
    organizations,
    isAuthenticated: !!tokens?.accessToken,
    login: loginMutation.mutate,
    register: registerMutation.mutate,
    logout: logoutMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
  };
}
