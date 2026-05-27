import { describe, expect, it } from 'vitest';
import appConfig from '../app.json';

const SPLASH_BACKGROUND_COLOR = '#121212';
const LAUNCHER_BACKGROUND_COLOR = '#EAD8DD';

describe('Expo app config', () => {
  it('keeps the splash dark without forcing the launcher icon onto a dark plate', () => {
    const splashPlugin = appConfig.expo.plugins.find(plugin => (
      Array.isArray(plugin) && plugin[0] === 'expo-splash-screen'
    ));

    const splashOptions = Array.isArray(splashPlugin) && splashPlugin[0] === 'expo-splash-screen'
      ? splashPlugin[1]
      : undefined;

    expect(splashPlugin).toBeDefined();
    expect(
      typeof splashOptions === 'object' && splashOptions !== null && 'backgroundColor' in splashOptions
        ? splashOptions.backgroundColor
        : undefined
    )
      .toBe(SPLASH_BACKGROUND_COLOR);
    expect(appConfig.expo.android.adaptiveIcon.foregroundImage).toBe('./assets/icon.png');
    expect(appConfig.expo.android.adaptiveIcon.backgroundColor).toBe(LAUNCHER_BACKGROUND_COLOR);
  });
});
