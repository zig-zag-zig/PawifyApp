# MusicBrainz SQLite Migration Plan

**Status:** Implemented in full on branch `feat/sqlite-music-metadata`. Remaining
items are a small number of measured follow-ups listed under "Known follow-ups".

This document is the source-of-truth plan for migrating Pawify's server from
MusicBrainz API metadata reads to the local MusicBrainz SQLite subset, while
keeping release tracklists API-only.

## Goals

- Use the local MusicBrainz SQLite mirror for static MusicBrainz metadata.
- Fetch tracklists from MusicBrainz only when opening a release screen.
- Stop fetching recordings/tracks during daily new-release detection.
- Preserve useful release notifications without notifying for every noisy
  MusicBrainz pressing.
- Keep provider-derived artwork and lyrics in a small, correctly-expiring cache.
- Avoid blocking the server on unbounded SQLite search or artwork work.
- Keep the mobile client simple: it receives resolved assets immediately and
  resolves pending assets through existing background-task results.

## Explicit non-goals

- No image URLs or provider artwork state in the MusicBrainz SQLite database.
- No client-side Deezer, Tidal, CAA, or provider fallback logic.
- No worker-thread SQLite implementation unless measurements prove that bounded
  synchronous queries are insufficient.
- No mobile changes are required for the server migration unless real HTTP
  pagination consumption or notification navigation is explicitly implemented
  later.

---

## Current status

### Completed and verified

- [x] Built the private `pawify_mb_sqlite` fork and deployed the mirror on the VPS.
- [x] Removed `tracks` and `track_artists` from the mirror.
- [x] Added read-only SQLite access with a reader-contract/schema assertion.
- [x] Migrated artist details, artist search, release-group search, artist
  release-group listings, release-group releases, release metadata, and release
  existence reads to mirror-first behavior.
- [x] Kept release tracklists API-only on release-screen open.
- [x] Added safe MusicBrainz API fallback when the mirror is missing or fails.
- [x] Removed `MUSIC_DB_MODE` and `MUSIC_DB_FALLBACK_TO_API`; the mirror is the
  production source, not a feature toggle.
- [x] Added a safety cap for pathological artist catalogs
  (`MUSIC_DB_MAX_ARTIST_RELEASE_GROUPS`, default 1000).
- [x] Tested the real 13.7 GB mirror inside the local Docker image with Dapr,
  Redis, and Firebase emulators.
- [x] Removed recordings/track fetching from the daily new-release scan.
- [x] Added release-group cataloging and release-id → release-group-id migration.
- [x] Added `releaseGroupId` and `releaseCount` to feed/notification data.
- [x] Preserved the existing individual-notification cap and digest behavior.
- [x] Completed the task/upstream orchestration review.
- [x] Agreed on bounded local-search behavior rather than worker threads.
- [x] Agreed on the release artwork provider order: Deezer → Tidal → CAA.
- [x] Confirmed CAA slowness is primarily the CAA → Internet Archive redirect/
  storage path, not an application rate limit.
- [x] Confirmed Deezer's album placeholder behavior through website DevTools.

### Implemented after the design phase

- [x] 45-day release-group notification events with silent baseline migration.
- [x] Deezer → Tidal → Cover Art Archive artwork chain (releases and groups).
- [x] Deterministic Deezer album placeholder rejection (verified via DevTools).
- [x] Bulk provider-relation loading from SQLite (one query per page, not per release).
- [x] Artwork task fan-out flattened; artist-page group covers resolve once per group.
- [x] Artist profile-image provider links read from the mirror instead of the
  MusicBrainz API (removes a 1 req/s API call per artist).
- [x] Bounded search work budget (capped count, no ranking for broad queries).
- [x] Keyset pagination for artist release groups (v2 contract).
- [x] Per-entity asset cache keys for covers and lyrics.
- [x] Static metadata Redis caches removed (notification catalog, artist details
  used by the notification path).

### Verification already performed

- Full server tests passed at the latest checkpoint: **711/711**.
- Typecheck passed.
- Docker image built successfully with `better-sqlite3` 12.11.1.
- Real-mirror endpoint checks showed mirror-mode latencies in the normal path of
  roughly 2–100 ms for metadata/search/existence operations; release-screen
  latency remains dominated by its intentional MusicBrainz tracklist request.
