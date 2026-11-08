# SQLite Image Store Completion, Cache Consolidation & Lyrics Plan

Status: **Approved design — ready for implementation (no code changes applied yet)**

---

## Goals

1. **Single Source of Truth for Artwork (`mb.db` `entity_images`):** Stop duplicating backfilled/resolved artist, release, and release-group images in Redis; read inline from SQLite and write live resolutions straight back to SQLite.
2. **Clear TTL, Permanence & Eventual-Consistency Rules:** Never block a client on timestamp re-checks; only return a live `taskId` when an entity has **never** been checked yet (`pending` or absent in `entity_images`).
3. **Broken CDN Link Auto-Repair:** Detect and replace/clear `entity_images` rows whose upstream image URL was deleted (`404`/`403`/`410`).
4. **MusicBrainz Lyrics `url-rels` / `work-rels` First, Genius Search Fallback:** Extract lyrics links from the existing `POST /getReleaseTracks` MusicBrainz response at **zero** extra MusicBrainz API cost before falling back to Genius search.
5. **Redis Cache Cleanup & Optimal TTLs / Eviction:** Remove all obsolete mirror-backed cache keys and tune Redis TTLs and eviction policy for the remaining rate-limited items.

---

## Phase 1: `mb.db` (`entity_images`) as the Sole Artwork Store & Eventual Consistency

### 1.1 Read-Write SQLite Upsert on the Server
- **Files:** `apps/server/src/infrastructure/musicDb/musicDbClient.ts`, `apps/server/src/infrastructure/musicDb/entityImageRepository.ts`
- Add a lazy write-capable SQLite handle (`WAL` mode, `synchronous = NORMAL`, `busy_timeout = 5000`) used strictly for `entity_images` upserts (`writeEntityImage` / `writeEntityImages`) and group propagation (`RefreshReleaseGroupImages`-equivalent update).
- Token extraction helpers convert resolved full URLs back into compact `image_services` tokens:
  - `caa_rel` (`2`): `<releaseMbid>`
  - `caa_rg` (`3`): `<releaseGroupMbid>`
  - `deezer` (`4`): path after `https://cdn-images.dzcdn.net/images/`
  - `tidal` (`5`): path after `https://resources.tidal.com/images/`
  - `discogs` (`6`): full Discogs image URI
  - `none` (`0`): `''`

### 1.2 Freshness, Permanence & Eventual-Consistency Matrix

| Entity & Current `entity_images` State | Client Response (Immediate) | Live `taskId`? | Background Action |
|---|---|---|---|
| **Never checked** (`service_id = 1 'pending'` or no row in `entity_images`) | Omitted from `resolved` (shows loading shimmer) | **Yes (`taskId`)** — client receives image live when task finishes | Foreground/task worker resolves provider chain and writes row to `entity_images` (`fetched_at = now`). |
| **Artist with stored image** (`service_id IN (4, 5, 6)`), age `<= 60 days` | Stored `url` inline (`0 ms`) | **No (`null`)** | None. |
| **Artist with stored image** (`service_id IN (4, 5, 6)`), age `> 60 days` | Stored `url` inline (`0 ms`, **eventual consistency**) | **No (`null`)** | Detached fire-and-forget re-check updates `entity_images` (`fetched_at = now`) for future requests. |
| **Artist confirmed miss with links** (`service_id = 0`, `fetched_at > 0`), age `> 24 hours` | `null` inline (`0 ms`, **eventual consistency**, no spinner) | **No (`null`)** | Detached fire-and-forget re-check; if found, writes image; if still missing, sets `fetched_at = 0` (permanent until `mbforge sync` sees a MusicBrainz edit). |
| **Release or Release Group with direct cover** (`service_id IN (2, 3, 4, 5)`) | Stored `url` inline (`0 ms`) | **No (`null`)** | **Permanent** — never refetched by timer (only via `/invalidateEntityImage` on CDN 404 or `mbforge sync`). |
| **Release with no direct cover (`service_id = 0`), inheriting `release_group` cover** | `release_group` fallback `url` inline (`0 ms`, **eventual consistency**) | **No (`null`)** | If `release.fetched_at > 0` and age `> 24 hours`: detached check for a *direct* cover on that specific `releaseId` only. If found, upgrades `release` row; if not, sets `release.fetched_at = 0` (permanent) and keeps serving the group cover forever. |
| **Release / Release Group with no cover anywhere** (`service_id = 0` on both), `fetched_at > 0` and age `> 24 hours` | `null` inline (`0 ms`, **eventual consistency**, no spinner) | **No (`null`)** | Detached fire-and-forget re-check once; if still missing, sets `fetched_at = 0` (permanent until `mbforge sync` updates the entity). |
| **Confirmed miss with no links (`service_id = 0`, `fetched_at = 0`)** | `null` inline (`0 ms`) | **No (`null`)** | **Permanent** until `mbforge sync` receives a MusicBrainz edit adding CAA or streaming links. |
| **Transient provider error (`429`, `5xx`, network error)** | Omitted / retried | — | Row remains **`service_id = 1 ('pending')`** (never written as `none`); retried after the 5-minute transient retry window or next pass. |

