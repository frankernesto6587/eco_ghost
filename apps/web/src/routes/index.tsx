import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { PublicRoute } from './PublicRoute';
import { AppLayout } from '@/components/layout';
import { LoadingScreen } from '@/components/feedback';

// Lazy-loaded pages
const LoginPage = lazy(() => import('@/pages/Login'));
const RegisterPage = lazy(() => import('@/pages/Register'));
const AuthCallbackPage = lazy(() => import('@/pages/AuthCallback'));
const DashboardPage = lazy(() => import('@/pages/Dashboard'));
const TransactionsPage = lazy(() => import('@/pages/Transactions'));
const AccountsPage = lazy(() => import('@/pages/Accounts'));
const DebtsPage = lazy(() => import('@/pages/Debts'));
const CategoriesPage = lazy(() => import('@/pages/Categories'));
const SettingsPage = lazy(() => import('@/pages/Settings'));
const OrganizationPage = lazy(() => import('@/pages/Organization'));

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingScreen />}>{children}</Suspense>;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route element={<PublicRoute />}>
        <Route
          path="/login"
          element={
            <LazyPage>
              <LoginPage />
            </LazyPage>
          }
        />
        <Route
          path="/register"
          element={
            <LazyPage>
              <RegisterPage />
            </LazyPage>
          }
        />
      </Route>

      {/* OAuth callback (accessible regardless of auth state) */}
      <Route
        path="/auth/callback"
        element={
          <LazyPage>
            <AuthCallbackPage />
          </LazyPage>
        }
      />

      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<LazyPage><DashboardPage /></LazyPage>} />
          <Route path="/transactions" element={<LazyPage><TransactionsPage /></LazyPage>} />
          <Route path="/accounts" element={<LazyPage><AccountsPage /></LazyPage>} />
          <Route path="/debts" element={<LazyPage><DebtsPage /></LazyPage>} />
          <Route path="/categories" element={<LazyPage><CategoriesPage /></LazyPage>} />
          <Route path="/settings" element={<LazyPage><SettingsPage /></LazyPage>} />
          <Route path="/organization" element={<LazyPage><OrganizationPage /></LazyPage>} />
          <Route index element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