- Real-data migration checks showed legacy release-id histories translate to
  release groups without re-notifying existing groups.
- Various Artists exposed the need for a hard catalog cap; an unbounded request
  previously caused a Node heap OOM, while a capped request returned 1000 groups
  successfully.

---

## Final decisions

### 1. Static metadata source

SQLite is authoritative for static MusicBrainz metadata:

- artists, aliases, relations, and external links;
- release groups;
- releases and artist credits;
- artist release-group listings;
- release-group release lists;
- provider URL relations used to discover artwork candidates.

The API remains a failure fallback for missing/unavailable mirror data. This is
not configurable with a mode flag.

### 2. Tracklists

Tracks are not stored in SQLite. A release-screen request makes the existing
MusicBrainz API call for the tracklist. No other flow fetches tracks.

### 3. New-release notification identity

The wrong behavior is **not** "one release group once forever" and it is also
not "every release id notifies".

Final model:

> **One notification per release-group release event, with a fixed 45-day event
> window.**

Rules:

- The first observed release event for a group notifies.
- Releases within 45 days of the last notified event are the same event.
- Suppressed releases do not extend the event window.
- A release more than 45 days after the last notified event can notify again.
- This allows legitimate later deluxe/remaster/new streaming releases to notify
  while suppressing common pressing/territory noise.
- Streaming-link availability does not create a notification by itself.
- The existing push cap/digest remains unchanged.

Notification state must be separate from the known group set:

```text
known group state:
  user / artist / releaseGroupId

notification event state:
  user / artist / releaseGroupId
  lastNotifiedEventDate
  representativeReleaseId
```

Migration must be silent and idempotent:

- translate old release ids to group ids;
- baseline the currently observed catalog/event state without notifying;
- preserve future event detection;
- never re-notify solely because the schema/state representation changed.

Feed/notification entries retain a representative `releaseId` and add:

```text
releaseGroupId
releaseCount
```

Old clients can continue using the release id. No mobile change is required for
this server-side payload addition.

### 4. Artwork provider chain

For release and release-group artwork:

```text
Deezer album artwork → Tidal album artwork → Cover Art Archive
```

For a release:

1. read Deezer/Tidal relation URLs from SQLite;
2. try Deezer album artwork;
3. try Tidal album artwork;
4. try CAA release artwork;
5. use release-group artwork if appropriate.

For a release group:

1. derive Deezer/Tidal candidates from the group's releases;
2. try Deezer;
3. try Tidal;
4. try CAA release-group artwork;
5. optionally use a release CAA image as the final fallback.

Provider outcomes use tri-state semantics:

- usable URL: success;
- confirmed no artwork: `null` plus confirmed-miss state, then next provider;
- transient failure: `undefined` plus retry timestamp, then next provider;
- known provider placeholder: confirmed miss, never a valid image.

CAA is the final fallback. A transient CAA redirect/storage failure should not
make the code wait on a second CAA probe before trying Deezer/Tidal.

#### Deezer album placeholder handling

DevTools confirmed two Deezer cover placeholder URL forms:

```text
https://cdn-images.dzcdn.net/images/cover/d41d8cd98f00b204e9800998ecf8427e/264x264-000000-80-0-0.jpg
https://cdn-images.dzcdn.net/images/cover//500x500.jpg
```

The implementation must reject the placeholder by cover path/hash, not by one
specific size:

- reject empty/missing album cover fields;
- reject `/images/cover//...`;
- reject the known empty-image hash
  `d41d8cd98f00b204e9800998ecf8427e` under `/images/cover/`;
- continue to Tidal, then CAA;
- do not cache the placeholder as a successful cover.

Tidal album placeholder behavior still needs the same runtime validation if its
API returns a default artwork URL; do not guess a Tidal placeholder hash.

### 5. Artwork/task orchestration

The generic background task runtime is retained. It already provides useful
cancellation, dedupe, composite tasks, partial results, bounded workers, and
client task-result resolution.