### 1.3 Switch Asset Partitioning & Task Workers Away from Redis
- **Files:**
  - `apps/server/src/services/cache/partitionCachedAssets.ts`
  - `apps/server/src/services/coverArtService.ts`
  - `apps/server/src/services/coverArt/coverArtCache.ts`
  - `apps/server/src/services/tasks/workers/artistProfileImageTaskWorker.ts`
  - `apps/server/src/services/tasks/workers/artistProfileImageCacheSync.ts`
  - `apps/server/src/services/tasks/workers/coverTaskWorker.ts`
- `partitionArtistProfileImages`, `partitionArtistReleaseGroupCovers`, and `partitionReleaseGroupReleaseCovers` batch-query `readEntityImages` from `mb.db` instead of Redis, applying the matrix in §1.2 and scheduling detached background revalidations (`services/backgroundAssets/entityImageRevalidator.ts`, deduped in-flight) when stale.
- When `musicDbHasEntityImages()` is `true`, `coverArtService.ts` and `artistProfileImageTaskWorker.ts` read/write `entity_images` in `mb.db` and **never** read or write Redis image keys (`<id>_artistImages`, `asset:artist-image:*`, `asset:group-cover:*`, `asset:release-cover:*`).
- Audit and remove dead/redundant Redis catalog cache usages when the mirror is active (`artistDetails`, `artistReleases`, `releaseGroupReleases`, `releaseGroupReleaseCovers`, `artistProfileImageCacheSync.ts`), keeping API-cache paths strictly as fallbacks when `isMusicDbEnabled() === false`.

---

## Phase 2: Broken CDN Image Auto-Repair (`POST /invalidateEntityImage`)

