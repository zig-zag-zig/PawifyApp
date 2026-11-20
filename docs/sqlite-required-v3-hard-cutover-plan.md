# SQLite-required catalogue, unified release loading and persistent lyrics — v3 hard cutover

> Rollout update: `/v1` and `/v2` remain available to their existing clients. The instructions below to retire those versions are superseded by the [rollout runbook](sqlite-required-v3-cutover-runbook.md). The v3 wire contract stays independent of the compatibility adapters.

## Purpose and authority

Implement the user's explicit hard-cutover decision now that Pawify has a full local MusicBrainz mirror:

1. SQLite is the required catalogue/search/track source. Remove MusicBrainz Web Service fallbacks for everything except lyrics lookup after Genius miss/failure.
2. Return release metadata and tracks from one request and remove the mobile's separate track-loading flow.
3. Resolve lyrics using persistent state → Genius → MusicBrainz lyrics relations fallback.
4. Stop duplicating mirror-backed tracklists in Redis; replace Redis lyrics-result persistence with a sparse application-owned SQLite store.
5. Remove legacy runtime/client compatibility branches rather than carrying old and new implementations indefinitely. Use API v3 for breaking response/endpoint changes.
6. Simplify server/client request and task orchestration while keeping real asynchronous external-provider work off the critical path.

This document is an implementation plan, not implementation or deployment authorization. Read repository instructions and inspect the current code before editing. No dependency addition is assumed. Do not deploy, publish, delete production data/cache, resume/reconfigure VPS jobs, or modify the mirror DB as a side effect of implementing this plan. Runtime/schema/state migrations must have explicit preview and controlled application steps.

## Starting point and facts

At plan creation the checked-out repository is `main`, commit `c3f8925`, server `1.10.10`, mobile `2.4.16`. Create a new focused feature branch; do not work directly on protected main. Recheck versions and HEAD before choosing release numbers because another session may be releasing independently.

The mirror has already been built, acceptance-verified, transferred, and opened successfully by the deployed API. The initial transferred file was 24,937,062,400 bytes; metadata/prune cursors were 190556 at transfer. Sync was resumed and has committed newer metadata. Do not use old file hashes/cursors as an expectation for a running mirror.

The artwork export exists locally and on the VPS. Every one of its 13,584,488 image rows was verified against the transferred mirror with zero missing/mismatched rows, including 565,696 Discogs rows. Do not alter, discard, or recreate artwork state during this work.

Current lyrics relation table:

```sql
recording_lyrics (
    recording_id INTEGER NOT NULL REFERENCES recordings(id),
    url TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (recording_id, url)
) WITHOUT ROWID;
```

The full build had no lyrics relations from the supplied dumps. This table remains dump/sync-owned: recording updates can replace its rows; it has no miss/failure/timestamp state. **Do not write Genius backfill into it.** Keeping this existing table in the mirror does not mean it is the persistent application lookup store.

Existing Genius worker persists results in Redis per release/track. The MB fallback for a failed Genius lookup does not yet exist as the proposed dedicated provider chain.

## Target architecture

```text
Mobile v3
 ├─ catalogue/search HTTP requests → required read-only mirror
 ├─ getRelease → metadata + media/tracks together, one DB read snapshot
 ├─ immediate persisted artwork/lyrics state
 └─ asynchronous enrichment → artwork providers and lyrics worker
                                  ├─ application lyrics SQLite state
                                  ├─ Genius search (first upstream provider)
                                  └─ MusicBrainz recording/work lyrics relations (fallback only)
```

The mirror is required, not a feature toggle. A missing/corrupt/unready mirror is an operational failure, not permission to fall back to MusicBrainz.

Application-owned lyrics data belongs in a separate persistent SQLite file, e.g. configurable `LYRICS_DB_PATH` mounted outside build outputs and outside any mirror-file replacement operation. Reuse the installed SQLite driver and the existing durable directory/mount conventions; never place it in a container's disposable writable layer. It may share a host directory only if swap/cleanup scripts operate on exact filenames and cannot delete it.

## 1. API v3, one implementation, no legacy runtime

### Why a new version

Combining `getRelease` and `getReleaseTracks`, deleting task/version variants, and changing error semantics breaks the current contract. Introduce `/v3` and update the mobile configuration/endpoint types in the same release. Do not silently replace `/v2` wire behavior while claiming compatibility.

