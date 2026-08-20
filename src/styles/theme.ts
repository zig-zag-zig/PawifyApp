// Shared UI tokens. Values match the pre-existing hardcoded palette — this
// module only centralizes them (no visual change).

export const theme = {
  colors: {
    appBackground: '#121212',
    text: '#FFF',
    textMuted: '#888',
    textSoft: '#BBB',
    inlineLink: '#007AFF',
    tabBarBackgroundStart: '#181818',
    tabBarBackgroundEnd: '#2a2a2a',
    tabBarBorder: 'rgba(255, 255, 255, 0.08)',
    tabBarActive: '#FFF',
    tabBarInactive: '#888',
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
    },
  },
  tabBar: {
    height: 48,
    iconSize: 28,
    iconOffset: 8,
  },
} as const;
