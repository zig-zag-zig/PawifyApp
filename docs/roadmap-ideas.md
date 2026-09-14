# Pawify — Roadmap Ideas

Suggestions for new features and improvements, gathered from a direct read of the
monorepo (server routes/services, shared models, mobile feature modules) plus a
verified Metro export. Ordered by estimated effort-to-impact ratio, not by category.

Status: **ideas only — nothing here is committed or started.**

| Area | Idea | Effort | Impact |
| --- | --- | --- | --- |
| A1 | Notification filters beyond the date window | M | High |
| A2 | Digest / capped push notifications | S | High |
| B1 | Bound per-user `known_releases` growth | M | High |
| A4 | "Listen now" primary action | S | Medium-High |
| A3 | Search releases + labels, search history | M | Medium-High |
| A8 | Share a release (+ make ReleaseGroup deep-linkable) | S-M | Medium |
| C | Pull-to-refresh, a11y, haptics, undo, feed grouping | S each | Medium |
| A9 | Read-only offline mode | M | Medium |
| B3 | Verify APK download integrity | S | Medium (security) |
| A5 | Tour dates near me | L | Medium-High |
| A6 | Collector layer (owned/wantlist + format/label data) | L | Medium-High |
| A7 | Discovery from richer artist relations | M | Medium |
| B2 | Notification fan-out scaling vs MusicBrainz limits | M | Medium |
| D | Hygiene: shared package entry fields, stale docs | S | Low |

---

## A. New features

### A1. Notification filters beyond the date window

Highest-value gap. `ReleaseNotificationSettings` is two fields today
(`packages/shared/models/models.ts`, `oldestReleaseDateMonths` +
`includeReleasesWithoutDate`), and `apps/server/src/utils/helpers/releaseNotificationFilter.ts`
only inspects `release.date`.

Filters worth adding:

- **Release primary type** — Album / Single / EP / Demo / Broadcast. "Singles only"
  or "no demos" is the most common request for electronic-music listeners.
- **Release status** — Official vs Promotion/Bootleg. Not fetched at all today
  (`src/services/musicbrainz/releaseQueries.ts` requests only
  `release-groups+artist-credits`).
- **Label and country** — "only notify me for releases on <label>".
- **Per-artist mute** — currently unfollowing is the only way to silence a
  prolific artist.

All additive: one settings doc shape + one predicate in `releaseNotificationFilter`.

### A2. Digest / capped notifications instead of one push per release

`apps/server/src/services/notifications/newReleaseNotificationRunner.ts` sends a
**separate visible push per release**, at concurrency 4, with no cap. A user
following 50 artists can get 30+ notifications in one burst.

- One "N new releases" digest push, with the aggregate already built by
  `buildReleaseNotifications`.
- Per-run cap on visible notifications.
- Optional quiet hours / "send at most one summary per day".

### A3. Search releases and labels, not just artists

`apps/server/src/services/musicbrainz/artistSearch.ts` only hits `/artist?query=`.
MusicBrainz supports `release:`, `release-group:`, `label:`, plus `type:`/`year:`
filters. "Find this album I half-remember" → release page → follow the artist is a
real acquisition funnel.

Related: no search history or saved searches — nothing in
`apps/mobile/src/features/search/state/searchReducer.ts` persists queries.

### A4. "Listen now" as a primary action

Streaming services are already modelled and ranked: `ExternalLinkService` covers
Spotify / Apple Music / YouTube Music / Bandcamp / Tidal / Deezer / Beatport, and
`apps/mobile/src/components/externalLinks/externalLinkRanking.ts` ranks them.
A single "Play on …" button with a user-preferred service is nearly free and turns
a metadata app into something you open while listening.

### A5. Tour dates near me

`setlistFm`, `songkick` and `bandsintown` already exist in the link taxonomy.
A location setting + "upcoming shows" section is a strong retention feature and a
natural second notification type.

### A6. Collector layer: owned/wantlist + format/label/barcode data

`secrets/*/dapr-secrets.json` reserves a `discogs-token` and there is a
`discogsClient.ts`, but no release *format, label, catalogue number or barcode* is
ever fetched — so the release page cannot distinguish a 2×LP reissue from the
original CD. Biggest differentiation gap for a Discogs-adjacent audience.

### A7. Discovery from richer artist relations

`apps/mobile/src/features/artist/domain/artistRelationships.ts` renders only
Members / Member Of / Subgroups. MusicBrainz also has *collaborations, remixed,
produced, DJ-mix, samples* — exactly the graph needed for "artists like this one
you don't follow yet", and a good empty-state/onboarding suggestion source.

### A8. Share a release

Nothing in `apps/mobile/src` uses `Share` / `expo-sharing`, and
`src/navigation/linking.ts` already supports `pawify://release/:artistId`, so a
share sheet is roughly 20 lines.