### Hard-cut behavior

- Mount the single new contract under `/v3`.
- Remove v1/v2 handlers, presenter variants, legacy planners and dual `ContractNamespace` paths after confirming call sites.
- Do not retain working v1/v2 route aliases, old endpoint emulation, old payload unpackers or alternate client response parsers.
- Unsupported old version requests must fail clearly. An optional generic `410 API_VERSION_UNSUPPORTED` response with an upgrade message is a rejection, not a compatibility implementation. Otherwise the standard unsupported-route response must be documented and tested.
- All supported routes, including auth/settings/following/task results still in use, must be mounted under the new version; do not migrate only release routes and strand login or notifications.
- Keep existing authenticated handlers, validation, authorization, rate limits and central request error handling. API version removal must not remove those controls.
- Unversioned health/liveness can remain operational endpoints.
- Update mobile build/env defaults, examples, tests, notification/deep-link assumptions and deployment configuration so production cannot accidentally continue requesting v2.

Suggested v3 release response (adapt exact names once, consistently across shared/backend/mobile):

```ts
type GetReleaseResponse = {
    release: Release; // includes all available media and tracks
    trackLyrics: Record<string, string | null>; // usable persisted result/confirmed miss
    profileImages: Record<string, string | null>;
    lyricsTaskId: string | null;
    profileImageTaskId: string | null;
    // Cover enrichment field only if actually needed to avoid blocking initial data.
};
```

No `getReleaseTracks` endpoint in v3. Task replay for enrichment must use an explicit enrichment operation or the unified release endpoint with deduped pending subsets, never the removed endpoint.

### Stored state is not an API compatibility fallback

Hard cutover does not authorize loss of known-release history, followings, feed entries, provider artwork, or existing useful lyrics URLs.

If legacy Firebase/cache values exist, use a **one-time, previewable migration** before enforcing the new canonical shape. Preserve seen-content baselines silently, avoid notification storms, and make the migration idempotent. After migration, remove dual-format runtime parsing, version markers used only for old formats, legacy artwork Redis reads, and old task payload unpacking from supported paths. Document unresolved records; do not guess group IDs or silently delete history.

Old in-flight tasks must not replay into the new contract. Version/expire their task namespace once at cutover, then keep only the current namespace. Do not keep both runtime workers forever. No broad Redis flush or production state deletion without separate operator approval.

## 2. Required SQLite repository boundary

### Startup/readiness

Replace optional mirror initialization and `withMusicDb`/`isMusicDbEnabled` branching with a strict repository boundary for catalogue operations.

Require:

- configured existing mirror path;
- current reader schema, including media/tracks/credit columns;
- required artist/group/recording FTS tables;
- ready track/edition metadata state;
- image service mappings needed for existing artwork decoding.

Missing/corrupt/incompatible/unready data fails readiness/startup with an actionable logged reason. Do not catch the error and present empty results or query MB. Keep liveness versus readiness distinct if useful for operations. Do not make an hourly replication lag alone stop an otherwise valid DB; monitor cursor age separately with an explicit stale-data policy.

At runtime:

- healthy query with zero search hits: HTTP 200 with empty results;
- entity genuinely absent from the local snapshot: local not-found response, no Web Service lookup;
- DB unavailable/busy/unready: explicit retriable service error (e.g. 503), not empty results or remote fallback.

**Important:** mirror absence is not proof an entity was globally deleted. Remove existing remote HEAD-based existence validation, but do not replace it with destructive global Firebase cleanup on any local miss. Only confirmed mirror prune/redirect events or another explicit authoritative deletion signal may delete user history. Local release-ID redirects can be resolved directly without MB calls.

### Remove Web Service catalogue consumers

Inspect and remove remote dependencies for:

- artist details/summary and following bootstrap;
- artist/group/recording search and typo/zero-result fallback;
- artist release groups and notification/settings catalogues;
- release-group edition lists;
- release metadata/tracklists and existence checks;
- remote redirect resolution used by request-time catalogue paths;
- artwork provider-link discovery through MB release/group/artist requests;
- daily API tracklist revalidation that exists solely to seed lyrics before Genius.

