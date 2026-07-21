# PawifyApp Architecture Refactor Plan

> **Goal:** Pure structural / architectural improvements. **No intentional behavior changes.**  
> **Baseline:** 559 unit tests passing (`npm test`), `npm run typecheck` must stay green.  
> **Gate rule:** After each phase → `npm run verify` → Oracle review → only then next phase.

---

## Guiding principles

1. **Behavior freeze** — public hooks/context contracts preserved (`useAuth`, `useFollowing`, `useNewReleaseFeed`, `useToast`, `useTaskManager` API surface, navigation routes).
2. **Incremental** — each phase is independently shippable and revertable.
3. **Tests first/around** — characterization tests when extracting fat modules; existing suite is the contract.
4. **One writer** — only worker agents edit code; Oracle is read-only review.
5. **Orchestrator** — parent synthesizes Oracle findings and either fixes via worker or proceeds.

---

## Phase overview

| Phase | Theme | Risk | Exit criteria |
|-------|--------|------|----------------|
| **0** | Plan + verification matrix (this doc) | — | Plan approved by execution |
| **1** | Safe cleanup & contracts | Low | Dead code gone, shared utils used, Toast moved, context guards, provider docs, verify green |
| **2** | Thin god modules | Medium | Following/NewReleaseFeed split; Menu sections; API wait helpers standardized; verify green |
| **3** | Task execution ownership | High | Shared task runtime + single NetInfo/AppState owner; consumers migrated; verify green |
| **4** | Dependency direction | Medium | Auth under features; following port; shared domain boundaries; verify green |
| **5** | Final polish | Low | Typing on list UI, style tokens note, knip config resolved, full verification + manual checklist |

---

## Phase 1 — Safe cleanup & contracts

### 1.1 Dead / orphan code
- [x] Confirm and remove `src/components/externalLinks/useExternalLinkPreview.ts` **or** wire it if intentionally unfinished → **remove** (no consumer).
- [x] Wire `deduplicateArtists` into `useSearchPage` **or** fold `appendUniqueArtists` into domain and delete duplicate → prefer: domain owns both helpers if needed; production uses domain.
- [x] Delete unused `src/test/factories.ts` **or** adopt in tests → prefer **adopt lightly** in 1–2 tests if easy, else delete to avoid noise. Decision: **delete** if zero imports (tests already use inline fixtures).
- [x] Fix `knip.json` (deleted in Phase 5 — knip was not a dependency).

### 1.2 Dedupe pure helpers
- [x] `FollowingContext` / `NewReleaseFeedContext` use `utils/arrays` (`mergeUniqueIds`, `removeIds`) instead of local copies.
- [x] Extract `src/utils/foregroundRefreshPolicy.ts`:
  - `DEFAULT_FOREGROUND_REFRESH_MIN_INACTIVE_MS = 5 * 60 * 1000`
  - `shouldRunForegroundRefresh(inactiveMs, minInactiveMs?)`
- [x] Use from Following, NewReleaseFeed, Auth token refresh.

### 1.3 Toast placement
- [x] Move `src/components/ToastContext.tsx` → `src/contexts/ToastContext.tsx`
- [x] Update all imports; optional re-export shim at old path for one phase then remove (prefer clean move + update imports in same PR).

### 1.4 Context hooks
- [x] `useFollowing` / `useNewReleaseFeed`: throw clear error if null (match Auth/Cache pattern) instead of `!`.

### 1.5 Provider documentation
- [x] Comment dependency graph in `AppProviders.tsx`.

### 1.6 Automated verification
- [x] `npm run verify`
- [x] Phase 1 unit tests for `foregroundRefreshPolicy` if new pure module.

**Oracle: APPROVE (568 tests green).**

---

## Phase 2 — Thin god modules & API surface

### 2.1 Task-result API gateway
- [ ] Add `waitForTaskResultById` (or equivalent) on `ApiClient` so feature APIs stop redefining `getTaskResult` + wrapper.
- [ ] Update `useArtistApi`, `useReleaseApi`, `useSearchApi`, artists/release contexts.

### 2.2 Expand feature APIs used by contexts
- [ ] `FollowingContext` uses `useArtistsApi` (or expanded following API methods) instead of raw `useApiClient` for getFollowing/wait.
- [ ] `NewReleaseFeedContext` uses `useReleaseApi` expanded with new-releases endpoints.

### 2.3 Split Following provider
Target files (behavior-identical public API):
```
features/artists/state/followingReducer.ts (if pure state extractable)
features/artists/hooks/useFollowingController.ts  # effects, tasks, events
features/artists/state/FollowingContext.tsx       # thin provider + useFollowing
```
Preserve: optimistic overrides, pending image IDs, eventVersion, pendingEventUpdateRef, setFollowedArtist, refreshFollowing.

### 2.4 Split NewReleaseFeed provider
Same pattern under `features/release/`.

### 2.5 Menu decomposition
```
components/menu/AccountSecuritySection.tsx (+ hook if needed)
components/menu/UpdateMenuSection.tsx
features/userSettings remains for notification card
Menu.tsx = composition only
```

### 2.6 Characterization tests
- [ ] Prefer pure extractions with unit tests for reducers/policies.
- [ ] Existing API tests updated for new client helpers.

