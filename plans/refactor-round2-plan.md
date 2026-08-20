# PawifyApp Refactor — Round 2 Plan

Branch: `refactor/phase-0-inventory` (continues from round 1, HEAD `b772963`).
Scope: everything outside `src/modules`. Reviewer: self (oracle quota-blocked until 08-25; workers will be re-added for implementation slices when the quota resets — same workflow, orchestrator + self-oracle).

Baseline at plan time: typecheck clean, 72 files / 641 tests.

---

## Findings

### P1 — correctness

1. **taskRuntime silent swallow (`connected + app-inactive`)** — in `executeTaskInternal`'s catch, a failure that happens while the network is fine but the app is no longer active matches *neither* branch (defer-on-disconnect / error-on-active): the error is swallowed and the task stays unsettled forever. For `replayPolicy: 'none'` tasks the queue entry hangs and any UI waiting on it stays loading. Symmetrically, the *pre-run* `appState !== 'active'` branch returns `null` without deferral — a task requested while backgrounded is silently stuck for `replayPolicy: 'none'`.
   Fix: settle-with-error in the fall-through case (consistent with "error = terminal"); mark inactive-pre-run tasks `deferredUntilActive` and replay them once on next foreground regardless of policy (the caller asked for execution; we only delay it).

2. **Notification tap routing is one-way** — background-tap and killed-state handlers open the Releases deep link for *every* visible notification, regardless of event (`following`, `releaseNotificationSettings` included). Route by `eventName`: `releases → /releases`, `following → /artists`, `releaseNotificationSettings → /menu`, `taskCompleted* → no navigation`. Extract a pure `getDeepLinkPathForEvent` + tests.

3. **Toast single-slot semantics** — a new toast replaces the current one without invoking its `onDismiss` (GenericList's info banner relies on that callback; a replaced banner can stay "visible" forever), and `error` toasts never auto-dismiss (persist until manually tapped). Fix: invoke previous `onDismiss` on replace; give errors a default 8s auto-dismiss (opt out with `timeout: 0`).

### P2 — performance / SRP

4. **One task manager per image** — every `CachedImageComponent` creates its own `useTaskManager()` store ⇒ its own NetInfo + AppState listeners. A screen with 30 covers mounts 30 native listeners and 30 `NetInfo.fetch()` calls. Introduce a shared image-task store (context) keyed by cache-key `taskId` (dedup across duplicate URLs improves behavior), migrate `CachedImageComponent`, keep per-page managers for page-level queues.

5. **`useNotificationService` is a 188-line god hook** — notification handler, channel setup, background task registration, event replay, four listeners, killed-state routing. Split into: routing helpers (pure, tested), background-task registration (module-scope side effect isolated), and a thin wiring hook.

6. **Dead API on ApiClient** — `waitForTaskResult(taskId, getTaskResult, options)` (3-arg) has zero production callers. Remove (tests updated).

7. **`useScrollAnchorList(items)` ignores its parameter** — dead API surface; callers pass arrays pointlessly. Drop the param (or inline the refs at the two call sites).

8. **Diagnostics gating duplicated** — `apiClient` has its own `diagnosticApiEndpoints` allowlist while `utils/diagnostics` owns `shouldLogArtistTaskDiagnostics`. Consolidate endpoint gating into the diagnostics module.

9. **`ui/index.ts` barrel mixes concerns** — exports `CachedImageComponent`/`LoadingText`/`PulsingPlaceholder` (cachedImage feature) alongside ui primitives. Split the barrel.

### P3 — polish

10. **Theme token gaps** — inline colors remain in `Spinner` (`#121212`), `CachedImageComponent` (`#1f2328`, `#333`), `TextField` (`#BBB`, `#D1D5DB`, `#FFF`), `InlineLink` (`#007AFF`), `ExternalLinksGrid` (rgba block), `styles.tsx` (`#888`, `#BBB`, …). Extend `theme.ts`; no visual changes.
11. **Sentry only wraps crashes** — no `captureAppError` in catch blocks; key failures (task failures, notification errors, image cache errors) are console-only. Route a curated set through `captureAppError`.
12. **`taskResultCache` listener isolation** — a throwing partial-result listener rejects into the wait loop (treated as a fetch error). Wrap listener calls in try/catch.
13. **`getStyles()` indirection** — returns a module-level object; replace with a direct export (`styles`) or leave; cosmetic.
14. **backgroundEventStorage read-modify-write** — concurrent adds can drop events; serialized in practice. Guard with a simple promise chain.
15. **`tests/dateUtil.test.ts`** covers submodule code — leave untouched (documented).
16. **google-services.json tracked** — product decision needed; not in this round.

### Explicitly not doing

- Artist 8-hook merge — verified cohesive on this read; each hook has a single role and a single consumer. Keeping the split; adding a feature README instead.
- `app.config.js` + `app.json` — legitimate composition (base + dev plugins).
- ScreenContainer safe-area change — needs device verification; deferred.
- Any visual redesign — tokens only.

---

## Phases (each: implement → verify → self-oracle review → commit)

### R2.1 — Correctness (findings 1–3)
- taskRuntime: settle-on-inactive-failure + `deferredUntilActive` replay; extend `taskRuntime.test.ts`
- Notification routing: `getDeepLinkPathForEvent` + wire background/killed handlers + tests
- Toast: onDismiss-on-replace + error auto-dismiss (8s default) + `ToastContext` tests
- Exit: verify green; manual note for device pass

### R2.2 — Image task store (finding 4)
- `ImageTaskProvider` (one shared `createTaskManagerStore` under CacheProvider or its own)
- `CachedImageComponent` consumes shared store; dedup by cache-key taskId
- Test: two components, same URL → one download task

### R2.3 — SRP cleanup (findings 5–9)
- Split `useNotificationService`; remove dead `waitForTaskResult`; `useScrollAnchorList` param drop; diagnostics gating consolidation; ui barrel split

### R2.4 — Theme tokens (finding 10)
- Extend `theme.ts`; wire listed components; no visual changes

### R2.5 — Observability + tests (findings 11–12)
- `captureAppError` in curated catch paths (task runtime, notification service, image cache)
- `taskResultCache` listener isolation + test
- `authSession` tests: signOut concurrency, reauth gate flow semantics (post round-1 fixes)

### R2.6 — Small polish + docs (findings 13–14, 16)
- backgroundEventStorage write serialization
- feature READMEs (artist module map); google-services decision note

## Verification matrix

| Phase | Automated | Extra |
|---|---|---|
| R2.1 | verify + new unit tests | device: background a slow fetch; tap a `following` push; error toast auto-dismiss |
| R2.2 | verify + image-store test | device: covers still render; no duplicate downloads (diagnostics) |
| R2.3 | verify | device: notification flows |
| R2.4 | verify | visual spot-check (no diffs expected) |
| R2.5 | verify | Sentry breadcrumb smoke (dev) |
| R2.6 | verify | — |
