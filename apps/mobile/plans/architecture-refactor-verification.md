# Architecture Refactor — Verification Plan

> Proves the refactor is **behavior-identical**. Run automated gates after every phase; run manual checks at least after Phase 2 and after final phase (or after any phase that touches providers / task manager / auth).

---

## 0. Baseline (before Phase 1)

| Check | Command / action | Expected |
|-------|------------------|----------|
| Unit + component tests | `npm test` | All pass (baseline: **559** tests / **63** files) |
| Typecheck | `npm run typecheck` | Exit 0 |
| Combined | `npm run verify` | Exit 0 |
| E2E smoke (optional device) | `npm run e2e:smoke` | Pass if emulator available |

---

## 1. Automated gates (every phase)

```bash
npm run verify          # typecheck + vitest
```

### Phase-specific automated focus

| Phase | Extra focus |
|-------|-------------|
| 1 | `arrays`, new `foregroundRefreshPolicy`, ToastContext import paths, AuthContext tests still pass |
| 2 | API client tests, artist/release/search API tests, Menu composition |
| 3 | `useTaskManager` + `taskRuntime` suites + isolation/start-stop tests |
| 4 | AuthContext tests at features/auth/state + re-export |
| 5 | Full suite + list typing typecheck |

### E2E / Maestro (when device available)

| Flow | File | When |
|------|------|------|
| Smoke | `.maestro/smoke.yaml` | After P2, P3, P4, final |
| Happy path logged-in | `.maestro/logged-in-happy-path.yaml` | Final |
| Music workflow | `.maestro/music-workflow.yaml` | Final (search/artist/releases) |
| Invalid login | `.maestro/invalid-login.yaml` | After auth move (P4) |

```bash
npm run e2e:smoke
# or full
npm run e2e
```

---

## 2. Manual regression checklist

Mark each: ☐ not run · ✅ pass · ❌ fail (note)

### 2.1 Cold start & session

- [x] ✅ App launches to splash / auth without crash
- [x] ✅ Existing session restores (stays logged in)
- [x] ✅ Sign out → Auth stack
- [x] ✅ Sign in email + password
- [ ] ⏭️ Sign in Google (Android) — intentionally not run; no disposable Google account, production Google account protected
- [x] ✅ Forgot / reset password navigation still works (Send Code and Verify Code forms opened; no email sent)

### 2.2 Following & artists tab

- [x] ✅ Following list loads for logged-in user
- [x] ✅ Follow/unfollow updates the list; event-driven state remained consistent
- [x] ✅ Unfollow from list works; UI updates
- [x] ✅ Artist profile images appear (or null placeholders) as before
- [x] ✅ Android background/foreground resume produced no duplicate fetch storm; iOS 5+ minute behavior not run on this Android device

### 2.3 Search

- [x] ✅ Search artists returns results
- [x] ✅ Explicit Load more requested offset 10 and appended page two without duplicating/removing page-one rows
- [x] ✅ Profile images on results resolve over time
- [x] ✅ Navigate to artist from search

### 2.4 Artist page

- [x] ✅ Artist details load
- [x] ✅ Release sections load; explicit release-section Load more was not separately exercised
- [x] ✅ Follow / unfollow toggle optimistic UI then stable
- [x] ✅ Expand relationships loads member rows/images
- [x] ✅ Open release group → release group/release page
- [x] ✅ External lyrics link opened Firefox; ranked artist links rendered as before

### 2.5 Releases tab (new releases)

- [x] ✅ New releases feed loads (valid empty state for disposable account; refresh returned zero releases)
- [ ] ⏭️ Covers resolve — not applicable because disposable account feed was empty
- [ ] ⏭️ Release multi-select remove — not applicable because feed was empty; equivalent artist list selection/removal and rollback passed
- [ ] ⏭️ Event/push driven release refresh — no release event available; bounded pull refresh passed

### 2.6 Release detail

- [x] ✅ Release page rendered artwork, date, links, tracks, and terminal lyrics states; usable lyrics link opened externally
- [x] ✅ Release group/release navigation loaded successfully

### 2.7 Settings / Menu

- [x] ✅ Open menu
- [ ] ⏭️ Link/unlink password — disposable account already used password as its only provider
- [ ] ⏭️ Link/unlink Google (Android) — intentionally not run; no disposable Google account
- [x] ✅ Notification setting toggled off/on, both saves returned 200, success toasts appeared, original value restored
- [x] ✅ Update check displayed current-version 1.0.4 modal
- [ ] ❌ Delete account navigates and deletes the account, but displays `Failed to delete account` after successful deletion (pre-existing defect; see 4.1)
- [x] ✅ Delete/unfollow confirmation overlays appeared full-screen after scrolling and canceled/confirmed correctly

### 2.8 Toasts & spinner

- [x] ✅ Offline unfollow showed an error toast and restored the optimistically removed artist
- [x] ✅ Global spinner appeared during release loading and disappeared when content settled

### 2.9 Offline / background (task manager)

- [x] ✅ Backend tunnel removed during unfollow: optimistic mutation failed, restored state, and showed feedback; tunnel restoration returned app online
- [x] ✅ Search started, app backgrounded, same Android task restored: query/results remained, completed image task resolved, no duplicate search request/crash

