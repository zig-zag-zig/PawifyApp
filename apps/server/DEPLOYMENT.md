# Pawify Docker/Dapr Deployment Notes

This repo is configured for a single Linux VPS running Docker Compose with a Pawify app container, a Dapr sidecar container, and Redis. Cloudflare Tunnel or any other reverse proxy stays on the VPS, outside this Docker stack.

## Host Route

Your VPS-level tunnel should point at:

```text
pawify-api.chi-chi.vip -> http://127.0.0.1:3001
```

Pawify listens on port `10000` inside the app container. Docker maps `127.0.0.1:3001 -> pawify:10000`; Dapr and Redis ports stay internal to the Compose project.

## Resource Limits

The Compose stack sets container caps for a small VPS:

| Service | Limit |
| --- | --- |
| App | `640m` memory, `1.25` CPUs, `--max-old-space-size=384` |
| Dapr sidecar | `192m` memory, `0.5` CPUs |
| Redis | `256m` memory, `0.5` CPUs, `160mb` maxmemory |

Redis uses `REDIS_MAXMEMORY_POLICY=allkeys-lru`, so cache pressure evicts old cache entries instead of letting Redis grow until the host is unhealthy. VPS Redis persistence stays enabled with `PAWIFY_REDIS_PERSISTENCE=true`. Local Docker can set `PAWIFY_REDIS_PERSISTENCE=false`.

Container logs use Docker's disk-efficient `local` driver with `PAWIFY_LOG_MAX_SIZE=2m`, `PAWIFY_LOG_MAX_FILE=30`, and `PAWIFY_LOG_COMPRESS=true`. Docker removes the oldest rotated file after the limit, bounding logs to roughly 60 MB per container before compression.

## Environment File

Create the ignored production env file from the example:

```bash
cp .env.prod.example .env.prod
```

Set at least:

- `REDIS_PASSWORD`
- Firebase config: `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON`
- `NOTIFY_API_KEY`
- Sentry values, if enabled

Keep `DAPR_APP_ID=pawify-api` unless you also update `dapr/components/resiliency.yaml` scopes.

## Secret Files

Create these ignored files:

```text
secrets/prod/dapr-secrets.json
secrets/prod/firebase-service-account.json
```

`dapr-secrets.json` shape:

```json
{
  "gmail-email": "your-gmail@gmail.com",
  "gmail-password": "your-gmail-app-password",
  "discogs-token": "optional-discogs-token",
  "tidal-token": "optional-tidal-token",
  "genius-access-token": "optional-genius-token"
}
```

`tidal-token` is optional, but Tidal is skipped without it. The server logs one
`optional provider credential missing` warning and falls through to Discogs, so
artist images keep resolving from the remaining providers. `TIDAL_API_TOKEN` is
an explicit environment override for the same credential and is read after the
Dapr secret. There is no built-in token: a missing or revoked credential shows up
as `tidalImageFoundCount: 0` in the artist-image batch summary (and HTTP 401 from
Tidal when the token itself is rejected), instead of silently borrowing a shared
credential.

`REDIS_PASSWORD` lives only in the environment file. Redis uses it when starting, and the Dapr sidecar reads the same env var through `dapr/components/env-secrets.yaml` for the Redis state and lock components.

Recommended permissions:

```bash
chmod 700 secrets secrets/prod
chmod 600 secrets/prod/*
```

## GitHub Actions Deploy

Pawify uses trunk-based deployment:

- Pull requests into `main` run CI and Docker image validation.
- Pushes to `main` build and push a GHCR image, then deploy production.
- Manual workflow runs from `main` redeploy production.
- There is no `develop` branch or test deploy path.

Deployment waits for CI to pass first:

```text
npm ci
npm run build
npm test --if-present
docker build
```

GitHub Actions builds the Docker image on the runner and pushes it to GitHub Container Registry. The VPS pulls that immutable image by SHA instead of building on the server, which keeps deploy-time memory and disk pressure lower.

