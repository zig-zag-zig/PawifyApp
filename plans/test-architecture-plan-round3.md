# PawifyApp — Freshened Test Architecture Plan (Round 3)

> **Baseline**: 58 test files, 508 tests, all passing. Modules excluded per git-submodule constraint.

## 1. Current State (Post-Round-2)

### 1.1 Coverage by Layer

| Layer | Files with tests | Files without tests | Status |
|---|---|---|---|
| **Config** | envParsing, firebaseEmulator | env.ts (exports only) | ✅ Good |
| **Services** | 12/16 | useFileCacheMaintenance, sentry, notificationEventParsing*, notificationEvents* | 🟡 Partial |
| **Hooks** | 7/11 | useAnimatedDelete, useApiClient, useContentReady, useNotificationService | 🟡 Good |
| **Contexts** | 3/3 | — | ✅ Complete |
| **Utils** | 6/6 | — | ✅ Complete |
| **Domain (artist)** | 5/5 | — | ✅ Complete |
| **Domain (release)** | 3/3 | — | ✅ Complete |
| **Domain (search)** | 1/1 | — | ✅ Complete |
| **Domain (updates)** | 2/2 | — | ✅ Complete |
| **Domain (auth)** | 2/2 | — | ✅ Complete |
| **State (artist)** | 1/1 (22 tests) | — | ✅ Complete |
| **State (release)** | 2/2 | — | 🟡 Thin (3-5 tests each) |
| **State (search)** | 1/1 | — | 🟡 Thin (2 tests) |
| **Components** | 0/~40 | All untested | 🔴 Critical gap |
| **Navigation** | 0/5 | All untested | 🟡 Low priority |
| **E2E (Maestro)** | 4 flows | — | 🟡 Adequate but expandable |

*Partially tested: parsing functions tested, event registration/storage not directly tested.

### 1.2 Test Quality Assessment

**Strengths:**
- Pure functions (parsers, formatters, reducers) have thorough edge case coverage
- Service tests use realistic mock patterns with fake timers when needed
- Context tests validate provider boundaries (missing-provider throws)
- Hook tests use `renderHook` + `act` idiomatically
- Shared test infrastructure (`src/test/`) exists and is usable

**Weaknesses:**
- Multiple test files with only 1 test (paginateReleases, sortArtists, validateAuthCredentials) — acceptable but expandable
- ~8 test files still use `vi.mock('../../utils/diagnostics')` duplicating mock code
- `eventService.test.ts` and `taskResultCache.test.ts` use `vi.resetModules()` + dynamic import instead of `resetForTesting()` methods that already exist
- No snapshot tests — fine for a React Native app where snapshots are fragile
- No integration tests crossing module boundaries
- Coverage thresholds are low (60/50/55/60) — the codebase now exceeds these

### 1.3 E2E Assessment

| Flow | File | Coverage |
|---|---|---|
| Smoke (login screen) | [`smoke.yaml`](.maestro/smoke.yaml) | ✅ Auth UI |
| Invalid login | [`invalid-login.yaml`](.maestro/invalid-login.yaml) | ✅ Error handling |
| Sign-up + browse | [`logged-in-happy-path.yaml`](.maestro/logged-in-happy-path.yaml) | ✅ Happy path |
| Music workflow | [`music-workflow.yaml`](.maestro/music-workflow.yaml) | ✅ Search, artist, follow |
| Offline behavior | — | ❌ Missing |
| Deep linking | — | ❌ Missing |
| Update flow | — | ❌ Missing |

---

## 2. Proposed Changes

### 2.1 High-Priority — Expand Thin State/Domain Tests

#### A. Expand [`searchReducer.test.ts`](src/features/search/state/searchReducer.ts)
Currently 2 tests. The reducer has ~12 action types. Add tests for:
- searchStarted (isAppending=true/false)
- searchSucceeded
- searchFailed
- queryChanged
- searchTaskCreated / searchTaskCleared
- preserveStateChanged
- resetForBlur
- canLoadMore edge cases
- initial state validation

**Effort**: Low. Pure reducer, no dependencies.

#### B. Expand [`releaseReducer.test.ts`](src/features/release/state/releaseReducer.ts)
Currently 3 tests. Add tests for remaining actions:
- Release load started/succeeded/failed
- Lyrics load started/succeeded/failed
- Cover load started/succeeded/failed
- Release group load actions
- Error clear / reset

**Effort**: Low. Pure reducer.

