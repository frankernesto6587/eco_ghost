import { api } from './api';
import type { AuthResponse, ProfileResponse } from '@ecoghost/shared';

export const authService = {
  async login(email: string, password: string) {
    const { data } = await api.post<AuthResponse>('/auth/login', {
      email,
      password,
    });
    return data;
  },

  async register(name: string, email: string, password: string) {
    const { data } = await api.post<AuthResponse>('/auth/register', {
      name,
      email,
      password,
    });
    return data;
  },

  async refreshTokens(refreshToken: string) {
    const { data } = await api.post<{ accessToken: string; refreshToken: string }>(
      '/auth/refresh',
      { refreshToken },
    );
    return data;
  },

  async logout(refreshToken: string) {
    await api.post('/auth/logout', { refreshToken });
  },

  async getProfile() {
    const { data } = await api.get<ProfileResponse>('/auth/me');
    return data;
  },

  googleLoginUrl() {
    return '/api/v1/auth/google';
  },
};
