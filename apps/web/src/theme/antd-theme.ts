import { theme as antdThemeAlg } from 'antd';
import type { ThemeConfig } from 'antd';

// Dracula (oscuro) y Alucard (claro): mismos hex que los tokens de global.css
const DRACULA = {
  primary: '#bd93f9',
  success: '#50fa7b',
  warning: '#ffb86c',
  error: '#ff5555',
  info: '#8be9fd',
  // El morado es claro: el texto encima va en el fondo oscuro, no en blanco
  onPrimary: '#282a36',
};
const ALUCARD = {
  primary: '#644ac9',
  success: '#14710a',
  warning: '#a34d14',
  error: '#cb3a2a',
  info: '#036a96',
  onPrimary: '#fffbeb',
};

const sharedTokens: ThemeConfig['token'] = {
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
        colorPrimary: DRACULA.primary,
        colorSuccess: DRACULA.success,
        colorWarning: DRACULA.warning,
        colorError: DRACULA.error,
        colorInfo: DRACULA.info,
        colorTextLightSolid: DRACULA.onPrimary,
        colorBgBase: '#282a36',
        colorTextBase: '#f8f8f2',
        colorBgContainer: '#282a36',
        colorBgElevated: '#343746',
        colorBgLayout: '#21222c',
        colorBorder: '#44475a',
        colorBorderSecondary: '#353747',
      },
      components: {
        Layout: {
          siderBg: '#282a36',
          headerBg: '#282a36',
          bodyBg: '#21222c',
        },
        Menu: {
          darkItemBg: '#282a36',
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
      colorPrimary: ALUCARD.primary,
      colorSuccess: ALUCARD.success,
      colorWarning: ALUCARD.warning,
      colorError: ALUCARD.error,
      colorInfo: ALUCARD.info,
      colorTextLightSolid: ALUCARD.onPrimary,
      colorTextBase: '#1f1f1f',
      colorBgLayout: '#ece9df',
      colorBgContainer: '#fffbeb',
      colorBgElevated: '#fffbeb',
      colorBorder: '#ceccc0',
      colorBorderSecondary: '#dedccf',
    },
    components: {
      Layout: {
        headerBg: '#fffbeb',
        siderBg: '#fffbeb',
        bodyBg: '#ece9df',
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
