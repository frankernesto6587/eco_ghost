import { useEffect, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, App as AntApp } from 'antd';
import { BrowserRouter } from 'react-router-dom';
import { getAntdTheme } from './theme/antd-theme';
import { AppRoutes } from './routes';
import { ErrorBoundary } from './components/feedback';
import { useUIStore } from './store/ui.store';
import './i18n';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function App() {
  const isDark = useUIStore((s) => s.isDark);
  const themeConfig = useMemo(() => getAntdTheme(isDark), [isDark]);

  useEffect(() => {
    document.documentElement.style.background = isDark ? '#000000' : '#f5f5f5';
    document.body.style.background = isDark ? '#000000' : '#f5f5f5';
  }, [isDark]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider theme={themeConfig}>
          <AntApp>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
