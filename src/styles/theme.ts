// Shared UI tokens. Values match the pre-existing hardcoded palette — this
// module only centralizes them (no visual change).

export const theme = {
  colors: {
    appBackground: '#121212',
    text: '#FFF',
    tabBarBackgroundStart: '#181818',
    tabBarBackgroundEnd: '#2a2a2a',
    tabBarBorder: 'rgba(255, 255, 255, 0.08)',
    tabBarActive: '#FFF',
    tabBarInactive: '#888',
  },
  tabBar: {
    height: 48,
    iconSize: 28,
    iconOffset: 8,
  },
} as const;
