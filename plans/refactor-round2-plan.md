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

## Execution status (2026-08-20, all committed on `refactor/phase-0-inventory`)

| Phase | Commit | Verify |
|---|---|---|
| R2.1 correctness | `07b1a39` | 73 files / 654 tests |
| R2.2 image task store | `faab3d1` | 74 files / 656 tests |
| R2.3 SRP cleanup | `c7d1fe6` | 74 files / 656 tests |
| R2.4 theme tokens | `5483b16` | 74 files / 656 tests |
| R2.5 observability + tests | `cfe78bd` | 75 files / 661 tests |
| R2.6 polish + docs | (this commit) | 75 files / 661 tests |

Notes:
- R2.2 also fixed image tasks never settling (`downloadAndCacheImage`
  resolved `undefined`, leaving zombie queue entries that re-ran on every
  foreground replay).
- R2.5 introduced `services/monitoring/reportError` (Sentry registers as the
  reporter at init) so core modules stay free of the Sentry SDK import.
- Deferred items (unchanged): ScreenContainer safe-area (device check),
  google-services.json tracking (product decision), dateUtil test (submodule
  code).
- Every phase self-reviewed (oracle quota-blocked until 08-25; retroactive
  oracle pass still queued in the ledger).

## R2.8 — Expo SDK 57 upgrade (added post-hoc)

Motivated by the two standing expo-doctor failures (Hermes V1 memory
regression, patched only in RN 0.86.2+) and the R2.7 note that the SDK bump
would retire the remaining image-size advisories.

Changes:
- expo ~56.0.20 -> ~57.0.15; react-native 0.85.3 -> 0.86.2 (Hermes fix);
  react-native-reanimated 4.3.1 -> 4.5.1; react-native-worklets 0.8.3 ->
  0.10.1; all 13 expo-* packages + babel-preset-expo aligned to SDK 57;
  react-dom pinned 19.2.3 (matching react, resolving a peer conflict);
  react-native-gesture-handler ~2.32.0; vitest resolved 4.1.11.
- Removed stale `expo.sdkVersion: 56.0.0` from app.json — expo-doctor was
  validating against SDK-56 expectations because of it (it actively caused
  the "wrong versions" report after upgrading).
- Repo's canonical scripts used throughout (`expo install --fix`,
  expo-doctor gate, `npm run build:release:install`).

Result: expo-doctor 21/21 (first fully green run), verify green
(75 files / 661 tests), release APK built (BUILD SUCCESSFUL 10m10s) and
installed on device. Custom config plugins (google-signin, build-variants,
gradle-jvm, e2e-cleartext + ApkInstallerModule) all compiled clean on the
new SDK. Recommended: a quick on-device smoke of the critical paths
(Google sign-in, push notification tap routing, image covers) since native
modules were rebuilt against RN 0.86.

Note: `image-size` advisories remain even on SDK 57 (metro resolves 1.2.1;
advisory range is `*`, no patched version exists upstream). The R2.7
accepted-risk rationale stands; re2 had drifted again during the upgrade
and was re-fixed.

## R2.7 — npm audit remediation (added post-hoc)

18 vulnerabilities (3 moderate, 15 high), all confined to dev/build tooling
(metro, firebase-tools, vitest, node-gyp); zero in app runtime deps — the
shipped APK is unaffected (package.json unchanged; lockfile only).

Fixed via `npm audit fix` (lockfile-only): brace-expansion (8 nested copies),
fast-uri, ip-address, js-yaml, re2, undici (2 copies), tar 7.5.20 -> 7.5.22
(existing override already allowed the patch).

Remaining 8 advisory hits = 2 GHSA advisories for `image-size`
(GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq) duplicated across the
metro/@expo-metro/expo dependency tree. **No patched version exists** — the
advisory range is `*` (latest 2.0.2 is itself vulnerable), and npm's only
suggested remediation is downgrading expo 56 -> 53, which is rejected.
Accepted risk: metro consumes image-size at build time on repo-local assets
only. Revisit with the SDK 57 upgrade (already required by the Hermes V1
expo-doctor check).
