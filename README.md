# Pawify

Pawify is an Expo and React Native app for following music artists and keeping up with their latest releases.

The app includes email and Google sign-in, artist search, followed artist management, release browsing, push notifications, cached artwork, and Android update checks.

## What You Can Do

- Sign in with email OTP or Google.
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
- EAS Build

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

## Builds

Create a local Android debug build:

```bash
npm run build:debug:local
```

The debug APK is copied to `android/app/build/outputs/apk/debug/Pawify-debug.apk`.

Create a local Android release build:

```bash
npm run build:release:local
```

The release APK is copied to `android/app/build/outputs/apk/release/Pawify.apk`.

Install variants use `adb install --user 0`, so they install only into the main Android profile.

Create an EAS production build:

```bash
npm run build:release:cloud
```

The build scripts load `.env` through `scripts/with-env.cjs` and sync loaded environment values to EAS for cloud builds.

Run the full local production release gate:

```bash
npm run release:check
```

This validates the Android toolchain pins, production config, Expo dependency alignment, TypeScript, npm audit, whitespace, release build, and APK signature.

## Testing

Run the app test suite:

```bash
npm test
```

Run TypeScript checks:

```bash
npm run typecheck
```

The current tests cover reducer behavior, artist relationship helpers, task-result normalization, and app launch-background configuration without hitting Firebase or the Pawify API.

Run Expo maintenance checks after SDK 56 patch releases:

```bash
npm run deps:expo:check
```

Apply Expo dependency alignment fixes when needed:

```bash
npm run deps:expo:fix
```

Install and launch the release APK on a connected Android device, then follow the printed manual smoke checklist:

```bash
npm run release:smoke:android
```

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
- Do not upgrade the Android Gradle wrapper or Android Gradle Plugin outside the Expo/RN-supported versions. `npm run toolchain:check` enforces the current pins.
- Production builds exclude `expo-dev-client`, `expo-dev-launcher`, and dev-menu native modules. Development builds keep them.
- Sentry crash reporting is disabled until `EXPO_PUBLIC_SENTRY_DSN` is set. Source-map upload requires build-time `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`; use `SENTRY_DISABLE_AUTO_UPLOAD=true` only when intentionally building without source-map upload.

## License

This project is licensed under the 0BSD license.
