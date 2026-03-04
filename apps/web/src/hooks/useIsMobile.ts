import { Grid } from 'antd';

export function useIsMobile(): boolean {
  const screens = Grid.useBreakpoint();
  // md = 768px; if md is not reached, we're on mobile
  return !screens.md;
}