Docker builds use Buildx with the GitHub Actions cache, so repeated PR and deploy builds can reuse unchanged Docker layers while still producing an image for the exact commit being checked or deployed.

Image tags:

```text
ghcr.io/<owner>/<repo>:sha-<commit-sha>
ghcr.io/<owner>/<repo>:prod
```

The workflow is [deploy.yml](/home/princesslighty/Code/Pawify/.github/workflows/deploy.yml). Configure these GitHub environment or repository secrets:

- `PAWIFY_VPS_HOST`: VPS hostname or IP.
- `PAWIFY_VPS_USER`: SSH user on the VPS.
- `PAWIFY_VPS_SSH_KEY`: private SSH key for that user.
- `PAWIFY_VPS_PORT`: optional SSH port. Defaults to `22` when empty.
- `PAWIFY_ENV_FILE_B64`: base64 of `.env.prod`.
- `PAWIFY_DAPR_SECRETS_JSON_B64`: base64 of `secrets/prod/dapr-secrets.json`.
- `PAWIFY_FIREBASE_SERVICE_ACCOUNT_JSON_B64`: base64 of `secrets/prod/firebase-service-account.json`.

Create the base64 values locally:

```bash
base64 -w 0 .env.prod
base64 -w 0 secrets/prod/dapr-secrets.json
base64 -w 0 secrets/prod/firebase-service-account.json
```

Configure these GitHub repository variables if needed:

- `PAWIFY_REPO_URL`: optional. Defaults to `https://github.com/<owner>/<repo>.git`.

For a private repository, prefer setting `PAWIFY_REPO_URL` to an SSH URL such as `git@github.com:zig-zag-zig/PawifyApp.git` and install the matching deploy key on the VPS, because the VPS performs the clone/pull.

The workflow uses `GITHUB_TOKEN` to push and pull GHCR images, so no separate container registry token is needed for the normal GitHub Actions deploy path. Repository workflow permissions must allow packages write access.

The SSH user must be able to run the deploy script with `sudo`. The cleanest setup is either root SSH for deploys or passwordless sudo for the deploy user.

In GitHub, create an environment named `production`. Add required reviewers to `production` if you want production deploys to wait for manual approval after CI passes.

The workflow decodes the three base64 secrets on the runner (failing fast with named errors if a secret is corrupt) and copies the decoded files to the VPS at `/home/<deploy-user>/pawify-prod-secrets/`:

```text
/home/deploy/pawify-prod-secrets/.env
/home/deploy/pawify-prod-secrets/dapr-secrets.json
/home/deploy/pawify-prod-secrets/firebase-service-account.json
```

The deploy script then copies those into the active checkout as `apps/server/.env.prod` and `apps/server/secrets/prod/*`, keeping backups before replacing files. Docker is installed automatically by the deploy script if the VPS is missing Docker or the Compose plugin.

## Manual VPS Deploy

The normal deploy path is GitHub Actions. A manual VPS run is only useful when
you already have a GHCR image tag to deploy:

```bash
sudo ./scripts/deploy_pawify_docker_dapr.sh \
  --repo-url https://github.com/zig-zag-zig/PawifyApp.git \
  --repo-branch main \
  --prebuilt-image ghcr.io/zig-zag-zig/pawifyapp:sha-<commit-sha> \
  --secrets-source-dir /home/deploy/pawify-prod-secrets
```

The deploy script does not build the app on the VPS. It installs Docker if
needed, pulls the prebuilt image, refreshes the runtime secret files from
`/home/deploy/pawify-prod-secrets`, and starts the production Compose stack
from `apps/server/docker-compose.yml`.

Manual commands inside the active checkout:

```bash
cd /srv/pawify-prod/apps/server
docker compose --env-file .env.prod ps
docker compose --env-file .env.prod logs -f --tail=100 pawify pawify-dapr redis
```

## Health Checks