Do not remove Deezer/Tidal/Discogs/Cover Art Archive providers simply because they are associated with MusicBrainz IDs. Cover Art Archive image retrieval is not a MusicBrainz Web Service metadata fallback and remains permitted. Their ID/link inputs must come from local `external_links`/image state, not MB metadata lookup. No local provider link means follow the existing allowed provider/CAA chain or show a placeholder.

Keep MusicBrainz replication/download code in the mirror tool: **the ban concerns runtime app Web Service fallbacks, not the feed that keeps SQLite current.** Do not rewrite mirror sync/build to implement this app cutover.

### Completeness and notifications

Retain the existing explicit catalogue completeness checks and artist-first bounded queries. Incomplete/capped catalogues cannot notify, baseline, or prune. Hard cutover is not permission to turn incomplete data into a complete empty set. Keep the distinct-release probe and independent overflow detection already implemented; do not reintroduce removed browse caps into detection.

## 3. Local search: concurrency without fake parallelism

### Current baseline

- Server `features/artists/usecases/searchAll.ts` already uses `Promise.all` for search categories.
- Mobile `features/search/hooks/useUnifiedSearch.ts` launches category requests independently and has per-category pagination/state.
- `better-sqlite3` calls execute synchronously. Wrapping these calls in async functions or `Promise.all` does not parallelize the actual SQL and can still block Node's event loop.
- Server artwork planning in `searchAll` currently awaits independent planners sequentially after search results.

### Recommended initial change

Keep independent, directly requested category searches and immediate category rendering. Remove MB-search fallback and provider-rate-limit-induced request-task orchestration. Do not make artists wait for recording search or external artwork.

- Keep category-specific HTTP requests/parameters, offset/limit or existing stable cursors, and per-category loading/error state.
- For optional combined searches, return coherent direct data and run independent asynchronous enrichment planners concurrently with bounded `Promise.all`; do not claim synchronous SQL parallelism.
- Partition known artwork state immediately; queue actual unresolved external artwork without blocking category data.
- Use direct API calls with `AbortSignal`, query generation IDs and stale-response checks instead of persistent/replayable generic tasks for local search requests.
- Keep debounce/minimum query length, deterministic ordering, safe FTS token quoting, count/candidate budgets, dedupe, pagination-end behavior and per-category retries.
- Local empty results stay empty. No typo/zero-result calls to MB. Optional future local typo matching is separate work, not a dependency for this cutover.
- Batch/join artist credits and page-level representative-release/image data where practical. The current recording search performs credit lookups for ranked candidates and release lookups for page results; profile those paths, avoid loading all 41 million recordings or unbounded broad-term ranking.

### When to add actual SQL parallelism

Measure representative common/broad/no-result queries and event-loop responsiveness first. On the 2-GB VPS, avoid a large connection/cache pool by default.

If synchronous recording queries measurably stall independent categories, use a small **bounded** pool of Node worker threads with read-only SQLite connections and bounded page caches. Start with one off-thread heavy-search worker or at most two measured lanes, not one worker per request/category. Add queue limits, stale-query cancellation/discard, clean shutdown, error propagation and WAL coexistence tests. Transfer only bounded plain results between threads. No new third-party dependency is required. Do not introduce workers just because `Promise.all` sounds insufficient.

Acceptance is responsiveness and bounded resources, not a promised speedup number. Document measured baseline and chosen approach; do not import 41M candidates or allocate 1 GB of cache per worker.

## 4. Unified release loading and mobile simplification

### Backend

- Add a single repository method that reads release metadata, media/tracks/credits and current identities in one SQLite read snapshot. Avoid separate queries seeing different committed sync versions.
- Preserve real recording MBID as an explicit optional/current `recordingId` field in the v3 track/internal enrichment request model. A release track's public ID is not a recording MBID.
- Keep release-scoped track IDs stable (current synthetic `${releaseId}:${mediumPosition}:${position}` may remain); repeated use of the same recording on one release must not collapse UI rows.
- Read all media including valid empty media; distinguish known empty data from incomplete/unavailable data.
- Avoid one SQL lookup per track for the normal case: batch credits/lyrics state for the release, retaining compacted recording-title/credit fallback behavior.
- Return tracks as part of `getRelease` without waiting for Genius, MB lyrics fallback or remote artist artwork. Use persisted artwork immediately and queue real pending enrichment. If existing cover resolution can block the response on provider requests, split the pending-cover part from the core DB response rather than hiding that network delay in the new combined call.
- Plan release/track artist profile images once for the whole payload; avoid the old header-and-tracks duplicate plans.
- Return ready lyrics state immediately; only queue unresolved/retry-due keys.
- Delete the separate catalogue gateway/use case/handler/client type for `getReleaseTracks`, old API tracklist cache/unpack/revalidation, and merge glue that was used only for metadata/tracklist split.