### 2.10 Images / cache

- [x] ✅ Artist artwork remained visible after revisiting and after background/foreground restore
- [x] ✅ No CachedImage crash spam; development logs showed Cover Art Archive TLS hostname warnings with remote-URL fallback

---

## 3. Structural verification (non-UX)

- [x] No remaining imports of deleted files (`useExternalLinkPreview`, old Toast path)
- [x] Toast imports from `contexts/ToastContext`
- [x] Auth implementation under `features/auth/state`; re-export at `contexts/AuthContext`
- [x] `AppProviders` comment matches nest order
- [x] Task runtime: `createTaskManagerStore` + thin `useTaskManager`; start/stop lifecycle

---

## 4. Sign-off log

| Phase | Date | `verify` | Manual subset | Oracle | Notes |
|-------|------|----------|---------------|--------|-------|
| 1 | done | ✅ 568 tests | automated only | APPROVE | Toast move, dead code, foreground policy |
| 2 | done | ✅ 573 tests | automated only | APPROVE after overlay fix | Controllers, Menu split, APIs |
| 3 | done | ✅ 598 tests | automated only | APPROVE after start/stop fix | taskRuntime extraction |
| 4 | done | ✅ 598 tests | automated only | **APPROVE** | Auth under features + followingPort |
| 5 | done | ✅ 598 tests | automated only | **APPROVE** | List generics, knip removed |
| Final automated | done | ✅ 599 tests / 66 files | automated only | **APPROVE overall** | Added direct task-result waiter coverage |
| Final Android manual | 2026-07-21 | ✅ 599 tests / 66 files | Pixel 8 Pro / debug package / local backend | refactor mergeable; release blocked | Core music/auth/settings/task flows passed; see account deletion defect below |

### 4.1 Manual release finding: account deletion false-negative

**Result:** The disposable account was deleted, but the app displayed `Failed to delete account`.

Evidence:

- `POST /v1/deleteUserAccount` started at `2026-07-21T15:01:47Z` and completed at `15:01:48Z` with HTTP 200.
- The backend implementation deletes the Firebase Auth identity through Admin SDK and then deletes associated account data.
- No subsequent `/revokeToken` request reached the backend.
- Reusing the disposable credentials produced `Invalid email or password`, proving the Firebase identity was deleted.
- ADB logcat, Android DropBox, Metro output, and `.expo/dev/logs/start.log` contained no retained deletion exception. The client catch path does not log the caught error.
- Baseline and refactored `useSecurityPage` both call backend deletion, then client `deleteUser(auth.currentUser)`, then `revokeToken()`. The refactor changed only the ToastContext import in this file. The sequence and absence of `/revokeToken` therefore locate the failure at the redundant client deletion after the backend had already deleted the identity.

Classification:

- **Not an architecture-refactor regression:** behavior and deletion sequence are unchanged from baseline.
- **Architecture refactor merge status:** mergeable on its stated behavior-preserving scope.
- **Release status:** merge-ready after the focused account-deletion fix in section 4.2.

### 4.2 Account deletion fix (applied in this working tree)

**Root cause:** Backend `deleteUserAccount` calls `admin.auth().deleteUser()` (deleting the Firebase identity), then the client called `deleteUser(auth.currentUser)` against the already-deleted identity, which threw and produced the false "Failed to delete account" toast. `revokeToken` was never reached, and calling `signOut` post-deletion would have recursed through the access-token failure path.

**Fix (5 files):**
- `useSecurityPage.ts`: removed client `deleteUser`, tracks `accountDeleted` to skip `revokeToken`, passes `skipRemotePushTokenCleanup:true` to `signOut` post-deletion, wraps sign-out in try/catch/finally so loading never sticks.
- `AuthContext.tsx`: `signOut` accepts optional `skipRemotePushTokenCleanup` (backward compatible).
- `postAuthSetupService.ts`: `cleanupPostAuthDevice` accepts `skipRemotePushTokenCleanup` option.
- `useSecurityPage.test.ts`: 4 tests (backend delegation, no client deleteUser, no-user guard, failure propagation).
- `postAuthSetupService.test.ts`: 3 tests (default, error-tolerance, skip-remote mode).

**Oracle review (2026-07-21):** The account-deletion fix is correct. Oracle noted a theoretical backend partial-cleanup case and several test/API design improvements; these are non-blocking follow-ups and are outside the observed client false-negative defect.

**Verification:** 68 files, 606 tests, clean typecheck. The physical-device run proved the original behavior: backend deletion succeeded, credentials were rejected afterward, and the old client displayed a false failure toast. The new success-toast/sign-out behavior is covered by code review and focused unit tests but has not been rerun on a device because the phone disconnected before this fix was implemented.

Other environment findings:

- Local push delivery reported missing/invalid development FCM credentials; authenticated API operations and notification-setting persistence still passed.
- Some Cover Art Archive cache downloads reported a TLS hostname mismatch and fell back to remote URLs; rendered artist/release imagery remained functional during the tested flows.

---

## 5. Failure protocol

1. Stop phase progression.
2. Capture failing test output / manual step.
3. Worker fix **only** that regression.
4. Re-run `npm run verify` + failed manual step.
5. Re-Oracle if the fix is non-trivial.
