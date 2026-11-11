// Shared UI tokens.

export const theme = {
  colors: {
    appBackground: '#121212',
    text: '#FFF',
    textMuted: '#888',
    textSoft: '#BBB',
    inlineLink: '#007AFF',
    tabBarSurface: '#15171A',
    tabBarItemActiveBg: '#1A1D22',
    tabBarBorder: 'rgba(255, 255, 255, 0.07)',
    tabBarActive: '#7DD3FC',
    tabBarInactive: '#8B8F98',
    selectionAccent: '#38BDF8',
    selectionBackground: 'rgba(56, 189, 248, 0.13)',
    selectionBorder: 'rgba(56, 189, 248, 0.42)',
    tagPillBackground: 'rgba(17, 19, 23, 0.92)',
    tagPillBorder: 'rgba(164, 168, 177, 0.55)',
    tagPillText: '#A4A8B1',
    placeholderBackdrop: '#1f2328',
    imageBackdrop: '#333',
    iconMuted: '#D1D5DB',
    externalLinks: {
      border: 'rgba(148, 163, 184, 0.26)',
      background: 'rgba(15, 23, 42, 0.66)',
      mutedBackground: 'rgba(15, 23, 42, 0.42)',
      label: '#E2E8F0',
      fallbackIcon: '#CBD5E1',
      overflowToggle: '#BFDBFE',
      accent: '#38BDF8',
    },
  },
  tabBar: {
    height: 56,
    iconSize: 24,
    iconOffset: 0,
  },
} as const;