### Mobile

- One request loads `release` with all tracks.
- Remove separate track request/promise, track retry generation, `loadingTracks`, `tracksLoadFailed`, split metadata/tracks reducer actions, and `onRetryTracks` plumbing when no longer needed.
- Use one initial release loading state and one release-level error/retry. Remove the 'Fetching tracklist from MusicBrainz'/'MusicBrainz may be rate-limited' track UI.
- Lyrics and unresolved artist images remain progressive, nonblocking, per-item enrichment. Show lyric-specific busy/retry/no-result state where appropriate; never re-display a full tracklist loader for enrichment.
- Keep existing user-selected track stable when a lyric/image result arrives. Asset-only reducer actions update maps, not a stale whole-release object or clear `selectedSong`.
- Ignore enrichment results from a prior release/navigation generation. Cancellation must not leave unhandled rejected promises.
- Task recreation uses the new enrichment path/current request contract, never the deleted tracks endpoint.
- Keep mobile memory caches for currently useful lyrics/image data; clear or version stale persisted API-shaped caches at v3 cutover rather than retaining legacy unpackers.

## 4A. Release-group screen after SQLite/v3 cutover

### Backend: local edition list, no upstream catalogue session

- Read group identity/header and its edition list directly from SQLite. Remove the `onReleaseIdsPage`/`isLastPage` gateway callback machinery used to accumulate upstream MB pages for cover planning. Construct cover inputs from the actual local result, once.
- Preserve each release's ID, title/disambiguation, date, total `media.track_count`, distinct formats, country and status. Do not load full tracklists or run lyrics lookups for every edition just to display the group screen.
- Keep all editions visible, including non-Official editions. The Official-only rule belongs to notification detection, not browse filtering. Do not restore old title/track-content dedupe that hides editions.
- Make list ordering deterministic and identical regardless of navigation entry point. Retain current mirror date-ascending/unknown-last order with release ID tie-break unless a deliberate UX change is separately made. Preserve MusicBrainz partial date precision.
- Return group not-found versus known empty-group versus DB/service error distinctly. Do not remote-probe a missing group or interpret DB failure as an empty edition list.
- Include persisted release artwork URLs/state in the immediate response. Read them in a batch and queue only unresolved visible-page artwork. Cover failures must never hide the edition rows.
- Remove Redis `releaseGroupReleasesV*` catalogue payload caching and MB fallback reads: SQLite is the catalogue source. Remove the old cache-suffix union/TTL/merge helpers if no callers remain. Keep only appropriate ephemeral client view state and actual provider/backoff/job state.

Suggested single v3 group response:

```ts
type ReleaseGroupResponse = {
    releaseGroup: ReleaseGroup;
    releases: ReleaseGroupReleaseListItem[];
    releaseCount: number; // total, not only loaded rows if paginated
    releaseCovers: Record<string, string | null>;
    releaseCoverTaskId: string | null;
    nextCursor?: string | null;
};
```

Choose one supported endpoint name/shape and use it everywhere; do not retain a second metadata-only request or old V2 normalizer as compatibility glue. For ordinary groups a single complete list is sufficient. If production measurements show very large groups need paging, use a proper keyset/cursor contract with total count, bounded artwork scope and explicit page boundaries; never silently cap the result or claim the page length is the whole group's release count.

### Mobile: one group-loading path

