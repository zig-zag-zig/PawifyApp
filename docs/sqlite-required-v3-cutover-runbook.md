# SQLite-required v3 cutover runbook

Status: prepared, **not executed**. This runbook accompanies
`docs/sqlite-required-v3-hard-cutover-plan.md` and the `feat/sqlite-required-v3-cutover`
implementation. Do not deploy, publish, delete production state or reconfigure VPS
jobs from this document without explicit operator authorization.

## What changes

- The supported API contract is `/v3` only. `/v1` and `/v2` answer
  `410 API_VERSION_UNSUPPORTED`; unversioned legacy API paths are unsupported.
- Catalogue/search/tracks come only from the required local MusicBrainz SQLite
  mirror. Missing/unready mirror data fails readiness and returns `503`; there is
  no MusicBrainz Web Service catalogue fallback.
- `getRelease` returns metadata plus every media/track and persisted enrichment
  state in one request. `getReleaseTracks` is removed.
- The release-group screen loads one local snapshot with edition metadata; the
  artist page no longer prefetches editions or passes a route-carried payload.
- Persistent lyrics state lives in a separate application-owned SQLite file
  (`LYRICS_DB_PATH`). Genius is first; the only runtime MusicBrainz Web Service
  request is the narrow recording/work `lyrics`-relation fallback.
- Artwork Redis payloads and mirrored tracklist caches are gone. Redis/Dapr remain
  for task state, provider rate limits/backoff, notification locks and unrelated
  auth/user state.

## Pre-flight (operator)

1. Recheck `apps/server/package.json`, `apps/mobile/package.json` and `HEAD`; choose
   release versions then. API namespace `v3` is independent of package semver.
2. Confirm the mirror is healthy and ready:
   - `MUSIC_DB_PATH` points at the current mirror.
   - `_meta.track_data_state=ready`.
   - artist/release-group/recording FTS tables and `image_services`/`entity_images`
     exist.
   - `/ready` will answer `200` after the new server starts.
3. Create the lyrics store explicitly (preview first):

   ```bash
   cd /srv/pawify-prod/apps/server
   npm run lyrics:db:migrate -- --preview
   npm run lyrics:db:migrate -- --apply
   npm run lyrics:db:housekeeping   # optional retention preview
   ```

   Ensure `PAWIFY_LYRICS_DB_DIR` is a durable host directory writable by the
   container app uid and **not** inside the mirror replacement path.

4. Run the one-time canonical-state migration (preview first):

   ```bash
   cd /srv/pawify-prod/apps/server
   npm run state:migrate:canonical -- --preview
   npm run state:migrate:canonical -- --apply
   ```

   It rewrites legacy known-release scalar values to the canonical object
   baseline, resolves release-id keys through the mirror, and normalizes feed
   dates/group ids. A JSON backup is written before any write. Resolve reported
   unresolved/invalid records rather than passing `--force`, which must remain an
   explicit operator decision. After this migration the runtime no longer parses
   legacy scalar/date shapes.

5. Back up, as operational safety:
   - Firebase/RTDB state (following, known releases, feed, settings, tokens);
   - Redis (task state/backoff/locks);
   - the current backend image/config and mobile build artifact.
   Do **not** delete artwork exports, image backfill, signing data or secrets.

6. Decide the legacy lyric-cache outcome. This implementation does not migrate
   `asset:lyrics:*` Redis values: they are cache-only and are refetched on demand.
   Do not flush Redis; task/backoff state still lives there.

## Deploy

1. Deploy the backend branch with:
   - `MUSIC_DB_PATH` and `LYRICS_DB_PATH` configured;
   - `PAWIFY_MUSIC_DB_DIR` and `PAWIFY_LYRICS_DB_DIR` mounted;
   - the existing secret/notification configuration.
2. Watch startup for the mirror and lyrics DB open lines. The background-task
   registry is process-local, so the deployment restart expires pre-cutover
   in-flight tasks; all new dedupe keys are `v3:`-prefixed so old keys cannot be
   reused.
3. Build/install the mobile release configured for `EXPO_PUBLIC_API_VERSION=v3`
   (the client now refuses non-v3 values).
4. Coordinate the mobile install with the backend switch. Downtime is acceptable;
   there is deliberately no v2 compatibility layer.

## Verify

```bash
curl -fsS http://127.0.0.1:3001/health
curl -fsS http://127.0.0.1:3001/ready
```

In the installed app verify:

- login/session, following/unfollowing, artists feed;
- search categories load independently; stale query responses do not overwrite a
  newer query;
- release screen: one load, all media/tracks, lyric/image enrichment updates
  without clearing the selected track;
- release-group screen from artist, search, feed and a share/deep link;
- non-Official editions remain visible; partial dates retain precision;
- artwork appears from persisted mirror state; unresolved artwork fills in
  progressively without restarting catalogue loading;
- notification navigation and task-result polling/completion;
- old app builds receive the upgrade rejection rather than a broken half-contract.

Measurement commands (run on the serving host; they do not mutate production):

```bash
npm run lyrics:db:estimate -- --rows 10000
npm run benchmark:search
```

Recorded estimate on the implementation host: **545.18 bytes/row**, ~54.5 MB at
100k requested lookups, ~545 MB at 1M (URL/key/state only; add WAL headroom).
`benchmark:search` prints per-query latency/count plus event-loop p99/max delay.

Operational checks:

```bash
docker compose --env-file .env.prod exec pawify node -e "
const D=require('better-sqlite3');
const db=new D(process.env.LYRICS_DB_PATH,{readonly:true,fileMustExist:true});
console.log(db.prepare('select outcome, count(*) n from lyrics_lookup_state group by outcome').all());
"
```

## Rollback

Rollback restores a **whole known-compatible configuration**: previous backend
image, previous mobile APK and previous data/config state. Do not run a mixed
old-API/new-worker deployment. The lyrics sidecar can be left in place; it is
additive and does not modify the mirror.

## Remaining limits in this implementation

- `npm run benchmark:search` and `npm run lyrics:db:estimate` provide the
  measurement path. Recording search was batched (credits for the ranked window,
  releases for the page), but worker-thread SQL parallelism is intentionally not
  enabled before a real host measurement.
- Production mobile builds must supply `.env.production`; a tracked example is at
  `apps/mobile/.env.production.example`. The client rejects any value except `v3`.
- Legacy `asset:lyrics:*` cache entries are not migrated; they expire naturally
  and are refetched on demand.
- The required mirror currently ships no redirect table. Durable lyric state is
  keyed by recording MBID and retained; if a future mirror adds
  `mbid_redirects`/`recording_redirects`, the resolver follows it without deleting
  the old row.