# Pawify Monorepo

Single repository for the Pawify product:

| Path | What it is |
| --- | --- |
| `apps/server` | TypeScript/Express backend API (`pawify-api`, Docker/Dapr/Redis deployment) |
| `apps/mobile` | Expo/React Native mobile client (`pawify`, local Gradle APK builds + GitHub Releases) |
| `packages/shared` | `@pawify/shared` — shared music-domain types and helpers consumed by both apps |

## Layout & conventions

- Each package keeps its own `package.json`, `.gitignore`, and lockfile. There are
  **no npm workspaces**: `@pawify/shared` is wired in via npm `file:` dependencies
  and symlinked into each app's `node_modules`.
- The root `package.json` is a thin delegation layer only — run everything from
  the repo root (`npm run server -- <script>`, `npm run mobile -- <script>`,
  `npm run verify`, `npm run test`, `npm run dev`, `npm run docker:up`,
  `npm run build:release`, `npm run install:all`). Scripts themselves stay
  defined in each package; the root never redefines them.
- Imports of shared code always use the package name — `import { Artist } from '@pawify/shared'` (never relative escapes out of an app).
- Shared code is source-only TypeScript:
  - **Mobile** resolves `@pawify/shared` to its TS source through the package's
    `react-native` main field (Metro compiles it; no build step), while vitest
    aliases it to source too.
  - **Server** consumes built `dist/` + declarations; lifecycle `pre*` hooks
    (`prebuild`, `pretest`, `predev`, `pretypecheck`, …) rebuild the shared
    package automatically so runtime output is never stale.

## Working in the repo

```bash
# root conveniences (delegate into packages)
npm run install:all   # install deps for shared, server, mobile
npm run verify        # typecheck + tests for server AND mobile
npm run test          # tests only, both packages
npm run dev           # server dev (tsx watch, hot reload)
npm run docker:up     # local server stack (prod image + dev override)
npm run docker:down
npm run build:release # signed mobile APK build

# per-package scripts (any of them)
npm run server -- test:integration    # e.g. Firebase emulator tests
npm run mobile -- android
```
# server in docker (same as before the monorepo, run from apps/server)
docker compose --env-file .env.local up -d --build --wait
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.dev.yml up -d --build --wait

# mobile
cd apps/mobile
npm install
npm run verify     # typecheck + vitest
npm run build:release      # local signed APK build (keystore stays local)
```

## CI/CD

- `Pawify API CI` (`.github/workflows/server.yml`): typecheck + unit + emulator
  tests + Docker image on every PR/push touching `apps/server/**` or
  `packages/shared/**`. On `main`, a release gate deploys **only when
  `apps/server/package.json` version is bumped** past the latest `server-v*` tag.
- `Pawify Mobile CI` (`.github/workflows/mobile.yml`): typecheck + tests on PRs,
  plus a release gate that flags when `app.json` version expects a local APK
  release (APKs are built locally; the signing keystore never leaves the dev
  machine).

Release flow: bump `version` (and `versionCode` for the app), merge to `main`,
then release/deploy per the gate output.

## Related docs

- `apps/server/README.md` — API docs, local development
- `apps/server/DEPLOYMENT.md` — VPS deployment notes
- `apps/mobile/README.md` — app docs, local builds
- `packages/shared/README.md` — shared package notes
