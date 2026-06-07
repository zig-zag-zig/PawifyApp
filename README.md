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

Local e2e runs always target an Android emulator and refuse connected physical devices. The runner starts the `PurrivacyPawifyE2E` AVD when no emulator is already running. Set `PAWIFY_E2E_AVD=YourAvdName` to use a different AVD, `PAWIFY_E2E_HEADLESS=true` to start it without a window, or `PAWIFY_E2E_KEEP_EMULATOR=true` to leave an emulator started by the script running after tests.

Normal debug and release installs may target a physical phone; only the local e2e runner is emulator-only.

Maestro runs each flow separately so its steps remain visible, continues through flow failures, and prints passed and failed flow totals with their names at the end.

PawifyApp e2e uses backend port `10000` and Firebase Auth emulator port `9199`, so it does not collide with PurrivacyApp e2e.

## Testing

Run individual checks when you want a tighter loop:

```bash
npm test
npm run typecheck
```

Use `npm run verify` before pushing app logic changes, and use `npm run doctor` after package or Expo SDK changes.

### Android Signing

Local Android signing credentials are intentionally not committed:

- `credentials.json` points local release builds at the production upload keystore.
- `.credentials/android/pawify-release.p12` is the production upload keystore.

Back up `credentials.json` and the entire `.credentials/android/` directory in an encrypted vault or password manager. To build from another PC with the same Android signing key, restore those files at the same relative paths before running local release builds.

## Project Structure

```text
src/
  components/       Shared UI components
  contexts/         App-wide state providers
  features/         Feature modules for auth, artists, search, releases, and updates
  navigation/       React Navigation stacks and tabs
  services/         API, events, task results, updates, and storage helpers
  styles/           Shared styling
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
