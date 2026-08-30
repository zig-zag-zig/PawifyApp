# Pawify API — Code Refactoring Plan

**Audit date:** 2026-08-20
**Scope:** everything in this repo except `src/modules` (git submodule — do not touch).
**Sources reviewed:** all of `src/` (~150 files), tests, `package.json`/lockfile, Dockerfile, compose files, dapr config, env examples, CI workflow, scripts, README/DEPLOYMENT docs. Client (`PawifyApp`) was consulted to confirm API-contract decisions.

**Status:** Phases 0–4 implemented 2026-08-20 — see §3 for the recorded npm state and §7 for the per-commit implementation status. Phase 5 items remain deferred.

---

## 1. Executive summary

The codebase is in good shape overall: hexagonal-ish structure, consistent use-case/ports pattern, real tests (443 passing), good secrets hygiene, sane ops setup. The problems worth fixing cluster into five groups:

1. **Real correctness bugs** — stale dedup cache after writes, lost `requestId` in error logs, unconsumed fetch bodies (undici connection leak), a possible infinite loop in MusicBrainz pagination, error-class mapping that turns infra outages into 400s.
2. **npm issues** — 11 audit findings (all transitive via dev-only `firebase-tools`), a broken `uuid` override producing an *invalid* tree (`npm ls` exits with ELSPROBLEMS), `tsx` used unpinned via `npx` in dev compose, several stale minors.
3. **YAGNI / dead machinery** — `getArtistTtl()` returns a constant while dragging a 3-map membership-cache layer plus redundant Firestore reads; dead callbacks/params/options sprinkled through use cases; a dead debug flag and a dead env var.
4. **Duplication & consistency debt** — `isPlainObject` ×4, discogs-URL normalization ×3, legacy `discogsUrls` casts ×3, `getPrimaryArtistId` ×2, v1/v2 route files copy-pasted, 2-space vs 4-space/double-vs-single quotes in `features/userSettings` + `infrastructure/firebase` + firebase stores, no formatter/linter config.
5. **Layering drift in `utils/helpers`** — several "helpers" call Firebase/MusicBrainz directly, inverting the layering the features/ports design intends.

The plan is phased so every step is independently verifiable with `npm run verify` (+ `npm run test:integration` where relevant). Phases 0–2 are the high-value, low-risk core. Phases 3–5 are quality-of-life and can be deferred.

---

## 2. Findings

Severity legend: 🔴 bug (behavior wrong), 🟠 robustness/risk, 🟡 design/quality (YAGNI/KISS/SRP), 🔵 cosmetic/docs.

### 2.1 Correctness bugs

