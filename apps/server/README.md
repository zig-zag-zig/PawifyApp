# Pawify API

Pawify API is the backend for the Pawify mobile app. It connects Firebase-authenticated users with artist following, release lookup, cached background tasks, email OTP flows, and Expo push notifications for new music.

For non-technical readers: this service does the heavy lifting behind the app. It asks music providers for metadata, caches expensive results, remembers followed artists, and tells phones when new releases are found.

## Features

- Firebase-authenticated REST API under `/v1` and `/v2` (see [API versions](#api-versions)).
- Artist search, artist details, following, and unfollowing.
- Release, release-group, and new-release lookup.
- Background task results for heavier artwork/profile/lyrics work.
- Redis-backed caching and notification locking through Dapr.
- Expo push notification delivery.
- Email OTP support through a Dapr SMTP binding.
- GitHub/scheduler-friendly new-release notification endpoint.
- Structured logging, request IDs, and centralized HTTP errors.

## Tech Stack

- Node.js 22
- TypeScript
- Express
- Firebase Admin SDK
- Dapr self-hosted sidecar
- Redis through Dapr state and lock components
- Expo push API through Dapr HTTPEndpoint
- Sentry support

## Related Repositories

- [PawifyApp](https://github.com/zig-zag-zig/PawifyApp) - Expo/React Native mobile app
- `@pawify/shared` (monorepo `packages/shared`) - shared music-domain types and helpers

## Local Development

Install dependencies:

```bash
npm install
```

For a bare Node run, create a local environment file from the Docker local example and point credentials at host paths instead of container paths:

```bash
cp .env.local.example .env.local
```

Start the API after Dapr and Redis are available:

```bash
set -a
. ./.env.local
set +a
npm run dev
```

The local server uses `PORT`, defaulting to `10000`.

Health check:

```bash
curl http://localhost:10000/v1/health
```

## Local Docker

Local Docker uses the same Compose, Redis, and Dapr wiring as the VPS, but with a separate Compose project and a local host port. First-time setup:

```bash
cp .env.local.example .env.local
mkdir -p secrets/local
```

Edit `.env.local` with your local Firebase/database and token values.

Create `secrets/local/dapr-secrets.json`:

```json
{
  "gmail-email": "your-gmail@gmail.com",
  "gmail-password": "your-gmail-app-password",
  "discogs-token": "",
  "genius-access-token": ""
}
```

Put a Firebase service account at:

```text
secrets/local/firebase-service-account.json
```

Allow the non-root containers to read the mounted secret files:

```bash
chmod 755 secrets/local && chmod 644 secrets/local/*.json
```

Then run:

```bash
docker compose --env-file .env.local up -d --build --wait
curl http://127.0.0.1:10000/v1/health
```

For local development with hot reload, use the dev override instead. This mounts `src/` and runs `npm run dev` (ts-node) so code changes restart the server automatically:

```bash
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.dev.yml up -d --build --wait
```

If file changes are not detected inside the container (common on macOS and Windows Docker Desktop), add `CHOKIDAR_USEPOLLING=true` to the `environment` section in `docker-compose.dev.yml`.

The health URL assumes `.env.local` uses `PAWIFY_HOST_PORT=10000` from the current example. The VPS production tunnel keeps using `3001`.

If you are running the Purrivacy mobile app on a connected Android device or emulator, forward the backend port so the app can reach the host Docker service:

```bash
adb reverse tcp:10000 tcp:10000
```

Then the app can call http://127.0.0.1:10000 through the reverse proxy.

Local Redis persistence is disabled by default through `PAWIFY_REDIS_PERSISTENCE=false`. That keeps local cache/lock behavior realistic without local AOF/RDB files mattering. To stop local Docker:

```bash
docker compose --env-file .env.local down
```

To stop a hot-reload dev session:

```bash
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.dev.yml down
```

### Docker Logs

Follow recent logs from the full local stack:

```bash
docker compose --env-file .env.local logs -f --tail=100 pawify pawify-dapr redis
```

Show available Pawify API logs from the last 14 days:

```bash
docker compose --env-file .env.local logs --since=336h pawify
```

For production, use the same commands with `.env.prod`. Docker's disk-efficient `local` logging driver rotates compressed logs in 2 MB chunks, keeps `30` files, and removes the oldest file when the limit is reached. This caps logs at roughly 60 MB per container before compression. Docker's built-in file drivers cannot guarantee 14 days of retention: `--since=336h` shows any retained logs from that period, but high log volume can rotate them sooner.

## Environment

Use the environment-specific examples as the source of truth:

- `.env.local.example` for local Docker.
- `.env.prod.example` for the VPS production stack.

Production-like runs need values for:

- `DAPR_HTTP_PORT` or `DAPR_HTTP_ENDPOINT`
- `FIREBASE_DATABASE_URL`
- `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON`
- `NOTIFY_API_KEY`
- `REDIS_PASSWORD` in the environment file
- a Dapr file secret store containing `gmail-email`, `gmail-password`, `discogs-token`, and `genius-access-token`

Common optional values:

- `MUSICBRAINZ_USER_AGENT`
- Cache TTL and task tuning values from the matching `.env.*.example` file.

Never commit Firebase service accounts, API keys, Gmail app passwords, Redis credentials, Dapr secret files, or `.env` files.

## Branching And Releases

Pawify uses trunk-based development:

- `main` is the protected trunk and production branch.
- Pull requests into `main` run CI.
- Merging or pushing to `main` builds a GHCR image and deploys production.

Working branches should stay short-lived:

- `feature/<short-name>` for new behavior.
- `fix/<short-name>` for normal bug fixes.
- `hotfix/<short-name>` for urgent production fixes.

Normal flow:

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/<short-name>
```

Open pull requests from `feature/*`, `fix/*`, or `hotfix/*` into `main`. Keep changes small enough that `main` stays production-ready after each merge.

## Testing

The test suite uses Node.js built-in `node:test` and `node:assert/strict` — zero test framework dependencies.

Run all tests:

```bash
npm test
```

This compiles TypeScript via `tsconfig.test.json` (output to `lib-test/`) and runs `node --test "lib-test/**/*.test.js"`.

### Test coverage

| Area | Test file |
|---|---|
| Date utilities | `test/dateUtil.test.ts` |
| Array utilities | `test/arrayUtils.test.ts` |
| HTTP errors | `test/httpErrors.test.ts` |
| HTTP error middleware | `test/errorMiddleware.test.ts` |
| Config env parsing | `test/envParsing.test.ts` |
| Request validation | `test/httpValidation.test.ts` |
| Request deduper | `test/requestDeduper.test.ts` |
| Promise pool | `test/promisePool.test.ts` |
| Logger redaction | `test/loggerRedaction.test.ts` |
| MusicBrainz mapper | `test/musicbrainzMapper.test.ts` |
| Music API types | `test/musicApiTypes.test.ts` |
| External links | `test/externalLinks.test.ts` |
| Profile image lookups | `test/profileImageLookups.test.ts` |
| Remote state helpers | `test/remoteStateHelpers.test.ts` |
| New release sorting | `test/newReleaseSorting.test.ts` |
| Release filtering/grouping | `test/releaseFilteringAndGrouping.test.ts` |
| Release processing helpers | `test/releaseProcessingHelpers.test.ts` |
| Release use cases | `test/releaseUseCases.test.ts` |
| Release existence use case | `test/releaseExistenceUseCases.test.ts` |
| Artist use cases | `test/artistUseCases.test.ts` |
| Auth use cases | `test/authUseCases.test.ts` |
| User settings use cases | `test/userSettingsUseCases.test.ts` |
| Notification use cases | `test/notificationUseCases.test.ts` |
| Push token use cases | `test/pushTokenUseCases.test.ts` |
| Push notification payloads | `test/pushNotificationPayloads.test.ts` |
| Push notification delivery | `test/pushNotificationDelivery.test.ts` |
| Task use cases | `test/taskUseCases.test.ts` |
| Task result serialization | `test/taskResultSerialization.test.ts` |
| Background task mappers | `test/backgroundTaskMappers.test.ts` |
| Cache serialization | `test/cacheSerialization.test.ts` |
| Rate limiter | `test/rateLimiter.test.ts` |
| Dapr infrastructure | `test/daprMigration.test.ts` |
| Health routes | `test/routes/healthRoutes.test.ts` |
| HTTP route integration | `test/routes/httpRoutes.test.ts` |
| Firebase emulator integration | `test/emulator/firebaseEmulator.test.ts` (requires `npm run test:emulator`) |

### Test helpers

| Helper | Purpose |
|---|---|
| `test/helpers/moduleFakes.ts` | `installModuleFake` / `installFirebaseServiceFake` for mocking ES module imports |
| `test/helpers/releaseFixtures.ts` | Factory functions for `Release`, `NewRelease`, `ReleaseNotificationSettings` |
| `test/helpers/releaseUseCaseFakes.ts` | Fake dependencies for release use case tests |
| `test/helpers/userSettingsUseCaseFakes.ts` | Fake dependencies for user settings use case tests |
| `test/helpers/httpTestApp.ts` | Integration test infrastructure: installs module fakes for Firebase/Dapr, starts test Express server |

### NPM scripts

| Command | Purpose |
|---|---|
| `npm test` | Compile and run all unit + route tests (emulator tests auto-skip when emulators are not running) |
| `npm run test:integration` | Compile and run the Firebase emulator integration suite via `firebase emulators:exec` (requires Java, see below) |
| `npm run test:emulator` | Alias for `npm run test:integration` |
| `npm run build` | Compile TypeScript to `lib/` (runs the full test suite first, including the Firebase emulator suite — requires Java, see below) |
| `npm run dev` | Run dev server with `ts-node` |

### Firebase emulator tests

The `test/emulator/` directory contains integration tests that run against real Firebase emulators. These tests are automatically skipped when emulators are not running, so `npm test` is always safe to run.

To run emulator tests:

```bash
npm run test:emulator
```

This requires `firebase-tools` (installed as a dev dependency) and will start the Auth, Firestore, and Database emulators automatically. The emulator configuration is in `firebase.json`.

The Firebase emulators are JVM-based, so **Java is required** for anything that starts them: `npm run test:integration`/`npm run test:emulator` directly, and `npm run build` (it runs the full test suite before compiling).

### Writing new tests

Tests use the `describe`/`it` pattern from `node:test` with `assert` from `node:assert/strict`. Use case tests create fake dependency objects matching the port interfaces and assert on recorded call arguments. For modules that trigger Firebase side effects on import, use `installFirebaseServiceFake()` before dynamic `await import()`.

```typescript
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('feature', () => {
    it('does the thing', () => {
        assert.equal(actual, expected);
    });
});
```

### Extracted testable modules

Several modules were extracted from implementation files to make pure functions independently testable:

- `src/config/envParsing.ts` — environment variable parsing helpers
- `src/services/cache/cacheSerialization.ts` — cache serialization, chunking, and TTL helpers

## Firebase Emulators

Firebase has a Local Emulator Suite for Auth, Firestore, Realtime Database, and related products. Use it for integration tests that need Firebase behavior without production writes.

Example direction:

```bash
firebase emulators:exec --only auth,database,firestore "npm test"
```

The default test suite should remain safe to run without live Firebase, Dapr, or Redis writes.

## Upstream Rate Limits

Pawify depends on third-party music data. If artist search, release details, cover art, or lyrics are slow, the bottleneck may be the provider, not your API server.

| Provider | Used For | Operational Note |
| --- | --- | --- |
| MusicBrainz | Artist, release, relationship, and track metadata | Keep traffic polite; MusicBrainz publishes a strict per-IP request-rate policy. |
| Cover Art Archive | Release and release-group cover art | Cache aggressively and tolerate missing art. |
| Discogs | Optional artist image fallback | Watch provider rate-limit headers when enabled. |
| Genius | Optional lyrics lookup | Treat `429` and transient failures as provider throttling. |

Pawify keeps provider concurrency and provider-specific rate-limit backoff in app code. Dapr resiliency owns provider retry, timeout, and circuit-breaker execution.

## API Overview

Public endpoints:

- `GET /v1/health`
- `POST /v1/sendOtp`
- `POST /v1/verifyOtp`

Scheduled/admin endpoint:

- `GET /v1/notifyNewReleases` with `x-api-key`

Authenticated endpoints expect:

```http
Authorization: Bearer <firebase-id-token>
```

Common authenticated routes:

- Account: `GET /v1/revokeToken`, `POST /v1/changeEmail`, `POST /v1/deleteUserAccount`
- Artists: `GET /v1/getFollowing`, `POST /v1/searchArtists`, `POST /v1/getArtistDetails`, `POST /v1/followArtist`, `POST /v1/unfollowArtist`, `POST /v1/unfollowArtists`
- Releases: `GET /v1/getNewReleases`, `POST /v1/removeNewReleases`, `POST /v1/getArtistReleases`, `POST /v1/getReleaseGroupReleases`, `POST /v1/getRelease`, `POST /v1/verifyReleaseExistence`
- Push tokens: `POST /v1/savePushToken`, `POST /v1/deletePushToken`
- Tasks: `POST /v1/getTaskResult`

### API versions

All endpoints are mounted under both `/v1` and `/v2`; the versions differ only
in how expensive background assets (artist profile images, release covers,
track lyrics) are delivered:

- **`/v1` (legacy contract):** responses always carry a task id
  (`profileImageTaskId`, `releaseCoverTaskId`, `releaseGroupCoverTaskId`,
  `lyricsTaskId`) and queue the full set of work in the background. They
  contain **no immediate asset maps** — clients must poll
  `POST /v1/getTaskResult` to collect the results.
- **`/v2` (cache-first contract):** every asset resolvable from cache is
  returned **immediately** in the response — `profileImages` on the artist
  endpoints, `releaseCovers` on the release endpoints, `trackLyrics` on
  `getRelease` — and only the pending subset is queued. Task ids are
  **nullable**: when nothing is pending the task id is `null` and no polling
  is needed. Clients that understand this contract get first paint without
  a background round-trip.

`PawifyApp` selects the prefix from its app major version. The unversioned
paths (`/getFollowing`, …) are a deprecated compatibility alias for ancient
builds and serve the v1 contract.

## Deployment

- Pull requests into `main` run build, tests, and Docker image validation.
- Pushes to `main` build and push a GHCR image, then deploy the production stack at `http://127.0.0.1:3001`.
- Manual GitHub Actions runs from `main` can redeploy production.
- Use the Docker Compose stack in this repo for the single-VPS deployment.
- Dapr components live in `dapr/components`; secret files are mounted from `secrets/<environment>`.
- Redis is local to each Compose network, password-protected, and configured with AOF plus RDB snapshots.
- Use `scripts/backup-redis-docker.sh` for Redis backups.
- Trigger `GET /v1/notifyNewReleases` from a trusted scheduler with `x-api-key: <NOTIFY_API_KEY>`.
- Keep origin-only secrets out of mobile apps and public repositories.

## Project Layout

```text
src/api/              Versioned route registration
src/common/           HTTP, logging, request, and utility code
src/config/           Runtime configuration and env parsing
src/features/         Auth, artists, releases, notifications, push tokens, tasks
src/features/releases/domain/  Release domain logic (sorting, filtering, processing)
src/infrastructure/   Firebase, monitoring, and provider adapters
src/services/         Music APIs, cache, email, tasks, notifications
src/services/cache/   Cache serialization, chunking, and TTL policy helpers
src/services/musicbrainz/  MusicBrainz client, release queries, and artist search
src/utils/            Helpers and shared types
test/                 Test entry points and shared suites
test/routes/          Offline HTTP route tests (fakes, no emulators)
test/unit/            Unit tests for common, config, services, and domain modules
test/emulator/        Integration tests against real Firebase emulators
test/helpers/         Test fixtures, fakes, and module mocking utilities
```

## License

This project is licensed under the 0BSD license.