#### C. Expand [`releaseGroupReleases.test.ts`](src/features/release/domain/releaseGroupReleases.ts)
Currently 3 tests. Add:
- Empty release list
- Single release
- Sorting by date/position
- Edge case: null dates

**Effort**: Low. Pure domain logic.

#### D. Expand [`paginateReleases.test.ts`](src/features/release/domain/paginateReleases.ts)
Currently 1 test. Add:
- First page
- Middle page
- Last page (no more)
- Single-item list
- Empty list

**Effort**: Low. Pure function.

#### E. Expand [`sortArtists.test.ts`](src/features/artists/domain/sortArtists.ts)
Currently 1 test. Add:
- Sort by name ascending
- Sort by name descending
- Empty list
- Same-name artists
- Case insensitivity

**Effort**: Low. Pure function.

#### F. Expand [`validateAuthCredentials.test.ts`](src/features/auth/domain/validateAuthCredentials.ts)
Currently 1 test. Add:
- Valid signup with matching passwords
- Valid signin with email+password
- Missing email
- Missing password
- Password mismatch for signup
- Invalid email format
- Short password

**Effort**: Low. Pure function.

### 2.2 Medium-Priority — New Domain/State Tests

#### G. [`releaseEnrichment.test.ts`](src/features/release/domain/releaseEnrichment.ts)
Already has 3 tests — verify coverage is adequate.

#### H. Test [`taskResultSubtasks.ts`](src/shared/taskResults/taskResultSubtasks.ts)
Currently 0 tests. 151 lines of recursive subtask fetching and merging logic. Key behaviors:
- No subtasks → returns task unchanged
- Cached subtask → skips fetch
- Non-terminal subtask without requireTerminal → skips
- Non-terminal subtask with requireTerminal → throws
- Failed subtask with requireTerminal → throws
- Completed subtask → merges result payload
- Recursive subtask fetching
- Seen/newly-fetched tracking

**Effort**: Medium. Requires mocking taskResultCache, taskResultPayload, diagnostics.

#### I. [`appUpdateModalStyles.test.ts`](src/features/updates/components/appUpdateModalStyles.ts)
Currently 0 tests. Styles file — low value but good for structural completeness.

### 2.3 Medium-Priority — Test Infrastructure Improvements

#### J. Raise coverage thresholds
Current: `statements: 60, branches: 50, functions: 55, lines: 60`
Proposed: `statements: 65, branches: 55, functions: 60, lines: 65`

**Rationale**: Codebase has grown and now comfortably exceeds current thresholds.

#### K. Consolidate diagnostic mocks
~8 test files duplicate `vi.mock('../../utils/diagnostics', () => ({...}))`. The shared `mockDiagnostics()` in [`src/test/mocks.ts`](src/test/mocks.ts) already exists. Refactor existing tests to use it.

**Files to update**: eventService.test.ts, taskResultCache.test.ts, cachedImageFileCache.test.ts, externalNavigation.test.ts, taskResultWaiter.test.ts, taskResultSignalWaiter.test.ts, useTaskManager.test.ts, appUpdateService.test.ts, notificationEvents.test.ts, apiClient.test.ts

#### L. Use `resetForTesting()` in existing tests
[`eventService.test.ts`](src/services/eventService.test.ts) uses `vi.resetModules()` + dynamic import. Switch to `EventService.resetForTesting()` for cleaner, faster tests. Same for [`taskResultCache.test.ts`](src/services/taskResultCache.test.ts).

#### M. Add test-coverage GitHub Actions check (optional CI)
Add a step to `verify` npm script or CI config that enforces coverage thresholds. Currently `npm run verify` runs `tsc --noEmit && npm test` — could add `vitest run --coverage` check.

### 2.4 Low-Priority — Component & Hook Tests

#### N. API hook tests
- [`useApiClient.test.ts`](src/hooks/useApiClient.ts) — Tests that it creates an ApiClient with correct config
- [`searchApi.test.ts`](src/features/search/api/searchApi.ts) — Tests that it calls apiClient.request correctly
- [`releaseApi.test.ts`](src/features/release/api/releaseApi.ts) — Tests API method mapping
- [`artistApi.test.ts`](src/features/artist/api/artistApi.ts) — Tests API method mapping

**Effort**: Low (each is a thin wrapper). These catch API contract drift.

#### O. [`useReleasePage.test.ts`](src/features/release/hooks/useReleasePage.ts) and [`useReleaseGroupPage.test.ts`](src/features/release/hooks/useReleaseGroupPage.ts)
These hooks are simpler than [`useArtistPage`](src/features/artist/hooks/useArtistPage.ts) and testable with fewer dependencies.