- Navigate with `releaseGroupId` from artist, search, feed and deep links. Group screen performs the direct v3 local-data request. Remove artist-page prefetch-then-route-list handoff, old `routeReleases` compatibility normalization, separate route/task cover-source merging, and `getReleaseGroupReleasesWhenReady` retries for malformed old responses.
- Do not show both an artist-page group spinner and a second group-page catalogue spinner. Use one initial group-screen loading state, one clear error/retry path, and a genuine empty state.
- Use normal cancellation/generation handling for initial loads and retries; stale responses and cover jobs from group A must not mutate group B after navigation.
- Keep immediate persisted covers and progressive per-row updates for pending external artwork. Cover task recreation should resolve only pending artwork through the retained enrichment interface, not refetch the whole catalogue merely to obtain another task ID.
- Keep the compact metadata display already shipped: `CD + DVD · 24 tracks · date`; omit unknown values and show non-Official status only. Keep barcode on the individual release screen. Country remains available without forcing another chip into every row.
- Preserve cover/title/date, share deep link, accessible row labels, row press to the edition's release ID, scrolling and count header. Use group title for the shared group identity rather than arbitrarily taking the first edition title when group metadata is now present.
- Local DB lookup still happens over HTTP, so loading/error UI is still needed; remove MB-specific explanation and redundant phases, not all loading/error handling.
- For unusually large groups, prefer a virtualized list instead of mounting every cover/row in a `ScrollView`. Keep artwork resolution scoped to the visible/page window; do not start Genius or MB lyrics work until an individual release is actually opened.

### Release-group regression coverage

- All navigation entry points use the same group request/response; no route-carried legacy edition payload is required.
- Multiple formats/media sum correctly, unknown media stays unknown, repeated formats are deduplicated, and partial dates retain precision.
- Non-Official editions stay visible but do not trigger notifications.
- One initial loader, request cancellation, retry generation and known-empty/not-found/service-error distinctions.
- Cached artwork renders immediately; pending provider artwork does not delay rows and does not restart catalogue loading.
- Share and row navigation retain correct group/release IDs and accessible labels.
- No MB Web Service, Redis edition-list cache, upstream paging callback or removed V2 response normalization is invoked.
- Large-group paging/virtualization, if introduced, preserves deterministic order/count and only queues bounded visible artwork.

## 5. Persistent on-demand lyrics lookup store

### Ownership and identity

Create a **separate app-owned SQLite DB**, not a new Genius field in the mirror's dump-owned `recording_lyrics` table. The API must not silently create the mirror or change mirror schema during startup. The application lyrics DB gets its own versioned initialization/migration and permissions.

Default durable identity: recording MBID, because a local integer ID is stable during sync but belongs to one particular mirror build. The sparse store must survive future mirror replacement and MBID redirects. Retain integer IDs for mirror queries, but do not pretend a sidecar FK references a different SQLite file. Storing one public MBID in a sparse, requested-only store is a deliberate durability tradeoff, not a re-expansion of track relations.

For materially different track title/artist credits or a missing recording identity, add a normalized query fingerprint/variant key based on the actual queried title and credit. Do not share a variant-specific Genius match blindly across all releases of the recording. Never use only title/artist text as global recording identity.

Suggested minimal state per durable lookup/variant:

```text
lookup key / recording MBID when known / query fingerprint
resolved URL (nullable)
provider: genius | musicbrainz (nullable when unresolved)
outcome: found | confirmed-miss | transient-failure
checked_at
next_attempt_at / recheck_after
provider-attempt metadata needed to choose which provider to retry
```

Store one selected result/state per lookup, not every search hit or whole upstream JSON. Store **links only**, no lyrics text or secrets. Only create rows when a release/track is actually requested. An untouched recording has no lyrics-state row.

### Result semantics

- Valid found URL: reusable across relevant releases; long but finite refresh policy.
- Genius confirmed miss: proceed to MB lyrics fallback.
- Genius transient failure/missing token/rate limit: proceed to MB fallback if the request has not been aborted and its budget allows; preserve Genius retry state.
- Abort/navigation cancellation is not a provider miss: respect cancellation and do not trigger another provider after abort.
- MB success: persist selected fallback URL with provider information. Optionally retry Genius later according to policy, not on every screen open.
- Confirmed absence from **both** successful providers: persist expiring negative lookup state.
- Any failed/unavailable provider plus no successful match: do not record a permanent confirmed miss; use transient retry/backoff state.
- Deduplicate in-flight resolution per durable lookup; multiple tracks/releases sharing it should not issue the same provider request concurrently.
- Provider calls occur outside SQLite write transactions; persist result in a short bounded transaction/upsert. Respect WAL/busy handling and multi-process/queue constraints. Do not hold locks while awaiting network.

### Existing Redis result migration

A hard cutover must not retain dual runtime read paths. Decide before deployment:

