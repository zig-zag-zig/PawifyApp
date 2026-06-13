# Pawify

Pawify is an Expo and React Native app for following music artists and keeping up with their latest releases.

The app includes email and Google sign-in, artist search, followed artist management, release browsing, push notifications, cached artwork, and Android update checks.

## What You Can Do

- Sign in with an email verification code or Google.
- Search for artists and inspect artist profile details.
- Follow and unfollow artists.
- Browse release groups, releases, tracks, artwork, links, and lyrics when available.
- Receive push notifications for newly discovered releases.
- Check GitHub Releases for Android APK updates in sideload builds.

## Tech Stack

- Expo SDK 56
- React Native 0.85
- React 19
- TypeScript
- Firebase Authentication
- React Navigation
- Local Android APK builds

## Related Repositories

- [Pawify](https://github.com/zig-zag-zig/Pawify) - backend API used by this app
- [PawifyModule](https://github.com/zig-zag-zig/PawifyModule) - shared music models and helpers used by the app and API

## Upstream Rate Limits

Most artist, release, cover art, and lyrics data flows through the [Pawify API](https://github.com/zig-zag-zig/Pawify), which documents the upstream music-provider limits that can affect lookup speed.

The app also uses the [GitHub REST API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2022-11-28) when Android update checks are enabled. GitHub publishes a primary limit of 60 unauthenticated requests per hour by source IP, or 5,000 authenticated requests per hour. Do not ship a private GitHub token in public app builds just to raise this quota.

## Getting Started

Install dependencies:

```bash
npm install
```

Create a local `.env` file with the API URL used by the app:

```bash
EXPO_PUBLIC_API_BASE_URL=https://your-api.example.com/
```

Optional environment values:

```bash
EXPO_PUBLIC_API_VERSION=v1
EXPO_PUBLIC_ARTIST_DIAGNOSTICS=false
EXPO_PUBLIC_UPDATE_GITHUB_REPO_URL=https://github.com/owner/repo

# EXPO_PUBLIC values are bundled into the app. Leave this empty for public builds.
EXPO_PUBLIC_UPDATE_GITHUB_TOKEN=
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_SENTRY_DSN=
EXPO_PUBLIC_SENTRY_ENABLED=true
EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
SENTRY_DISABLE_AUTO_UPLOAD=
```

The app also expects Firebase configuration through `google-services.json`. Use your own Firebase project configuration for local development and production builds. `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` can override the web OAuth client ID from `google-services.json`.

`EXPO_PUBLIC_` values are bundled into the app. Use `EXPO_PUBLIC_UPDATE_GITHUB_TOKEN` only for private local testing, never for public production builds. Sentry source-map upload credentials must stay in `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`. If `EXPO_PUBLIC_SENTRY_DSN` is empty, Sentry stays disabled and its native upload plugin is not added to the generated release project.

## Development

Start the Expo development server:

```bash
npm start
```

Run the Android app:

```bash
npm run android
```

Run the iOS app:

```bash
npm run ios
```

Android is the primary target for the current native Google sign-in and update flow. iOS may need additional provider setup depending on the authentication methods you enable.

## NPM Scripts

Run the app locally:

```bash
npm start
npm run android
npm run ios
```

Check environment injection without starting or building the app:

```bash
npm run env:check:development
npm run env:check:production
npm run env:check:e2e
```

Run the fast local quality gate:

```bash
npm run verify
```

`verify` runs TypeScript checks and the Vitest suite. Android build scripts run this first and stop immediately if it fails.

Run Expo dependency/tooling checks:

```bash
npm run doctor
```

Safely align Expo-managed package versions, then re-run maintenance checks and tests:

```bash
npm run deps:update
```

`deps:update` may change `package.json` or `package-lock.json`; use it when updating packages, not as part of every build.

## Testing

Run all unit tests:

```bash
npm test
```

Run TypeScript checks:

```bash
npm run typecheck
```

Run both (the fast quality gate):

```bash
npm run verify
```

### Test structure

Tests live alongside their source files (`src/**/*.test.ts`) or in `tests/` for cross-cutting concerns. The test runner is [Vitest](https://vitest.dev/) with `environment: 'node'`.

```text
tests/
  appConfig.test.ts           Expo config and splash color tests
  dateUtil.test.ts            Date parsing, formatting, sort tests
  e2e/                        Firebase emulator and fixture server tests
src/
  config/
    envParsing.test.ts        Environment variable parsing tests
    firebaseEmulator.test.ts  Emulator URL normalization tests
  services/
    apiErrors.test.ts         API error classification tests
    api/apiClient.test.ts     API client request lifecycle tests
    eventService.test.ts      Event dedup, filtering, listener tests
    taskResultCache.test.ts   Cache LRU and terminal status tests
    externalNavigation.test.ts  Resume delay timing tests
    backgroundEventStorage.test.ts  Storage parsing edge case tests
    userFacingErrors.test.ts  Error message routing tests
    notifications/notificationEvents.test.ts  Payload parsing tests
  utils/
    nullableMaps.test.ts      Map merge semantics tests
    taskResultMaps.test.ts    Task result extraction tests
  shared/
    taskResults/              Payload merging and nullable map tests
  features/
    artist/domain/            Release sections, age calculation tests
    artists/domain/           Artist sorting tests
    auth/domain/              Credential validation, security rules tests
    release/domain/           Pagination, enrichment, grouping tests
    search/domain/            Artist deduplication tests
    updates/                  Update service and modal formatting tests
  components/
    externalLinks/            Link ranking tests
    cachedImage/              Cache key hashing tests
  hooks/
    useGoogleAuth.test.ts     Google sign-in error helper tests
```

### Testing React hooks

The default vitest environment is `node`, which is fast and sufficient for most tests (pure functions, reducers, services).

To test React hooks that use `useState`, `useCallback`, etc., you need a DOM environment. The required dev dependencies are already installed:

```
@testing-library/react, @testing-library/dom, react-dom, jsdom
```

Write hook tests with the `// @vitest-environment jsdom` directive at the top and use `renderHook`/`act` from `@testing-library/react`:

```ts
// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { useSelectionManager } from './useSelectionManager';

it('toggles selection', () => {
  const { result } = renderHook(() => useSelectionManager([{ id: '1' }]));
  act(() => result.current.toggleSelect('1'));
  expect(result.current.selectedIds.has('1')).toBe(true);
});
```

Use `@testing-library/react` (not `@testing-library/react-native`) since React Native doesn't include `react-dom` and `@testing-library/react-native` has transform compatibility issues with vitest v4. The `// @vitest-environment jsdom` directive is the per-file environment override — vitest v4 removed the `environmentMatchGlobs` config option.

### Testing singletons with module-level state

Services like `eventService`, `taskResultCache`, and `externalNavigation` use module-level mutable state. Each exports a `resetForTesting()` function that clears internal state between tests. Use `vi.resetModules()` in `afterEach` to get fresh module instances, or call `resetForTesting()` directly:

```ts
afterEach(() => {
  vi.resetModules();
});

async function createService() {
  const mod = await import('./eventService');
  return mod.EventService;
}
```

Use `npm run verify` before pushing app logic changes, and use `npm run doctor` after package or Expo SDK changes.

## Android Builds

Development/debug builds install with the launcher name `Pawify Dev`, while production release builds install as `Pawify`. Their separate Android package names allow both to be installed side by side.

Build a debug APK:

```bash
npm run build:debug
```

Build and install a debug APK on the main Android profile only:

```bash
npm run build:debug:install
```

Build a production release APK:

```bash
npm run build:release
```

Build and install a production release APK on the main Android profile only:

```bash
npm run build:release:install
```

Install variants use `adb install --user 0`, so they install only into the main Android profile.

Use `--clean` when you need a fresh Expo prebuild and Gradle clean:

```bash
npm run build:debug -- --clean
npm run build:debug:install -- --clean
npm run build:release -- --clean
npm run build:release:install -- --clean
```

Use `--dry-run` to preview the commands, selected environment, clean forwarding, APK path, and install steps without running prebuild, Gradle, or ADB:

```bash
npm run build:release -- --dry-run
npm run build:release:install -- --clean --dry-run
```

Dry runs are for checking script behavior before a real build or install. They are not a substitute for `verify`, `doctor`, or a real APK build.

Use one version bump flag when building a new APK version:

```bash
npm run build:release -- --bump-patch
npm run build:release -- --bump-minor
npm run build:release -- --bump-major
```

Patch bumps are for fixes, minor bumps are for normal feature releases, and major bumps are for intentionally larger compatibility/version changes. The build script updates `package.json`, `package-lock.json` when present, `app.json` `expo.version`, and `app.json` `expo.android.versionCode` before Expo prebuild and Gradle run. Combine with `--dry-run` to preview the version change without writing files:

```bash
npm run build:release -- --bump-patch --dry-run
```

Android native files are generated through Expo prebuild and project scripts. Make persistent native changes in the tracked scripts/templates, not directly in ignored `android/` output.

## E2E Testing

Run local Maestro e2e tests against the local backend and Firebase emulators:

```bash
npm run e2e
```

Run only the smoke flow:

```bash
npm run e2e:smoke
```

Forward flags after `--`:

```bash
npm run e2e -- --clean
npm run e2e:smoke -- --clean
npm run e2e -- --dry-run
npm run e2e -- --clean --dry-run
```

`e2e` and `e2e:smoke` run `verify`, build and install the e2e APK, start the local backend/Firebase emulator stack, then run Maestro. Dry-run mode previews the e2e APK build/install path and skips Maestro.

The e2e APK is written under `android/app/build/outputs/apk/e2e/Pawify-e2e.apk`, separate from the normal `debug/` and `release/` APK output folders.

Local e2e runs always target an Android emulator and refuse connected physical devices. The runner starts the `PawifyE2E` AVD when no emulator is already running. Set `PAWIFY_E2E_AVD=YourAvdName` to use a different AVD, `PAWIFY_E2E_HEADLESS=true` to start it without a window, or `PAWIFY_E2E_KEEP_EMULATOR=true` to leave an emulator started by the script running after tests.

Normal debug and release installs may target a physical phone; only the local e2e runner is emulator-only.

Maestro runs each flow separately so its steps remain visible, continues through flow failures, and prints passed and failed flow totals with their names at the end.

PawifyApp e2e uses backend port `10000` and Firebase Auth emulator port `9199`, so it does not collide with PurrivacyApp e2e.

### Android Signing

Local Android signing credentials are intentionally not committed:

- `credentials.json` points local release builds at the production upload keystore.
- `.credentials/android/pawify-release.p12` is the production upload keystore.

Back up `credentials.json` and the entire `.credentials/android/` directory in an encrypted vault or password manager. To build from another PC with the same Android signing key, restore those files at the same relative paths before running local release builds.

## Project Structure

```text
src/
  components/       Shared UI components
  config/           Environment parsing, Firebase emulator config
  contexts/         App-wide state providers
  features/         Feature modules for auth, artists, search, releases, and updates
  hooks/            Shared React hooks (task manager, selection, Google auth)
  navigation/       React Navigation stacks and tabs
  services/         API, events, task results, updates, and storage helpers
  shared/           Shared task result types and utilities
  styles/           Shared styling
  types/            Shared TypeScript types
  utils/            Pure utility functions (arrays, diagnostics, maps)
tests/
  appConfig.test.ts Expo config tests
  dateUtil.test.ts  Date utility tests (submodule source)
  e2e/              Firebase emulator and fixture server tests
```

## Security Notes

- Do not commit production secrets, signing keys, or private `.env` values.
- `EXPO_PUBLIC_` values are bundled into the app and should be treated as public client configuration.
- Use your own Firebase and API configuration before publishing a production build.
- Do not upgrade the Android Gradle wrapper or Android Gradle Plugin outside the Expo/RN-supported versions unless `npm run doctor`, `npm run verify`, and a real Android build pass afterward.
- Production builds exclude `expo-dev-client`, `expo-dev-launcher`, and dev-menu native modules. Development builds keep them.
- Sentry crash reporting is disabled until `EXPO_PUBLIC_SENTRY_DSN` is set. Source-map upload requires build-time `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`; use `SENTRY_DISABLE_AUTO_UPLOAD=true` only when intentionally building without source-map upload.

## License

This project is licensed under the 0BSD license.