### 2.7 Verify
- [x] `npm run verify` + Oracle

**Oracle: APPROVE after Menu overlay fix (overlays outside ScrollView). 573 tests at Phase 2 close.**

---

## Phase 3 — Task execution ownership

### 3.1 Design (implement without changing consumer-visible semantics)
```
src/services/tasks/taskQueue.ts          # pure queue ops if useful
src/services/tasks/taskRuntime.ts        # singleton/store: tasks, inFlight, policies
src/hooks/useTaskManager.ts              # thin React adapter over runtime (OR multi-instance store keyed by scope)
```

**Important product constraint:** Today there are **5 independent queues**. Changing to one global queue **can** change concurrency/replay behavior.

**Safe approach (preserve behavior):**
1. Extract `createTaskManagerStore()` factory (logic from current hook, no React).
2. `useTaskManager()` creates/uses a **per-hook-instance** store (same isolation as today) OR accepts optional `scopeId`.
3. Optionally later: single shared store for app-level queues only — **not required for P3 exit if isolation preserved**.
4. Centralize NetInfo/AppState **subscription helpers** to avoid N duplicate listeners when multiple instances exist (refcount single subscription that fans out) — **behavior: each instance still gets replay events**, fewer native listeners.

### 3.2 Cancellation / ownership documentation
- [ ] Document that `removeTask` does not abort promises (current behavior).
- [ ] Optional: ignore setState after unmount via generation token (must not change success paths).

### 3.3 Migrate call sites only if needed for new module paths; keep API:
`tasks`, `addTask`, `removeTask`, `executeTask`, `removeAllTasks`, `replayPolicy`.

### 3.4 Tests
- [ ] Port/expand `useTaskManager.test.ts` against store + hook.
- [ ] Multi-instance isolation test (two stores don't share tasks).

### 3.5 Verify + Oracle

---

## Phase 4 — Dependency direction

### 4.1 Auth provider location
- [ ] Move `src/contexts/AuthContext.tsx` (+ test) → `src/features/auth/state/AuthContext.tsx`
- [ ] Re-export from `src/contexts/AuthContext.tsx` for stable imports **or** update all imports.
- Prefer: **re-export barrel** during transition so churn is low.

### 4.2 Following port for artist page
- [ ] `features/artists/model/followingPort.ts` types
- [ ] Artist page depends on `useFollowing` still, but document as port; avoid importing other artists internals.

### 4.3 Cross-feature domain
- [ ] If artist imports `release/domain/releaseGroupReleases`, either keep (documented shared) or move to `shared/` only if both need it without feature coupling.

### 4.4 userSettings
- [ ] Keep as feature; Menu uses it as composition only (done in P2).

### 4.5 Verify + Oracle

---

## Phase 5 — Final polish

- [ ] GenericList / SmartSelectableList / SelectableAnimatedList: replace `any` with generics where safe.
- [ ] Resolve knip: remove config or add knip as devDep + `npm run knip` script.
- [ ] Style tokens: extract colors from `styles.tsx` only if zero visual risk (optional; skip if large).
- [ ] Full `npm run verify`, optional `npm run e2e:smoke` if device available.
- [ ] Update this plan checkboxes to done.
- [ ] Final Oracle pass on whole diff.

---

## Subagent workflow (orchestration)

| Role | When |
|------|------|
| **Scout** | Missing context before a large extraction |
| **Worker** | Implement a phase slice (one coherent PR-sized chunk) |
| **Oracle** | After each phase: approve/block + residual risks |
| **Orchestrator** | Plan, gate, re-delegate fixes, run verify |

After Oracle **block**: worker fix → re-verify → Oracle re-check before next phase.

---

## Rollback

Each phase should be one logical commit (if committing). Revert phase commit if Oracle finds behavior risk. Prefer feature flags only if task-runtime share mode is introduced (not planned for default).

---

## Success definition

- All automated tests that passed at baseline still pass (count may grow).
- Typecheck clean.
- Manual checklist (below) signed off for critical paths.
- No intentional UX/API contract changes for users.

---

## Execution status (completed)

| Phase | Status | Automated | Oracle |
|-------|--------|-----------|--------|
| 0 Plan | done | — | — |
| 1 Cleanup | done | 568 tests | APPROVE |
| 2 God modules | done | 573 tests | APPROVE (after Menu overlay fix) |
| 3 Task runtime | done | 598 tests | APPROVE (after start/stop lifecycle) |
| 4 Dependency direction | done | 598 tests | **APPROVE** (post-restart formal gate) |
| 5 Polish | done | **598 tests**, typecheck green | **APPROVE** |
| Overall | done | **598 tests** / 66 files | **APPROVE as done** |

**Final:** `npm run verify` green — **66 files / 598 tests** (baseline 559 → +39).  
**Manual E2E:** still recommended via `plans/architecture-refactor-verification.md` checklist.  
**Note:** Per-instance task queues preserved (not one global queue). Auth lives under `features/auth/state` with re-export from `contexts/AuthContext`.

### Oracle optional follow-ups (non-blocking)
- Top-level `vi.mock` in AuthContext.test (Vitest future error).
- Use `followingPort` as actual type import boundary for consumers.
- Direct unit test for `apiClient.waitForTaskResultById`.
