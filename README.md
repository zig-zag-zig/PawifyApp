# Pawify Monorepo

Single repository for the Pawify product:

| Path | What it is |
| --- | --- |
| `apps/server` | TypeScript/Express backend API (`pawify-api`, Docker/Dapr/Redis deployment) |
| `apps/mobile` | Expo/React Native mobile client (`pawify`, local Gradle APK builds + GitHub Releases) |
| `packages/shared` | `@pawify/shared` — shared music-domain types and helpers consumed by both apps |

## Layout & conventions

- Each package keeps its own `package.json`, `.gitignore`, and lockfile. There is
  intentionally **no root package.json / npm workspaces**: `@pawify/shared` is
  wired in via npm `file:` dependencies and symlinked into each app's
  `node_modules`.
- Imports of shared code always use the package name — `import { Artist } from '@pawify/shared'`.
- Shared code is source-only TypeScript:
  - **Mobile** resolves `@pawify/shared` to its TS source through the package's
    `react-native` main field (Metro compiles it; no build step), while vitest
    aliases it to source too.
  - **Server** consumes built `dist/` + declarations; lifecycle `pre*` hooks
    (`prebuild`, `pretest`, `predev`, `pretypecheck`, …) rebuild the shared
    package automatically so runtime output is never stale.

## Working in the repo

```bash
# server
cd apps/server
npm install        # also installs+builds packages/shared
npm run verify     # typecheck + unit tests
npm run test:integration   # Firebase emulator tests
npm run dev        # hot-reload dev server (tsx watch)

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
