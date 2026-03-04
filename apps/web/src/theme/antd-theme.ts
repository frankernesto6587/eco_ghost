import { theme as antdThemeAlg } from 'antd';
import type { ThemeConfig } from 'antd';

const sharedTokens: ThemeConfig['token'] = {
  colorPrimary: '#1677ff',
  colorSuccess: '#52c41a',
  colorWarning: '#faad14',
  colorError: '#ff4d4f',
  borderRadius: 8,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'",
};

export function getAntdTheme(isDark: boolean): ThemeConfig {
  if (isDark) {
    return {
      algorithm: antdThemeAlg.darkAlgorithm,
      token: sharedTokens,
      components: {
        Layout: {
          siderBg: '#141414',
          headerBg: '#141414',
          bodyBg: '#000000',
        },
        Menu: {
          darkItemBg: '#141414',
          itemBorderRadius: 8,
        },
      },
    };
  }

  return {
    algorithm: antdThemeAlg.defaultAlgorithm,
    token: sharedTokens,
    components: {
      Layout: {
        headerBg: '#fff',
        siderBg: '#fff',
        bodyBg: '#f5f5f5',
      },
      Menu: {
        itemBorderRadius: 8,
      },
    },
  };
}