```bash
cd /srv/pawify-prod/apps/server
docker compose --env-file .env.prod ps
curl http://127.0.0.1:3001/v1/health
docker compose --env-file .env.prod exec redis redis-cli -a "$(grep '^REDIS_PASSWORD=' .env.prod | cut -d= -f2-)" ping
docker compose --env-file .env.prod exec pawify-dapr wget -qO- http://localhost:3500/v1.0/metadata
```

## Local MusicBrainz Mirror (optional)

`MUSIC_DB_MODE=sqlite` serves artist details, artist search, release-group
search, artist release-group listings, release-group releases and release
metadata from a local SQLite mirror instead of the MusicBrainz API. Tracklists
are still fetched from the API when a release screen is opened, because the
mirror deliberately does not store tracks.

The mirror itself is built off-box by
[zig-zag-zig/pawify_mb_sqlite](https://github.com/zig-zag-zig/pawify_mb_sqlite)
and synced hourly on the host; this repository only reads it.

### Host layout

```bash
/home/deploy/pawify-mb/mb.db          # ~13.7 GB, written hourly by sync.sh
/home/deploy/pawify-mb/mb.db-wal      # WAL side files: must stay next to mb.db
/home/deploy/pawify-mb/mb.db-shm
```

The directory is mounted read-only at `/var/pawify/music`. The whole directory is
mounted, not just `mb.db`: the mirror is in WAL mode and SQLite needs the side
files present. Access was verified against the live mirror from inside the
container user (`uid 999`), which can read it without write permission.

### Enabling it

In the secret env file (`PAWIFY_ENV_FILE_B64`):

```dotenv
MUSIC_DB_MODE=sqlite
MUSIC_DB_PATH=/var/pawify/music/mb.db
PAWIFY_MUSIC_DB_DIR=/home/deploy/pawify-mb
MUSIC_DB_FALLBACK_TO_API=true
```

`PAWIFY_MUSIC_DB_DIR` is the host path used as the volume source; the deploy
script defaults it to `./music` when unset. Leaving `MUSIC_DB_MODE=api` keeps the
previous API-only behaviour, so a host without a mirror needs no extra setup.

### Behaviour and failure modes

- The mirror is opened lazily on first use, read-only, with the reader contract
  (`tables`, `columns`) asserted. A mirror from a different schema fails at
  startup with the exact missing column instead of a per-request error.
- A mirror miss (unknown id, no search index, mode off) quietly uses the API.
- A mirror *failure* (corrupt file, permission problem) is logged as a warning
  and then falls back to the API. Set `MUSIC_DB_FALLBACK_TO_API=false` to fail
  the request instead, which is what a canary rollout should use.
- `releaseExists` only trusts a *positive* answer from the mirror. A negative
  answer is re-checked against the API, because that endpoint deletes user state
  and the mirror can be up to an hour behind.
- Search needs the mirror's `search_fts` index (`mbforge search-index`). Without
  it search falls back to the API; nothing else is affected.

### Verifying on a running host

```bash
cd /srv/pawify-prod/apps/server
docker compose --env-file .env.prod exec pawify node -e "
const D=require('better-sqlite3');
const db=new D(process.env.MUSIC_DB_PATH,{readonly:true,fileMustExist:true});
console.log(db.prepare('select count(*) c from artists').get());
"
docker compose --env-file .env.prod logs pawify | grep 'MusicBrainz mirror'
```

The startup log line reports the path, whether the search index was found, and
the mirror's `_meta` (`replication_sequence`, `entities`, ...), which is what the
sync job advances.

## Redis Backup

Run a manual Redis backup:

```bash
cd /srv/pawify-prod/apps/server
PAWIFY_ENV_FILE=.env.prod sudo ./scripts/backup-redis-docker.sh
```

Suggested cron:

```cron
15 3 * * * cd /srv/pawify-prod/apps/server && PAWIFY_ENV_FILE=.env.prod ./scripts/backup-redis-docker.sh >> /srv/pawify-prod/backups/redis-backup.log 2>&1
```