Blocker to fix first: `ReleaseGroup` is deliberately **not** deep-linked because its
route params carry a full releases array (comment in `src/navigation/linking.ts`).
Making that route id-based + fetch-on-open unlocks share links, notification
landing, and lower memory pressure.

### A9. Read-only offline mode

`@react-native-community/netinfo` and `@react-native-async-storage/async-storage`
are already dependencies, but no API JSON is persisted — airplane mode means an
empty app, even though an artwork file cache already exists
(`src/components/cachedImage/`, `src/services/cache/useFileCacheMaintenance.ts`).

Snapshot the following list + last feed, and show stale data behind an "offline" banner.

---

## B. Reliability & scale

### B1. Unbounded per-user `known_releases` maps

`apps/server/src/services/firebase/knownReleasesStore.ts` writes a whole
`{releaseId: true}` map per user + artist, forever. This is already *monitored*
(`src/services/monitoring/mapsDocSizeThresholds.ts` warns at 850 KiB against RTDB's
~1 MiB node ceiling) — but a monitor is a smoke detector, not a sprinkler.

Fix: per-user last-scan watermark against a global release index, or shard the map.
Users following a prolific artist will hit this.

### B2. Notification fan-out against MusicBrainz rate limits

`getNewReleases` (`src/services/musicbrainz/newReleaseDetection.ts`) fans out 4-wide
per artist for every user, cron-driven — so cost is O(users × followed artists)
upstream calls. As user count grows this collides with MB's 1 req/s guideline.

- Stagger per-user scans with jitter and backpressure.
- Reuse a global per-artist release cache instead of per-user lookups.

### B3. APK updater has no integrity check

`apps/mobile/src/features/updates/services/appUpdateService.ts` downloads the release
asset and hands the `contentUri` straight to `installApk` — bytes-written/size is
tracked, but the download is never verified.

Publish a SHA-256 (in the release body or encoded in the asset name), verify after
download, then install. Extra reason to care: `REQUEST_INSTALL_PACKAGES` is required,
and GitHub's unauthenticated 60 req/h per-IP limit makes the check endpoint easy to
pressure. Note the Play-policy implications of an in-app APK installer if the
distribution model ever changes.

### B4. Theme declaration mismatch

`apps/mobile/app.json` sets `userInterfaceStyle: "light"` with portrait lock, while
`src/styles/theme.ts` is dark-only (`#121212` background, white text). That pairing
gives light system bars/splash against a dark UI. Either force dark or ship a real
light theme.

---

## C. UX polish

- **No pull-to-refresh anywhere.** `onRefresh|refreshing` does not appear in the
  release/artists/search views; refresh happens only on foreground-resume and via
  events. Users have no way to force a sync.
- **Accessibility is thin**: 17 `accessibility*` props across the whole app, no
  `allowFontScaling`, `tabBar.height: 48` with `iconSize: 28`. Add labels for
  icon-only controls, respect font scale, hit 44dp+ targets, announce feed updates.
- **Haptics**: `expo-haptics` is not installed. Cheap win for a list-driven app
  (follow / remove / multi-select).
- **Undo for removals**: `src/features/release/hooks/useNewReleaseFeedController.ts`
  already snapshots removed releases and re-inserts them at index
  (`restoreRemovedReleases`). Wire it to a toast "Undo".
- **Feed grouping + tab badge**: group new releases by day/artist, unread count on
  the Releases tab.
- **Empty and error states**: suggested artists for the first-run empty following
  list; explicit retry on failed lookups.
- **Localization**: all copy is hardcoded English (`src/features/auth/domain/authCopy.ts`,
  `src/features/updates/domain/updateCopy.ts`, inline strings). The audience is
  global by nature.

---

## D. Code & docs hygiene

- `packages/shared/package.json` advertises `react-native: "src/index.ts"` and
  `exports["."].react-native: "./src/index.ts"`, but **that file does not exist** —
  the real entry is `packages/shared/index.ts`, and `packages/shared/src/` is an
  empty root-owned leftover directory.

  Verified *not* currently broken: `expo export` with `packages/shared/dist` removed
  succeeded, and the resulting bundle references `../../packages/shared/index.ts`
  (TS source). So this is latent, not live — Metro reaches the source through
  fallback behaviour, and any consumer honoring that field literally (a web bundler,
  a future Metro change, removing the `@pawify/shared` entry from
  `apps/mobile/tsconfig.json` `paths`) would break. Point the field at `./index.ts`
  and delete the stray `src/`.
- `apps/mobile/README.md` still says "Expo SDK 56 / React Native 0.85"; installed is
  Expo `57.0.19` / RN `0.86.3`.

---

## Suggested first slice

A1 + A2 share one code path (`releaseNotificationFilter` + the settings doc) and
deliver the most user-visible change for the least new surface. B1 is worth doing
before it becomes a user-visible outage.