#### P. Container component tests
- [`SearchInput.test.tsx`](src/features/search/components/SearchInput.tsx) — Input handling, debounce, clear
- [`SongItem.test.tsx`](src/features/release/components/SongItem.tsx) — Rendering, external link press
- [`ReleaseItem.test.tsx`](src/features/release/components/ReleaseItem.tsx) — Rendering variants

**Effort**: Medium. Requires `@testing-library/react-native` or careful RN mock setup.

### 2.5 Low-Priority — E2E Additions

#### Q. Offline behavior flow (`.maestro/offline-behavior.yaml`)
- Enable airplane mode
- Verify cached content still renders
- Verify graceful error messaging

#### R. Deep link flow (`.maestro/deep-link.yaml`)
- Open deep link to artist page
- Verify artist loads
- Back navigation returns to search

#### S. Update notification flow (`.maestro/update-flow.yaml`)
- Mock GitHub release API
- Verify update modal appears
- Verify dismiss behavior

---

## 3. Structural Refactoring Opportunities

### 3.1 Mock Consolidation Pattern

Current state — multiple files duplicate:
```typescript
vi.mock('../../utils/diagnostics', () => ({
    describeError: vi.fn(() => ({})),
    diagnosticLog: vi.fn(),
    diagnosticWarn: vi.fn(),
    // ... 6 more lines
}));
```

Target state — use shared helper:
```typescript
import { mockDiagnostics } from '../test/mocks';
vi.mock('../utils/diagnostics', () => ({
    ...mockDiagnostics(),
}));
```

### 3.2 File Organization

No structural changes needed. The co-located test pattern (`foo.test.ts` next to [`foo.ts`](src/config/envParsing.ts)) is consistent and well-organized. The [`src/test/`](src/test/setup.ts) directory is cleanly separated for shared infrastructure.

### 3.3 Non-Test Structural Observations

No logic bugs found in the codebase review. Below are non-blocking observations:

| Observation | Recommendation |
|---|---|
| [`notificationEventParsing.ts`](src/services/notifications/notificationEventParsing.ts) exports `extractNotificationEventData` and `extractNotificationEventPayload` — names are very similar | Consider renaming to clarify which one parses raw notification vs event-struct data |
| [`externalNavigation.ts`](src/services/externalNavigation.ts) has `resetForTesting()` that's unused in its own test | Either use it in tests or remove it |
| Several reducer test files have identical factory functions (`createMockArtist`, etc.) | Move to [`src/test/factories.ts`](src/test/factories.ts) — factories already exist there |

### 3.4 Duplicated Test Helpers

The `createFetchResponse` helper appears in both [`apiClient.test.ts`](src/services/api/apiClient.test.ts) and [`appUpdateService.test.ts`](src/features/updates/services/appUpdateService.test.ts). Move to [`src/test/factories.ts`](src/test/factories.ts) (already exists there as [`createMockFetchResponse`](src/test/factories.ts)).

---

## 4. Implementation Order

```
Phase R3-1: Expand thin tests (A-F: searchReducer, releaseReducer, releaseGroupReleases, paginateReleases, sortArtists, validateAuthCredentials) — ~25 new tests
Phase R3-2: New domain test (H: taskResultSubtasks) — ~8 tests
Phase R3-3: Infrastructure improvements (J: raise coverage thresholds, K: consolidate diagnostic mocks, L: use resetForTesting) — 0 new tests, quality improvement
Phase R3-4: API hook tests (N: useApiClient, searchApi, releaseApi, artistApi) — ~12 tests
Phase R3-5: Release page hook tests (O: useReleasePage, useReleaseGroupPage) — ~12 tests
```

### What's NOT Included (Deferred)

| Item | Reason |
|---|---|
| Component render tests requiring JSX + RN styles | Requires `@testing-library/react-native` — separate infrastructure decision |
| [`useArtistPage.test.ts`](src/features/artist/hooks/useArtistPage.ts) | 247 lines, 8 collaborating hooks, 4 contexts — integration test level |
| [`useSearchPage.test.ts`](src/features/search/hooks/useSearchPage.ts) | 362 lines, complex task orchestration — integration test level |
| Navigation tests | NavigationContainer mocking requires full RN setup |
| [`useNotificationService.test.ts`](src/hooks/useNotificationService.ts) | Deep expo-notifications + TaskManager integration |
| [`firebaseAuth.test.ts`](src/firebase/firebaseAuth.ts) | Requires Firebase SDK mocking at an impractical level |
