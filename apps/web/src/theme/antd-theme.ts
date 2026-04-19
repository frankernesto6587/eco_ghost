import { theme as antdThemeAlg } from 'antd';
import type { ThemeConfig } from 'antd';

// Ember brand palette
const EMBER_PRIMARY = '#d4700a'; // oklch(0.72 0.18 50) ≈ warm orange
const EMBER_SUCCESS = '#4da666'; // oklch(0.76 0.14 150) — sobrio green
const EMBER_ERROR = '#c9503c';   // oklch(0.70 0.18 25) — sobrio red
const EMBER_WARNING = '#d4980a';

const sharedTokens: ThemeConfig['token'] = {
  colorPrimary: EMBER_PRIMARY,
  colorSuccess: EMBER_SUCCESS,
  colorWarning: EMBER_WARNING,
  colorError: EMBER_ERROR,
  borderRadius: 10,
  fontFamily: "'Geist', 'Inter', system-ui, -apple-system, sans-serif",
  fontFamilyCode: "'Geist Mono', ui-monospace, monospace",
};

export function getAntdTheme(isDark: boolean): ThemeConfig {
  if (isDark) {
    return {
      algorithm: antdThemeAlg.darkAlgorithm,
      token: {
        ...sharedTokens,
        colorBgBase: '#1f1c1a',
        colorBgContainer: '#282420',
        colorBgElevated: '#302b27',
        colorBgLayout: '#1a1715',
        colorBorder: '#3d3730',
        colorBorderSecondary: '#332e28',
      },
      components: {
        Layout: {
          siderBg: '#282420',
          headerBg: '#282420',
          bodyBg: '#1a1715',
        },
        Menu: {
          darkItemBg: '#282420',
          itemBorderRadius: 10,
        },
        Button: {
          borderRadius: 10,
        },
        Input: {
          borderRadius: 10,
        },
        Card: {
          borderRadius: 14,
        },
      },
    };
  }

  return {
    algorithm: antdThemeAlg.defaultAlgorithm,
    token: {
      ...sharedTokens,
      colorBgLayout: '#f7f5f3',
      colorBgContainer: '#ffffff',
      colorBgElevated: '#ffffff',
      colorBorder: '#e5e0da',
      colorBorderSecondary: '#ede9e3',
    },
    components: {
      Layout: {
        headerBg: '#ffffff',
        siderBg: '#ffffff',
        bodyBg: '#f7f5f3',
      },
      Menu: {
        itemBorderRadius: 10,
      },
      Button: {
        borderRadius: 10,
      },
      Input: {
        borderRadius: 10,
      },
      Card: {
        borderRadius: 14,
      },
    },
  };
}