| # | Sev | Finding | Location |
|---|-----|---------|----------|
| B1 | 🔴 | **Stale reads after writes via `requestDeduper`.** `recentResults` caches `getFollowing:${userId}` (and per-artist detail/release reads) for 60 s, but no write path invalidates it. After `followArtist` / `unfollowArtists` the client can receive the *old* following list for up to 60 s. Writes correctly bypass dedupe; the *read cache* is never invalidated. | `src/common/request/requestDeduper.ts`, write flows in `features/artists`, `features/releases` |
| B2 | 🔴 | **Error logs lose `requestId`.** When a handler throws, `asyncHandler` calls `next(error)` *after* `runHttpRequestScope` rejected — i.e. outside the `AsyncLocalStorage` scope. `errorMiddleware` therefore logs 5xxs without `requestId`/context correlation (it only has method/path). | `src/common/http/handlers.ts`, `requestScope.ts`, `errorMiddleware.ts` |
| B3 | 🔴 | **Unconsumed HTTP response bodies.** `fetchDaprProvider` returns `null`/failure-marker for non-OK responses without draining `response.body`; `readExpoData`-style consumers elsewhere also bail on `!ok`. Under sustained provider errors this pins undici sockets until GC → connection-pool exhaustion. Fix: `await response.body?.cancel()` (or `.text()` drain) on every non-consumed path. | `src/services/musicApi/httpClient.ts` (also `expoPushClient.ts` error path) |
| B4 | 🔴 | **Possible infinite loop in MB pagination.** `fetchAllReleasesForArtist` / `fetchAllReleasesForReleaseGroup` loop while `nextOffset >= releasesData['release-count']` is false. If MusicBrainz ever omits `release-count`, the comparison is `number >= undefined` → always false → unbounded loop hammering the rate-limited API. `fetchAllReleaseIdsForArtist` already has the defensive `releases.length === 0` break — apply the same guard everywhere. | `src/services/musicbrainz/releaseQueries.ts` |
| B5 | 🔴 | **Infra failures mapped to 400 + internal messages leaked.** `sendOtp`/`verifyOtp`/`revokeToken`/`changeEmail` catch *everything* and rethrow as `Error(message)`; the auth use case then wraps *everything* in `BadRequestError`. A transient Firestore outage → client sees 400 "…"; a corrupt doc (`resetData.expiresAt.toDate is not a function`) leaks a TypeError string to the client. Need typed errors: known account errors → 4xx, unknown → 500 ( HttpError default). | `src/services/account/*`, `src/features/auth/usecases/authUseCases.ts` |
| B6 | 🟠 | **Notification failures fail already-committed writes.** `followArtist`, `unfollowArtists`, `removeNewReleases`, `updateReleaseNotificationSettings` all `await` a push notification *after* persisting. If Expo/Dapr hiccups, the client gets a 500 even though the follow/delete succeeded (and will retry, double-sending). Decide: make data notifications best-effort (log-and-continue) — recommended — or document the current contract. | `sendDataOnlyNotification` callers |
| B7 | 🟠 | **Floating promise in `notifyNewReleasesHandler`.** `notificationUseCases.notifyNewReleases();` is intentional fire-and-forget but has no `.catch`; failures surface as `unhandledRejection` without endpoint context. Make it explicit: `void …catch(...)` + comment. | `src/features/notifications/notificationHandlers.ts` |
| B8 | 🟠 | **Dead/misleading env var.** `ARTIST_PROFILE_IMAGE_REFRESH_TTL_MS` is set in both `.env.local.example` and `.env.prod.example` but parsed nowhere. Remove from examples (or wire it — removal is the YAGNI choice since artist-image freshness is governed by `TRANSIENT_REMOTE_VALUE_RETRY_WINDOW_MS`). | `.env.*.example`, `src/config/runtimeConfig.ts` |
| B9 | 🔵 | `chunkArray(items, size<=0)` silently returns `[items]`; should throw (a bad limit is a programming error). | `src/common/utils/array.ts` |
| B10 | 🔵 | `GET /revokeToken` mutates auth state over GET (prefetch/cache hazards). v1 compat — keep the GET, optionally accept POST too; document. | `src/features/auth/authRoutes.ts` |
| B11 | 🔵 | `requireStringArray` has no length cap; a 5 MB body of ids drives N sequential Firestore ops in `unfollowArtists`. Cap (e.g. ≤ 500 ids). | `src/common/http/validation.ts` |
| B12 | 🔵 | `res.json('OTP sent successfully')` (returns JSON-quoted string) vs `res.send(...)` everywhere else. Standardize on `send`. | `src/features/auth/authHandlers.ts` |

### 2.2 YAGNI / dead machinery