- Preferred: a one-time previewable migration of useful existing Redis lyric URLs into the sidecar, mapping release/track keys through local track identity where trustworthy; preserve unresolvable results in a migration report/backup rather than invent recording IDs.
- If the operator accepts cache-only results expiring naturally instead, they may be refetched on demand; do not promise those existing results were migrated.

After that cutover the supported worker reads/writes only the sidecar for lyrics results. Remove `asset:lyrics:*` runtime compatibility reads/writes and release/track-specific duplication in Redis. Do not flush Redis because task state/rate-limit/backoff/other app data still lives there.

### Sync, merges and retention

- Mirror sync/prune/rebuild cannot touch sidecar tables.
- Resolve known recording redirects through local mirror redirect data and carry/merge lookup state without overwriting a better target result. An unresolved redirect retains durable data until it can be resolved; do not cascade-delete the only copy.
- Do not write a row for every missing recording or pre-backfill all 41 million recordings.
- Expose row count, DB/WAL bytes, provider outcomes, hit ratio and retry counts.
- Use bounded housekeeping with preview mode: expire old miss/failure rows first, then any agreed success-retention policy. No unbounded historical query log. Tune real limits from measurements and available disk rather than promising 'negligible' forever.
- Estimate storage using measured sample URL/key/state/index sizes at 10k/100k requested lookups. Include WAL/checkpoint headroom. URL storage is smaller than lyrics text but not zero.

## 6. Genius first, MusicBrainz lyrics fallback only

### Normal worker flow

```text
usable stored state
  → return immediately
missing/retry-due state
  → Genius search
      → acceptable hit: persist and return
      → miss or non-abort failure: bounded MusicBrainz lyrics relation fallback
          → hit: persist and return
          → confirmed dual miss: expiring negative state
          → failure: retryable state
```

Keep/adjust existing Genius matching deliberately. Do not weaken exact-title/artist matching into accepting the first search hit without tests. Normalize punctuation/version/credit inputs consistently; retain query fingerprints so changed inputs can invalidate bad misses.

### MusicBrainz boundary

- Add a dedicated narrow adapter, e.g. `musicBrainzLyricsFallback`, which is the **only runtime consumer allowed to request MB Web Service data**.
- Use the known recording MBID from the local DB to request lyrics URL relations, including linked work relations when required. Do not do a remote catalogue/track search to identify recordings.
- If no trustworthy recording identity exists, return a safe unresolved outcome; do not reopen general MB metadata/search fallbacks.
- Whitelist relation type `lyrics` and validate external URL schemes/hosts according to the existing safe external-navigation policy. Prefer Genius links if multiple valid fallback relations exist.
- Keep required MB user-agent, global pacing/backoff, timeouts, abort support and bounded concurrency. Do not run dozens of recording/work requests simultaneously under the Genius concurrency limit.
- Group repeated recording requests; batch/coalesce fallback work where the API permits, without sacrificing identity matching.
- Apply per-job request/time budgets so a giant release (the mirror includes releases with thousands of tracks) cannot generate an unbounded MB fallback flood.
- Fallback failures must not block release rendering or destroy an existing successful URL.

The existing generic `fetchMusicBrainz`/HTTP infrastructure may be retained as a transport implementation behind this narrow adapter, but remove all other production imports/callers. Moving request-specific mapping utilities out of catalogue modules may be necessary so an innocent type import cannot reintroduce a remote service dependency.

## 7. Task and cache deletion checklist

### Remove

- MB-backed catalogue/search/tracklist request sessions and replay wrappers.
- Mobile generic request tasks used solely to orchestrate now-local category/release HTTP calls; keep normal auth/network error handling in the shared API client.
- `getReleaseTracks` route/use case/wire response and mobile retry/poll recreation references.
- Legacy v1/v2 presenters, dual planner implementation, contract-namespace branching, old response/cache unpackers and old server aliases.
- Zero-result/typo Web Service fallbacks and API recording-search cache.
- Redis mirror-tracklist copies and API-tracklist refresh to pre-seed lyrics.
- Runtime Redis lyrics-result persistence after sidecar cutover.
- MB-based provider-link discovery and remote entity-existence cleanup.

### Keep or simplify, not blindly remove