The artwork path will be redesigned selectively:

- bulk-load provider relations from SQLite instead of one query per release;
- flatten artwork work into artwork items rather than multiplying nested
  task/page/group/release concurrency;
- dedupe provider lookups by provider URL/id;
- resolve one cover per release group for artist-page group covers;
- resolve per-release covers only on flows that display release-level covers;
- keep artist providers serial per artist (`Deezer → Tidal → Discogs`) but process
  different artists concurrently;
- keep provider-specific limiter boundaries;
- do not blindly change the generic task chunk size or add new environment knobs
  until measured after the provider-chain redesign.

The mobile client keeps its current model:

```text
immediate cached/resolved values + background task id for pending values
```

The client must not call artwork providers directly.

### 6. Cache source and scope

SQLite:

- all static MusicBrainz metadata;
- provider relation URLs.

Redis/Dapr state:

```text
asset:artist-image:{artistId}
asset:group-cover:{releaseGroupId}
asset:release-cover:{releaseId}
asset:lyrics:{releaseId}:{trackId}
```

Also keep task state, locks, and other shared transient/provider state.

In-process memory is limited to in-flight request coalescing and small bounded
per-run dedupe; do not add a large metadata cache on the 2 GB VPS.

Do **not** store resolved image URLs, image providers, image check timestamps, or
artwork state in the MusicBrainz SQLite database. Provider artwork has separate
TTL, failure, placeholder, and invalidation semantics and is not source data from
MusicBrainz.

### 7. Cache value shape and TTLs

Use small per-entity values, not whole aggregate objects.

Artwork state:

```ts
{
  url: string | null,
  confirmedMiss?: boolean,
  nextRefetchAt?: number
}
```

Artist image state may also retain `refreshedAt`.

Lyrics state uses the same small per-track shape.

Proposed defaults:

| Asset | Success TTL | Confirmed miss TTL | Transient retry |
| --- | ---: | ---: | ---: |
| artist image | 30 days | 7 days | 5 minutes |
| release-group cover | 30 days | 7 days | 5 minutes |
| release cover | 30 days | 7 days | 5 minutes |
| lyrics found | 14 days | 7 days | 5 minutes |
| static MB metadata | no Redis cache; SQLite | — | API fallback |

Use bounded batched cache reads/writes. Do not perform uncontrolled one-network-
request-per-item cache reads for large pages.

### 8. Search work budget

No worker threads. Bound the work instead.

Narrow queries such as `lloyd banks`, `radiohead`, and `porcupine tree` retain:

- accurate count;
- BM25 relevance ordering;
- normal pagination.

Broad queries such as `a`, `the`, and `love` use:

- a match probe capped at 10,001;
- a reported count capped at 10,000;
- no unbounded BM25 ranking;
- bounded deterministic results and pagination.

Suggested constants:

```text
SEARCH_MAX_MATCHES = 10_000
SEARCH_MAX_COUNT_PROBE = 10_001
```

No mobile changes are required; the current client already uses `count` to decide
whether to request another page.

### 9. Artist-release pagination

The current 1000-group cap is a safety guard, not real pagination.

Implement optional HTTP pagination with a keyset cursor, not `OFFSET`:

```sql
WHERE (
  first_release_date < ?
  OR (
    first_release_date = ?
    AND release_group_mbid < ?
  )
)
ORDER BY first_release_date DESC, release_group_mbid DESC
LIMIT ?
```

Return `nextCursor`, `hasMore`, and a safe total where practical. Preserve the
old response temporarily where possible. Updating the mobile artist screen to
consume subsequent pages is a separate client task.

---

## Implementation order

### Phase A — critical behavior and artwork

1. Implement the 45-day notification event state model and silent migration.
2. Implement Deezer album → Tidal album → CAA release/release-group covers.
3. Add deterministic Deezer album placeholder rejection.
4. Bulk-load provider relations from SQLite.
5. Flatten artwork task/subtask work and remove unnecessary nested concurrency.
6. Preserve current cache-first task/client behavior.

### Phase B — search

7. Implement bounded local search.
8. Test narrow and broad queries in local Docker against the real mirror.
9. Confirm health requests are not blocked by broad searches.