| # | Sev | Finding | Location |
|---|-----|---------|----------|
| Y1 | 🟡 | **`getArtistTtl()` always returns a constant.** It ignores `_artistId` and returns `artistCacheTtlHours`, yet drags: `followingMembershipCache`, `followingMembershipLoads`, `followingMembershipLoadTokens`, `syncFollowingArtistIds`/`invalidateFollowingArtistIdsCache` plumbing spread across 6 files — plus a **redundant Firestore read** on every cold `getArtistDetails`/`getArtistReleases`/`followArtist`/new-release-processing call. Two options: (a) **simplify to the constant** (behavior-preserving, removes ~100 lines + wasted reads) — recommended now; (b) implement the *intended* semantics (followed → long TTL, unfollowed → transient) as a separate deliberate change, since it changes cache lifetimes and interacts with `followArtist`'s pre-save TTL lookup. | `src/utils/helpers/followingHelper.ts` + call sites |
| Y2 | 🟡 | Dead callback: `getArtistReleases` passes `async () => { }` to the catalog gateway; entries are built from the result afterwards. Remove the parameter from the adapter call chain (keep port if genuinely used elsewhere — it isn't except by legacy planner flows via `onReleaseGroupPage` caching… verify, then prune). | `src/features/releases/usecases/getArtistReleases.ts` |
| Y3 | 🟡 | Dead params: `useCache` on `getArtistReleases` (adapter always passes `true`); `getArtistReleasesForProcessing(artistId, _useCache, _ttl)` ignores 2 of 3 params; `ttl: number \| undefined = undefined` no-op variable in `getReleaseGroupReleases`. | `cachedReleaseCatalog.ts`, `newReleaseDetection.ts`, `getReleaseGroupReleases.ts` |
| Y4 | 🟡 | `updateArtistCacheIfExists(…, _options)` — the only option (`deferNewReleaseImageFetch`) is never used. Drop the options bag. | `src/utils/helpers/cacheUpdateHelpers.ts` |
| Y5 | 🟡 | `ARTIST_PROFILE_IMAGE_DETAIL_LOGS_ENABLED = false` — dead debug branch (~40 lines) inside a 310-line function. Remove or wire to config. | `artistProfileImageTaskWorker.ts` |
| Y6 | 🟡 | `logger.shouldLog(scope, level)` ignores `scope` (`void scope`). Either support scoped levels (`LOG_LEVEL=debug:http.*`) or drop the param. | `src/common/logging/logger.ts` |
| Y7 | 🔵 | `cacheManagementHelpers.deleteNewReleases` is a 1-line pass-through to `removeNewReleasesFromDb` — import directly in the adapter. Same for trivial pass-throughs in `pushTokenDependencies`. | `cacheManagementHelpers.ts`, `pushTokenDependencies.ts` |
| Y8 | 🔵 | `coverArtArchiveClient.getPublicCoverArtUrl` builds the host with `['coverartarchive','org'].join('.')` — obfuscation; use the literal. | `coverArtArchiveClient.ts` |

### 2.3 Duplication & inconsistency

| # | Sev | Finding | Location |
|---|-----|---------|----------|
| D1 | 🟡 | `isPlainObject` implemented 4× (`services/firebase/utils.ts`, `tasks/taskResultSerialization.ts`, `utils/helpers/artistSearchHelpers.ts`, + inline record checks). One canonical in `common/utils`. | see list |
| D2 | 🟡 | Discogs-URL normalization 3×: `profileImageLookups.normalizeDiscogsUrls`, `backgroundTaskMappers.normalizeDiscogsUrls`, plus ad-hoc filters in `artistProfileImageCacheSync` and `artistDetailsService`. And `isRemoteValueState` 2× (`coverArtLookup`, `backgroundTaskMappers`). Consolidate. | see list |
| D3 | 🟡 | **Legacy `discogsUrls` field handled via casts in 3+ files** (`as Artist & { discogsUrls?: unknown }`). The in-repo `FollowedArtistSummary` type doesn't declare the field, yet `getFollowedArtistSummary` mutates it onto summaries through a cast. Formalize: add optional `discogsUrls?: string[]` to `FollowedArtistSummary` (`src/utils/types`, not the submodule) or introduce a `ProfileImageLookupSource` type; then delete the casts. | `artistDetailsService.ts`, `followingStore.stripDiscogsUrls`, worker, cacheSync |
| D4 | 🟡 | `getPrimaryArtistId` exists twice (mapper default + `releaseQueries` export used by `releaseLookup`). Keep the mapper's, import it. | `musicbrainzMapper.ts`, `releaseQueries.ts` |
| D5 | 🟡 | **v1/v2 route files are copy-paste** except the planner variant. One factory: `createApiRoutes(prefix, { artistUseCases, releaseUseCases, presenters })`. Also collapse the double import lines from `useCaseVariants.js`. | `src/api/v1Routes.ts`, `v2Routes.ts` |
| D6 | 🟡 | **Formatting chaos:** `features/userSettings/**`, `infrastructure/firebase/firebaseInit.ts`, `services/firebase/**`, `services/monitoring/mapsDocSizeMonitor.ts` use 2-space + double quotes; rest is 4-space/single. No prettier/eslint configs exist. Add Prettier (4-space, single quotes, 100-col to match) + format-only commit; optionally typescript-eslint with a small rule set + `npm run lint`. | repo-wide |
| D7 | 🔵 | Error-wrapping anti-pattern: `throw new Error(\`Failed to fetch releases: ${error}\`)` stringifies errors (stack lost) in `fetchAndCacheArtistReleases`, `getNewReleases`, `getRelease`, `artistSearchHelpers.search`. Either drop the wrapper (let the original error propagate) or use `{ cause }`. | see list |
| D8 | 🔵 | `optionalPositiveInteger` accepts 0 → rename `optionalNonNegativeInteger` (it's used for `offset`). | `common/http/validation.ts` |
| D9 | 🔵 | `processArtistReleases` → `handleReleaseChanges` passes 9 params, and `eligibleNewReleases` is a pure alias of `artistNewReleases`. Group into a result object, drop the alias. | `utils/helpers/newReleaseHelpers.ts` |
| D10 | 🔵 | OTP email renders the code twice in one HTML body (styled block + `<pre>`); no plain-text part. Tidy. | `services/emailService.ts` |
| D11 | ✅ **Done (Phase 3)** — `test/integration/**` were offline route tests with fakes; real integration tests live in `test/emulator/**`. Renamed to `test/routes/**`, kept `test/emulator`, added `test:emulator` as an alias of the existing `test:integration` script, updated README references. | `test/`, `package.json` scripts |

### 2.4 Architecture / structure

| # | Sev | Finding | Location |
|---|-----|---------|----------|
| A1 | 🟡 | **`utils/helpers` is a junk drawer that inverts layering.** `followingHelper` (utils) imports `services/firebase/followingStore`; `cacheManagementHelpers` performs Firestore deletes; `artistSearchHelpers` is a MusicBrainz client; `releaseProcessingHelpers` mixes domain math with Firestore reads. These belong in `services/**` (gateway impls) or `features/*/infrastructure` adapters; `utils/` should be pure/domain-only. This is a *move-only* refactor; no logic changes. | `src/utils/helpers/*` |
| A2 | 🟡 | **Queueing a task traverses 4 layers** (`features/releases/infrastructure/releaseTaskQueue` → `services/backgroundTaskWorkers` → `services/taskService` → `services/tasks/*`). `taskService.ts` is a pure pass-through singleton; merge it into the runtime module or export the runtime directly. Optional, medium risk — do last. | `services/taskService.ts` |
| A3 | 🟡 | `artistProfileImageTaskWorker.fetchAndUpsertArtistProfileImages` is a ~180-line function with ~20 local mutable counters/flags. Split into: resolve-from-cache, lookup-bypass (name+discogs), MusicBrainz fetch, Discogs resolve — each returning a typed outcome; keep batch counters in the outer loop. SRP + testability. | `services/tasks/workers/artistProfileImageTaskWorker.ts` |
| A4 | 🟠 | **No graceful shutdown.** SIGTERM (docker stop) kills in-flight requests and background tasks instantly; Sentry never flushes on the way out. Add `SIGTERM`/`SIGINT` handler: `server.close()` + drain timeout + `flushErrorMonitoring()`; also handle `listen` errors. In-memory task results are lost on restart regardless (clients re-queue via 'missing') — document that. | `src/server.ts` |
| A5 | 🔵 | Unversioned compat alias mounts the whole v1 API twice (`routes.ts`). Client (`PawifyApp`) always sends a `vN` prefix (derived from app major), so the alias serves only ancient builds. Keep for now, add a comment + deprecation note; revisit after enough releases. | `src/routes.ts` |
| A6 | 🔵 | `getDocumentRefAndSnapshot` creates an empty user doc as a *read* side effect (any settings read auto-creates the doc). Harmless but surprising; document or split ensure-exists from read. | `services/firebase/userStore.ts` |
| A7 | 🔵 | README documents only `/v1`; the `/v2` cache-first contract (immediate `profileImages`/`releaseCovers`/`trackLyrics` maps, nullable task ids) is undocumented outside commit messages. Add a section; also update the project-layout section after the test rename. | `README.md` |
| A8 | 🔵 | `plans/test-refactoring-plan*.md` are historical; mark the v2 plan superseded by this file (or move both to `plans/archive/`). | `plans/` |

### 2.5 Things reviewed and deliberately **not** flagged as problems

- `routes.ts` double-mount, presenter identity functions in v2, `withTaskKeyNamespace` v1/v2 task isolation — intentional versioning design, working as built.
- `sourcePushToken` inside notification *payloads* (`userSettingsDependencies`) — looks like a leak, but `PawifyApp/src/services/eventService.ts` reads it to suppress self-originated echoes across devices. Intentional contract; add a comment so future readers don't "fix" it.
- Redis delete-then-write in `cacheService.setCachedData` — necessary for chunk cleanup; racy window is acceptable; add a comment.
- `overrides.uuid` — added to dedupe modern uuid; see npm section because it's currently *broken*.
- In-memory background-task registry + 60–90 s retention — by design, matches client polling contract.
- Emulator bootstrapping in `firebaseInit` and import-time side effects — testable via the existing fakes; a full composition-root/DI rewrite is not worth the churn now.

---

## 3. npm issues (fix all of these during the refactor)

Current state: **11 vulnerabilities (4 high, 7 moderate)**, `npm ls` exits with **ELSPROBLEMS**, dev tooling inconsistent.

**Phase 0 executed 2026-08-20 — final state: `npm audit` reports 0 vulnerabilities, `npm ls` exits 0, all rows below done.**

| # | Issue | Fix |
|---|-------|-----|
| N1 | ✅ **Done** — `npm audit fix` (no `--force`) resolved the 4 high findings; remaining moderates were then addressed via the N2/N3 overrides. Final: `npm audit` → 0 vulnerabilities. | `npm audit fix` → verify lockfile diff only bumps those ranges → `npm run verify` + `npm run test:integration` (exercises firebase-tools emulators). |
| N2 | ✅ **Done — fixed via override, NOT accepted.** `overrides: {"@opentelemetry/core": "^2.8.0"}` was tried; `npm ls` exits 0 and `npm run verify` passes (443/443), so the override was **kept** (all `@opentelemetry/core` instances dedupe to 2.10.0, including `@google-cloud/pubsub`'s, which declared `^1.30.1`). No residual advisory. | Bump `firebase-tools` to latest first (`15.24.0 → 15.28.1`) and re-audit. If still flagged (it was, for `>=14.24.0`): it is **dev-only** (emulator runner, never shipped in the runtime image — Dockerfile installs `--omit=dev`), so accept + document in this file, or optionally try `overrides: {"@google-cloud/pubsub": {"@opentelemetry/core": "^2.8.0"}}` and validate emulators. Prefer accept+document if the override fights back. |
| N3 | ✅ **Done** — global `overrides: {"uuid": "^11.1.1"}` removed (it made `universal-analytics`' nested `uuid@14.0.0` invalid → ELSPROBLEMS). Clean reinstall (`rm -rf node_modules && npm install`). Old uuid majors reappeared (9.0.1 via gaxios/teeny-request, vulnerable per GHSA-w5hq-g745-h8pq), so a **minimal scoped override** was reintroduced: `{"gaxios": {"uuid": "^11.1.1"}, "teeny-request": {"uuid": "^11.1.1"}}` with an explanatory `_comment` in `package.json`. `npm ls` exits 0; `universal-analytics` keeps its own `uuid@14.0.0`. | Try removing the override entirely and checking the resulting tree (modern firebase-tools may dedupe cleanly); if old uuid majors reappear and matter, scope the override to the offending package instead of globally. Regenerate the lockfile (`rm -rf node_modules && npm install`) and require `npm ls` to exit clean. Add a comment in `package.json` stating why any override remains. |
| N4 | ✅ **Done** — `npm update @sentry/node firebase-admin firebase-tools @types/express @types/node typescript` → `@sentry/node 10.70.0`, `firebase-admin 14.3.0`, `firebase-tools 15.28.1`, `@types/express 5.0.6`, `@types/node 22.20.1` (stays 22.x), `typescript 5.9.3`. `npm run verify` green. No express 4→5 or typescript 7 jumps. | `npm update` for these ranges; full `verify` after. Do **not** jump express 4→5 or typescript 7 here. |
| N5 | ✅ **Done** — `docker-compose.dev.yml` pawify service command changed from `npx tsx watch src/index.ts` to `npm run dev` (ts-node is the single dev runner; `tsx` is no longer pulled unpinned at container start). | Standardize: either pin `tsx` as a devDependency and use it in both, or change the compose command to `npm run dev` (ts-node). Recommend the compose→`npm run dev` route (fewer deps); keep `ts-node` as the single dev runner. |
| N6 | Docs-only — out of scope for this phase (README note still to be added in a later phase). | `npm pkg get engines` fine (node 22 vs local 22.15 OK). Keep `build` running tests before emit (CI contract), but note in README that plain `npm run build` needs Java + firebase-tools (emulator integration test). |

**Acceptance for the npm phase:** `npm audit` → **0 vulnerabilities** (the `@opentelemetry/core` dev-only finding was fixed via override rather than accepted — see N2); `npm ls` exits 0; `npm run verify` green (443/443); `npm run test:integration` green.

---

## 4. Implementation plan (ordered phases)

Each phase = one or more commits, each followed by `npm run verify` (typecheck + unit tests) and, for phases touching task/firebase/dapr code, `npm run test:integration`. Tests that reference renamed/moved symbols get updated in the same commit as the change. `src/modules` is never touched.

### Phase 0 — Tooling & npm baseline (no behavior change)
1. Add `.prettierrc` (4-space, single quotes, width 100, trailing commas) + `.prettierignore` (`lib*`, `node_modules`, `src/modules`, `package-lock.json`); `format`/`format:check` scripts. Run one **format-only commit** (this normalizes the 2-space files and double-quote files).
2. Optional but recommended: `eslint` + `typescript-eslint` (strict-type-checked subset, no style rules — Prettier owns style) + `lint` script wired into `verify`.
3. Execute npm fixes N1–N5 (commands in §3), regenerate lockfile cleanly, document the accepted dev-only advisory in this file.
4. Standardize dev runner (N5) and remove the dead env var from examples (B8).

### Phase 1 — Correctness bug fixes (small, individually testable)
1. **B1** — add `invalidate(prefixOrPredicate)` to `RequestDeduper` (also clear matching in-flight expectations); call it from the write flows that already invalidate the following-membership cache (`followArtist`, `unfollowArtists`, `deleteUserAccount`, `removeNewReleases`, `updateReleaseNotificationSettings`) for keys `getFollowing:`, `getArtistDetails:`, `getArtistReleases:`, `getNewReleases:` scoped by userId. Unit tests in `requestDeduper.test.ts` + use-case tests asserting invalidation is called.
2. **B2** — move completion/failure logging inside `runHttpRequestScope` (catch → log-with-context → rethrow), or capture `requestId` into `res.locals` and merge it in `errorMiddleware`. Assert via existing `errorMiddleware`/`asyncHandler` tests + one new test asserting error logs carry the requestId.
3. **B3** — drain/cancel bodies on every non-consumed response path in `fetchDaprProvider` and `readExpoData`. Unit-test with a fake `fetch` returning an unconsumed-body response and assert `cancel` was called.
4. **B4** — add empty-page/missing-count break guards to both unguarded paginators; table-test with a missing `release-count` fixture.
5. **B5** — introduce typed account errors (`ACCOUNT_*` error codes or small error classes) in `services/account`; map *known* messages → 4xx, everything else → untouched (→500 via `toHttpError`). Adjust `mapAccountError` to stop string-matching and stop re-wrapping unknowns as `BadRequestError`. Update `authUseCases`/`passwordResetOtpService` tests.
6. **B6** — decision + implement: wrap `notify*Changed` calls in best-effort (log warn, don't fail request). Keep `updateReleaseNotificationSettings` notifications best-effort too. Update use-case tests that currently assert propagation.
7. **B7** — `void … .catch(...)` with debug log on the trigger endpoint.
8. **B9/B11/B12** — `chunkArray` throw; cap `requireStringArray` (500); `res.send` for OTP response.

### Phase 2 — Dead machinery removal (behavior-preserving)
1. **Y1** — replace `getArtistTtl` with the constant (`artistCacheTtlHours`), delete the membership-cache machinery + `syncFollowingArtistIds`/`invalidate` plumbing and their call sites; adapters return the constant. (This *removes* a redundant Firestore read per cold request — intended, call it out in the commit message.) Note in code where a future membership-based TTL would plug in.
2. **Y2/Y3/Y4** — remove dead callbacks/params/options (`async () => {}`, `useCache`, `_ttl`/`_useCache`, options bag on `updateArtistCacheIfExists`, `const ttl = undefined`).
3. **Y5** — delete the dead detail-log branch in the profile-image worker (or wire to `LOG_LEVEL=debug` if that's preferred — pick one, don't keep a hardcoded false).
4. **Y6** — simplify `shouldLog` signature.
5. **Y7/Y8** — pass-through + obfuscation cleanups.

### Phase 3 — Duplication & consistency
1. **D1/D2/D4** — consolidate `isPlainObject`, `isRemoteValueState`, discogs-URL normalization, `getPrimaryArtistId` into single homes (`common/utils`, `services/musicApi` or the mapper).
2. **D3** — declare `discogsUrls?: string[]` on the in-repo `FollowedArtistSummary` (or a dedicated lookup type), delete the `as … & { discogsUrls?: unknown }` casts and `stripDiscogsUrls` workaround (keep strip only if the DB write must exclude the field — verify against `followingStore`, then decide: likely keep one normalize-at-the-boundary function instead).
3. **D5** — `createApiRoutes(prefix, variants)` factory; `v1Routes`/`v2Routes` become 3-liners.
4. **D7/D8/D9/D10** — error-`cause` or unwrapping; rename validation helper; `handleReleaseChanges` parameter object + alias removal; email template tidy.
5. **D11** — ✅ done: `test/integration` → `test/routes` (git mv), `test:integration` keeps its name, `test:emulator` alias added, README updated.

### Phase 4 — Structure moves (move-only, verified by typecheck + tests)
1. **A1** — relocate: `artistSearchHelpers` → `services/musicbrainz/artistSearch.ts`; `cacheManagementHelpers` → `services/firebase/` (or fold into `followingStore`/adapters); `followingHelper` remnants (TTL constants + `getReleaseLyricsTtl`) → `services/cache/ttlPolicy.ts`; `releaseProcessingHelpers`' pure parts → `features/releases/domain`, DB-touching parts → adapters. Update importers + tests. No logic edits.
2. **A3** — split the profile-image worker into steps (this is the one Phase-4 item with real edits; do it behind the existing worker tests, add coverage for each extracted step's outcome typing).
3. **A4** — graceful shutdown in `server.ts` (SIGTERM/SIGINT: stop accepting → close with 10 s drain → flush Sentry → exit; handle `listen` errors).
4. **A5–A8** — compat-alias comment, `getDocumentRefAndSnapshot` doc comment, README `/v2` + layout + build-prereq docs, archive old plans.

### Phase 5 — Optional / deferred (explicit non-goals for this pass)
- **A2** collapsing the task-queueing indirection (`taskService` pass-through) — worthwhile but touches many importers; schedule separately.
- Membership-based TTL semantics (see Y1 option b).
- `express` 5 / `typescript` 7 / `@types/node` 26 upgrades — separate effort after `engines` moves.
- Persistence of background-task results across restarts (client already tolerates re-queueing).
- Replacing `ts-node` with native node type stripping (blocked by `.js`→`.ts` import specifiers; a module-resolution change is not worth it now).

---

## 5. Explicit decisions needed from the owner (defaults chosen above)

| Decision | Default in this plan |
|---|---|
| Best-effort notifications after writes (B6) | Yes — don't fail committed writes on push failures |
| `getArtistTtl` fate (Y1) | Simplify to constant now; membership-based TTL as a future, deliberate change |
| Keep unversioned v1 alias (A5) | Keep + document; remove after old app builds age out |
| Dev-only `@opentelemetry/core` advisory (N2) | Accept + document unless an override validates cleanly |
| Formatter/linter introduction (D6) | Prettier yes; eslint recommended but can be skipped |

## 6. Validation checklist (run after every phase)

- [ ] `npm run verify` (typecheck + 443 unit/route tests)
- [ ] `npm run test:integration` (firebase emulators — exercises firebase-tools + account flows)
- [ ] `npm ls` exits 0 (no ELSPROBLEMS)
- [ ] `npm audit` clean or only the documented dev-only advisory
- [ ] `npm run build:unchecked` still emits; Docker dev compose boots (`docker compose -f docker-compose.dev.yml up` smoke test) where phase touches runtime entry (`server.ts`, compose, deps)
- [ ] `git status` — no changes under `src/modules`

---

## 7. Implementation status

Implemented 2026-08-20 across the phase commits below (oldest → newest):

| Commit | Phase | Items |
|---|---|---|
| `a4075be` chore: add prettier and format codebase | 0 | Prettier config + format-only commit (D6); `format`/`format:check` scripts |
| `afa5141` chore(deps): fix npm audit findings, repair uuid override, bump minors | 0 | N1–N5 (audit clean, scoped uuid override + `_comment`, dependency bumps, dev compose runner → `npm run dev`); B8 dead env var removed from examples |
| `a5e5b9d` fix: dedupe cache invalidation, request ids in error logs, drained response bodies, pagination guards | 1 | B1, B2, B3, B4 |
| `cb0d358` fix: typed auth errors, best-effort change notifications, validation hardening | 1 | B5, B6 (decision applied: notifications best-effort), B7, B9, B11, B12 |
| `145428d` refactor: remove dead ttl membership machinery and unused parameters | 2 | Y1, Y2, Y3, Y4, Y5, Y6, Y7, Y8 |
| `f0b12f5` refactor: consolidate duplicates, typed discogs urls, api route factory, test dir rename | 3 | D1, D2, D3, D4, D5, D7, D8, D9, D10, D11 |
| `e67a7c9` refactor: relocate helpers to proper layers, split profile-image worker | 4 | A1, A3 |
| this commit — feat: graceful shutdown, docs for v2 contract, plan archive | 4 | A4, A5, A6, A7, A8; N6 (README Java/build note) |

**Skips and deviations reported by implementers:**

- **B10** (`GET /revokeToken` mutating auth state over GET) was kept exactly as-is. The plan marked POST + documentation as *optional* ("v1 compat — keep the GET, optionally accept POST too; document") and no phase listed it, so it was not addressed. Revisit if prefetch/cache hazards materialize.
- **A2** (collapse the task-queueing indirection) and **membership-based TTL** semantics (Y1 option b) remain deferred — both are explicit Phase 5 non-goals for this pass.
- **N6** was docs-only and deliberately deferred to this commit; the README now notes that `npm run build` and `npm run test:integration` require Java (Firebase emulators) and that the dev compose stack runs `npm run dev`.

**Final npm state (re-checked 2026-08-20):** `npm audit` → **0 vulnerabilities**; `npm ls` → **exits 0** (no ELSPROBLEMS).

**Final validation state:** `npm run verify` green (**488/488** tests — the suite grew from the 443 baseline as tests were added in Phases 1–3); `npm run test:integration` green (**11/11** emulator tests); `git status` clean of any `src/modules` changes.