- Artwork provider/lyrics jobs, dedupe, bounded queues, cancellation and durable task completion where still necessary.
- Redis/Dapr for job state, distributed locks, provider/global rate-limit/backoff and unrelated user/auth state.
- Mobile immediate-result maps and bounded in-memory image/lyrics state.
- Current artwork mirror state (`entity_images`, `image_services`), provider refresh and the preserved artwork export.
- Cache/in-flight dedupe for genuine external work, not blanket copies of local catalogue data.
- Missing-data/503/error distinctions, explicit catalogue completeness, ID redirects, and auth/security checks.

Do not remove all tasks just because MB catalogue requests disappear: current server `BackgroundTaskType` jobs are predominantly artwork/lyrics, not remote catalogue retrieval. Trace each caller before deleting it. Simplification should remove actual redundant paths rather than replace proven enrichment machinery with another elaborate framework.

## 8. Key code areas to inspect

Server:

```text
src/index.ts
src/routes.ts
src/api/{v1Routes,v2Routes,useCaseVariants,assetPlanners}.ts
src/features/artists/{usecases/searchAll,infrastructure/artistDependencies}.ts
src/features/releases/{ports,releaseRoutes,releaseUseCases}.ts
src/features/releases/handlers/releaseHandlers.ts
src/features/releases/usecases/{getRelease,getReleaseTracks,getReleaseGroupReleases,verifyReleaseExistence}.ts
src/features/releases/infrastructure/musicBrainzReleaseCatalog.ts
src/infrastructure/musicDb/{musicDbClient,musicDbQueries,musicDbRepositories,recordingQueries,tracksReadiness,withMusicDb}.ts
src/services/musicbrainz/*
src/services/search/zeroResultApiFallback.ts
src/services/coverArt/{providerLinks,coverArtLookup}.ts
src/services/backgroundAssets/*
src/services/tasks/workers/trackLyricsTaskWorker.ts
src/services/musicApi/{geniusClient,musicBrainzClient,rateLimiter,httpClient}.ts
src/services/cache/{assetCache,partitionCachedAssets,ttlPolicy}.ts
src/features/releases/domain/releaseTaskPayloads.ts
src/utils/types/{taskTypes,cacheTypes}.ts
src/services/firebase/* (canonical-state migration boundaries only)
```

Mobile/shared:

```text
packages/shared/models/models.ts
apps/mobile/src/config/{env,envParsing}.ts
apps/mobile/src/types/apiTypes.ts
apps/mobile/src/services/api/*
apps/mobile/src/features/search/hooks/useUnifiedSearch.ts
apps/mobile/src/features/release/{api,model,state,hooks,components,domain}/*
apps/mobile/src/shared/taskResults/*
apps/mobile/src/services/notifications/*
```

Paths are a starting map, not a mandate to rewrite every file. Run reference searches for all removed endpoint/version/task names and for every production MB transport import.

## 9. Implementation order and checkpoints

1. Inventory current routes, MB Web Service callers, request tasks, enrichment jobs and caches. Record what is removed versus retained.
2. Define one v3 wire contract, canonical state policy and explicit error semantics; add failing contract tests.
3. Implement strict required-mirror startup/repository semantics and remove non-lyrics MB consumers, including provider-link/existence paths.
4. Unify release data in one DB snapshot and endpoint; update mobile loading/reducers/API types and enrichment replay. Simplify the release-group request/navigation/cover-planning flow as specified in section 4A without loading every edition's tracks.
5. Implement application lyrics store schema/repository, durable identity/variants, provider state semantics and bounded housekeeping. Add previewable migration/initialization tests; do not apply production migrations automatically during feature tests.
6. Implement Genius → MB lyrics-only adapter fallback and worker integration; remove lyrics-result Redis dual path and daily MB tracklist reseeding.
7. Simplify search orchestration, category response independence, cancellation and enrichment planning. Measure before adding worker-thread SQL parallelism.
8. Remove old version/runtime branches and dead modules only after all call sites have moved. Handle stored-state normalization with a controlled one-time migration, not data loss.
9. Run focused/full validation and inspect the diff/import graph. Update docs/config examples and commit coherent changes locally.
10. Prepare coordinated v3 backend/mobile deployment and data-migration runbook. Do not execute the production rollout without explicit operator authorization.

## 10. Required verification

### Catalogue/API cutover