1. **Server Endpoint (`POST /invalidateEntityImage`):**
   - **Files:** `apps/server/src/features/artists/handlers/...` or dedicated `apps/server/src/features/assets/invalidateEntityImage.ts` mounted on v1/v2 routes.
   - Request body: `{ entityType: 'artist' | 'release' | 'release_group', entityId: string }`.
   - Deduplicated per `(entityType, entityId)` with an in-memory cooldown (e.g. 5 minutes) so repeated client mounts cannot trigger duplicate probes.
   - Reads the stored row from `entity_images`. If it holds a resolved URL:
     - Sends a `HEAD` probe to that exact CDN URL.
     - **If `200 OK` or transient `5xx`/timeout:** keeps the row untouched (prevents a client's dropped Wi-Fi from wiping valid artwork) and returns `{ invalidated: false, url: currentUrl }`.
     - **If `404` / `403` / `410` (confirmed deleted upstream):** re-runs the provider chain (`Deezer → Tidal → Discogs` for artists; `Deezer → Tidal → CAA` for releases/groups) excluding the broken URL, writes the new state (new provider token or `none`) into `entity_images`, and returns `{ invalidated: true, url: nextUrl }`.
2. **Mobile Auto-Report on Load Failure:**
   - **Files:** `apps/mobile/src/components/CachedImage.tsx`, `apps/mobile/src/components/ResponsiveHeaderImage.tsx` (and `CacheContext`).
   - Optional `(entityType, entityId)` props on image components; on `<Image onError>`, calls `POST /invalidateEntityImage` at most once per `(entityType, entityId)` per app session and updates `CacheContext` / component state if a replacement URL (or `null`) is returned.

---

## Phase 3: MusicBrainz Lyrics `url-rels` / `work-rels` + Genius Fallback

1. **Zero-Extra-Call Lyrics Extraction in `getReleaseTracks`:**
   - **Files:** `apps/server/src/services/musicbrainz/releaseLookup.ts`, `apps/server/src/infrastructure/musicbrainz/musicbrainzMapper.ts`, `packages/shared/models/models.ts`
   - Update `fetchTracklistFromApi` in `releaseLookup.ts` from:
     `/release/${releaseId}?fmt=json&inc=recordings+artist-credits`
     to:
     `/release/${releaseId}?fmt=json&inc=recordings+artist-credits+recording-level-rels+work-rels+work-level-rels+url-rels`
     (**0 additional MusicBrainz API requests**).
   - Extract lyrics URLs from each track's `recording.relations` and nested `recording.relations[target-type="work"].work.relations` matching `type === 'lyrics'` or `type-id === 'e38e65aa-75e0-42ba-ace0-072aeb91a538'`:
     - **Priority 1:** `genius.com` lyrics URL (matches Pawify's primary lyrics provider).
     - **Priority 2:** First valid `https://` whitelisted MusicBrainz lyrics URL (Musixmatch, LyricsWiki, etc.).
     - **Priority 3 (Fallback):** Existing `fetchGeniusLyrics(artistName, trackName)` background task for tracks where MusicBrainz had no lyrics relation.
2. **Immediate Resolution in `createGetReleaseTracksUseCase`:**
   - **Files:** `apps/server/src/features/releases/usecases/getReleaseTracks.ts`, `apps/server/src/services/cache/partitionCachedAssets.ts`
   - Pre-populate `trackLyrics[track.id]` with any MusicBrainz-supplied lyrics URL (and persist to `asset:lyrics:{releaseId}:{trackId}` in Redis) **before** partitioning pending Genius tasks, so tracks with MusicBrainz lyrics resolve in `0 ms` with zero Genius API calls.

---

## Phase 4: Redis Cache Purge, Optimal TTLs & Eviction Policy

### 4.1 One-Time Purge of Obsolete Redis Keys
- On deploy (and via a safe startup/maintenance helper when `musicDbHasEntityImages()` is `true`), delete obsolete Redis keys matching:
  - `*artistImages*`, `*asset:artist-image:*`, `*asset:group-cover:*`, `*asset:release-cover:*`
  - `*artistDetails*`, `*artistReleases*`, `*releaseGroupReleases*`, `*releaseGroupReleaseCovers*`

### 4.2 Remaining Redis Data, TTLs & Eviction Policy
- **Redis Eviction Policy (`apps/server/docker-compose.yml`):**
  - Keep `--maxmemory 128mb` (160mb on prod) and switch default `REDIS_MAXMEMORY_POLICY` from `allkeys-lru` to **`volatile-lru`** so non-expiring shared state (`rate_limit:*` token buckets) can **never** be evicted under cache pressure, while all TTL-bearing cache entries evict least-recently-used first.
- **Optimal TTLs (`apps/server/src/config/runtimeConfig.ts`, `.env.*.example`):**
  - **Rate-limit token buckets (`rate_limit:{provider}`):** No TTL (protected by `volatile-lru`).
  - **Track lyrics (`asset:lyrics:{releaseId}:{trackId}`):**
    - Success: **90 days** (`2160h`)
    - Confirmed miss: **7 days** (`168h`)
    - Transient failure retry window: **5 minutes**
  - **Release tracklists (`release:tracks:{releaseId}`):** **30 days** (`720h`, cached only when `media.length > 0`) — eliminates repeat 1 req/s MusicBrainz API calls when reopening a release.
  - **Track search (`search:tracks:{normalizedQuery}:{offset}:{limit}`):** **24 hours** (`24h`) — eliminates repeat 1 req/s MusicBrainz API calls on repeated track searches.
  - **Zero-result search API typo fallback (`search:mb-fallback:{kind}:{query}:{limit}`):** **6 hours** for non-empty results, **1 hour** for empty results.
  - **New-release scan dedupe (`releaseScan:*`):** **2 hours** (unchanged).

---

## Verification Checklist

1. **Unit & Integration Tests (`apps/server` & `apps/mobile`):**
   - Partitioning from `entity_images` returns immediate URLs / `null`s with `taskId: null` and zero Redis reads/writes.
   - Stale artist image (`> 60d`), stale confirmed miss (`> 24h`), and release inheriting group cover all return immediately (`0 ms`, `taskId: null`) while triggering background SQLite updates (and marking `fetched_at = 0` after the one-time miss re-check).
   - `/invalidateEntityImage` keeps rows when CDN returns `200`/`503` and replaces/clears rows when CDN returns `404`/`410`.
   - `getReleaseTracks` extracts recording & work `genius.com` / whitelisted lyrics `url-rels` without calling `fetchGeniusLyrics`, falling back to Genius only for remaining tracks, and caches tracklists in Redis.
   - `searchRecordings` caches track search pages in Redis (`24h`).
2. **Full Suite & Deployment Check:**
   - `apps/server`: `npm run verify` + Prettier check clean.
   - `apps/mobile`: `npx tsc --noEmit` + `npx vitest run` clean.
   - Verify on VPS after deploy that Redis `DBSIZE` drops to only `rate_limit:*` + `asset:lyrics:*` + `release:tracks:*` + `search:*` keys and zero image keys are written on page loads.