### Phase C — metadata cleanup and pagination

10. Implement artist-release keyset pagination.
11. Remove static MusicBrainz metadata Redis caches.
12. Remove or reduce the full notification release-group catalog Redis cache.
13. Convert aggregate artwork/lyrics cache maps to per-entity keys.
14. Add bounded batched cache reads/writes.

### Phase D — verification

15. Run typecheck and the full server suite.
16. Run local Docker with Dapr, Redis, Firebase emulators, and the real mirror.
17. Test notification migration, same-event suppression, 45-day boundaries, and
    later-event notifications.
18. Test Deezer, Tidal, CAA, placeholder, confirmed-miss, and transient-failure
    paths.
19. Test artwork task dedupe, cancellation, concurrency, partial results, and
    client task-result resolution.
20. Test `a`, `the`, `love`, and normal search queries.
21. Test mirror-missing/API-fallback behavior.
22. Test pathological artist pagination and memory/event-loop behavior.
23. Audit remaining Redis keys and TTLs to confirm no static MB aggregate cache
    remains unintentionally.

## Current blockers before implementation continues

- Notification event state still needs implementation; the existing phase-2 code
  must not remain as lifetime one-group suppression.
- Artwork provider-chain and cache/task redesign are specified but not implemented.
- Search work budget is specified but not implemented.
- Real HTTP pagination and static metadata-cache removal remain phase-C work.

No image fields should be added to the MusicBrainz SQLite schema. No guessed
Deezer/Tidal placeholder values should be added beyond the confirmed Deezer album
placeholder rules above.


## Verified measurements (local Docker, real 13.7 GB mirror)

Search (event-loop cost of one query; the previous implementation ranked and counted
every match):

| Query | Before | After |
| --- | ---: | ---: |
| `lloyd banks` | 16 ms | 50 ms |
| `radiohead` | — | 30 ms |
| `porcupine tree` | — | 70 ms |
| `love` | 176 ms | 490 ms |
| `the` | 1163 ms | 240 ms |
| `a` | 3200 ms | ~1460 ms |

`love` rises because the budget probe scans once and then the page query scans again,
while the old code consulted its Redis cache. Broad queries still cost ~0.5-1.5 s
because the mirror's FTS table declares `entity_type` as `UNINDEXED`, so every search
scans matches for all entity types and filters afterwards.

Artist release groups (108 groups):

- cold, first request: ~50 ms
- warm, cache-first covers: 18 ms
- keyset pagination: 5 pages of 25, 108 unique groups, no overlap, identical to the
  unpaged first page.

Artwork (Lloyd Banks, 30 groups):

- first pass: 11 Deezer, 14 Cover Art Archive, rest reused from a cached group/release
- warm pass: all 30 resolved from cache immediately
- Redis key shape after the run: **108 `asset:group-cover:<id>` keys**, five
  `artistImages` keys, two rate-limit keys. No page-sized aggregate maps.

Lyrics: per-track key `asset:lyrics:<releaseId>:<trackId>` written by the worker
(verified for a single-track release, 818 ms including the Genius call).

## Known follow-ups (measured, not blocking)

1. **`entity_type` is unindexed in the mirror's FTS table.** This is why a
   single-letter search still costs ~1.5 s: the query scans every entity type's
   matches and discards the rest. Adding `entity_type` to the index (or splitting
   into per-entity FTS tables) in `pawify_mb_sqlite` removes the post-filter scan.
   App-side bounding already prevents the previous 3.2 s worst case.
2. **Tidal album placeholder** is not yet identified. The Deezer album placeholder is
   handled deterministically; if Tidal returns a default album cover for artwork-less
   albums, capture the URL from a real case and add it to
   `isDeezerPlaceholderAlbumCover`'s Tidal counterpart.
3. **Mobile pagination consumption.** The v2 endpoint serves keyset pages, but the
   artist screen still reads whatever page the server returns; consuming `nextCursor`
   is a separate client change and is not required for correctness.
4. **`artistDetails` Redis cache** remains for the MusicBrainz API fallback path
   only; it is not populated or read on the normal mirror path.
