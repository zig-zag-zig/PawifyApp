# Phase 0 — Inventory and freeze

Branch: `refactor/phase-0-inventory` (from `main` @ `a345bff`).
`src/modules` is out of scope.

## Secrets and debug junk

| Path | On disk | Git status |
|------|---------|------------|
| `.env.development` / `.env.production` | yes | ignored (`.env.*`, `!.env.example`) |
| `credentials.json` | yes (`0600`) | ignored |
| `.credentials/` | empty dir | ignored |
| `google-services.development.json` | yes | ignored (`google-services.*.json`) |
| `google-services.json` | yes | **tracked** — ignore rule needs a middle segment |
| `firestore-debug.log` / `database-debug.log` | yes | ignored (`*-debug.log`) |

Do not untrack or rotate `google-services.json` in this phase. It is a known leftover for a later secrets pass.

## Public contracts (do not change in Phase 0–1 without an explicit call)

### `useAuth`
`user`, `authCompleted`, `signUp`, `signIn`, `signInWithGoogle`, `linkGoogle`, `linkPassword`, `unlinkProvider`, `signOut(options?: { skipRemotePushTokenCleanup })`, `getAccessToken(forceRefresh?)`, `setLoginWithReauthenticateWithCredential`

### `useFollowing`
`followingArtists`, `isLoadingFollowing`, `hasLoadedFollowingOnce`, `pendingArtistImageIds`, `pendingEventUpdateRef`, `eventVersion`, `refreshFollowing()`, `setFollowedArtist(artist, isFollowing)`

### `useNewReleaseFeed`
`newReleases`, `isLoading`, `hasLoadedOnce`, `pendingEventUpdateRef`, `eventVersion`, `pendingReleaseCoverIds`, `removeNewReleases(ids)`, `ensureNewReleasesLoaded()`

### `useTaskManager`
Per-hook-instance queue. Surface: `tasks`, `addTask`, `removeTask`, `executeTask`, `removeAllTasks`.
`removeTask` does not abort in-flight promises.

### Routes
Auth: `SignIn`, `SignUp`, `ForgotPassword`, `ResetPassword`.
Main: `Home` tabs `Search`, `Artists`, `Releases`, `Menu`; stack `Artist`, `Release`, `ReleaseGroup`, `Security`.
Deep links today: `''` → Home, `releases` → Releases.

## Current behavior locked by characterization tests

These tests document today’s code, including bugs Phase 1 will fix.

### Following (`useFollowingController`)
- Optimistic `setFollowedArtist` updates the list immediately and stores an override.
- Overrides are applied to the next completed fetch, then **cleared**.
- A queued second fetch can restore a stale follow/unfollow (override already gone).
- `fetchArtists` depends on the `user` object, so a new object with the same `uid` retriggers `'user-change'`.
- Logout (`user` → `null`) clears the list and in-flight task bookkeeping.

### NewReleaseFeed (`useNewReleaseFeedController`)
- `ensureNewReleasesLoaded` fetches once until a successful load (or a failed first load resets the request flag).
- `removeNewReleases` is optimistic and rolls back + error-toasts on API failure.
- There is no remove overlay on the next `getNewReleases` result, so an in-flight/queued refetch can put a removed row back.
- `fetchNewReleases` depends on the `user` object (same identity pitfall as Following when a fetch is triggered).

## Exit
- [x] Secrets status known
- [x] Contracts written
- [x] Following characterization tests
- [x] NewReleaseFeed characterization tests
- [x] `npm run verify` baseline recorded: **typecheck clean, 70 files / 624 tests** (2026-08-20, includes 12 new characterization tests)

## Phase 1 status (2026-08-20, committed)

Bugs from the characterization section are FIXED; the tests now assert the fixed behavior:
- Following overrides are versioned and survive stale queued responses; `fetchArtists` depends on `userId`, not the `user` object. Pure policy in `features/artists/domain/followOverrides.ts`.
- NewReleaseFeed removals keep an overlay until a fetch that started after the remove API succeeded confirms them (`removedReleasesRef` + `removeVersionRef`); `fetchNewReleases` depends on `userId`.
- API client: `request` is JSON-strict (non-JSON 2xx → ApiCallError); text endpoints use `requestText`; `onAuthFailure` callback for hard token errors (network failures excluded).
- Auth: `getAccessToken` no longer signs out on failure (throws `AuthTokenError`); reauth gate is consumed-and-reset on every token change; `signOut` is re-entrancy guarded.
- Deep links: tabs + Artist/Release/Security/ResetPassword mapped; ReleaseGroup intentionally excluded.

Verify at Phase 1 close: **typecheck clean, 72 files / 637 tests**.

## Phases 2–5 status (2026-08-20, committed)

- **Phase 2 (auth internals + dumb navigator):** AuthContext is a thin provider shell; logic lives in `authSession` / `authToken` / `authCommands` / `pushTokenApi`. Startup update check extracted to `useStartupUpdateCheck`; AppProviders comments match the real graph.
- **Phase 3 (feature boundaries):** Menu → `features/menu/` (MenuPage), `useGoogleAuth` → `features/auth/hooks/`, dead `followingPort` deleted, feature APIs expose `waitForTaskResultById` directly. **Deferred:** artist-hook collapse (8 files, ~1900 lines, zero test coverage — merge deferred until characterization tests exist).
- **Phase 4 (shared UI + theme):** `SmartSelectableList` absorbed `SelectableAnimatedList` + `SelectableListManager`; `styles/theme.ts` tokens used by App.tsx + TabNavigator; `types/navigation.tsx` → `.ts`. **Deferred:** ScreenContainer bottom safe-area for stack pages (tab screens would double-pad; needs device check).
- **Phase 5 (tooling):** `@react-native-community/cli` pinned to 20.1.3 (was `latest`); `.jspace/` gitignored. `tests/dateUtil.test.ts` tests submodule code → left untouched; `app.config.js` composes `app.json` (not duplication) → kept.

Verify at Phase 5 close: **typecheck clean, 72 files / 637 tests**. Oracle reviews were quota-blocked (subagent token plan exhausted until 08-25); each phase was self-reviewed instead.