- Missing mirror/path/index/schema/readiness: explicit operational failure, zero MB requests.
- Healthy empty search: 200 empty, zero MB requests.
- Local entity miss: documented local not-found, no destructive global cleanup.
- Every production MB Web Service call is reachable only through lyrics fallback. Enforce with module-boundary/import tests plus mocked transport call assertions; grep alone is supporting evidence, not full proof.
- `/v3` auth, following, settings, catalogue, task results and notifications work; old versions do not transparently fall through.
- No v1/v2 presenter, obsolete endpoint, legacy planner or legacy cache payload is reachable in supported runtime code.

### Search

- Categories render independently; a slow/erroring recording query does not prevent already-completed artist/group results from displaying.
- Pagination/candidate ceilings/order stable; no upstream retry on zero results.
- Cancellation and rapid query changes discard stale results without leaking busy states.
- Artist/group/recording broad-term work and memory bounded; query plans use expected indexes.
- If workers are introduced, test pool exhaustion, errors/shutdown and concurrent mirror sync reads.

### Unified release/mobile

- One release request returns metadata plus ordered multi-medium tracks and credits.
- Compacted title/credit fallback retained; repeated recordings have distinct track UI IDs.
- Valid empty releases distinguish from DB failure/incomplete state.
- No separate tracks request/loading/retry banner remains.
- Lyrics/images update progressively without clearing selection or overwriting current release data.
- Cold artwork/lyrics provider delays cannot withhold the local tracklist.

### Lyrics and persistence

- Stored hit skips upstream calls.
- Genius hit does not call MB.
- Genius miss/failure invokes MB fallback only; cancellation does not.
- MB hit persists correct identity/provider; dual confirmed miss versus transient failure have distinct expiry/retry state.
- Cross-release reuse, track title/credit variants, repeated recordings, missing recording ID and synthetic track mapping tested.
- Concurrent lookup dedupe and short DB writes; provider calls never hold DB write transactions.
- Mirror recording sync/merge/prune/replacement cannot erase sidecar results.
- MBID redirects/canonicalization tested.
- Storage stats, row growth, WAL recovery/checkpoint and previewed retention verified on a representative sample.
- One-time legacy state/cache migrations tested for idempotence, silent notification baselines and preserving unresolved records; no legacy runtime fallback remains afterward.

### Canonical project validation

Inspect package scripts first. Existing canonical commands include:

```bash
npm run verify --prefix apps/server
npm run verify --prefix apps/mobile
```

Use the server emulator workflow where actual Firebase state migration/integration needs it. Use the canonical mobile build/doctor and authorized device/UI workflow before release, not ad-hoc install commands. Report exactly what ran, what passed/failed and what was not tested. `Promise.all`, unit tests and a SQL plan do not prove production throughput.

## 11. Coordinated release/runbook (not executed by this plan)

- Recheck current server/mobile versions; choose the next versions then. API namespace `v3` is separate from package semver.
- Preview/apply approved app-owned lyrics initialization/state migration with backups; do not touch artwork exports or mirror schema.
- Ship a mobile build configured for `/v3` and the one-release-request contract, coordinated with the backend v3 switch. Downtime is acceptable to this sole user; do not implement legacy compatibility to avoid the maintenance window.
- Verify login/following/feed/search/release/share/deep links, persisted artwork and provider fallback outcomes on the installed app.
- Old app versions stop working on retired API routes by design; document the required upgrade and do not hide this behind silent fallback.
- Retain rollback artifacts/backups as operational safety, not concurrent legacy production code. A rollback restores a whole known-compatible app/backend/data configuration, not a half-old API route mix.
- No automated deletion of the preserved image backfill, artwork exports, signing data, secrets or Redis database.

## Definition of done

Catalogue/search/tracks are SQLite-only and explicitly required; MB Web Service exists only as Genius lyrics fallback. Release data arrives in one request with no separate tracks loader. The release-group screen has one SQLite-backed data-loading path, immediate edition metadata/artwork state, and only genuine artwork enrichment jobs—no MB catalogue paging/session or legacy route-payload fallback. Persistent on-demand lyrics survive sync and DB replacement without duplicate per-release Redis storage. Search remains responsive with measured, bounded work, not fake async SQL parallelism. Only the v3 runtime/client contract remains, with one-time state migration rather than permanent legacy branches. Focused/full validation and the coordinated release runbook document real evidence and remaining limits.
