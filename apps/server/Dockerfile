# syntax=docker/dockerfile:1
#
# Pawify API image. Monorepo-aware: the build context must be the repository
# root (compose files set `context: ../..`, `dockerfile: apps/server/Dockerfile`).
# Compiles apps/server with @pawify/shared built first, mirroring local scripts.

# ---------- @pawify/shared deps + build ----------
FROM node:22-bookworm-slim AS shared-build
WORKDIR /repo/packages/shared
COPY packages/shared/package*.json ./
RUN npm ci --no-audit --no-fund
COPY packages/shared/ ./
RUN npm run build

# ---------- server deps ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /repo
# stub so npm can link the file: dependency before shared dist exists
RUN mkdir -p packages/shared/dist
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package*.json apps/server/
RUN npm ci --prefix apps/server --no-audit --no-fund

# ---------- server build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /repo
ENV NODE_ENV=development
COPY --from=deps /repo/apps/server/node_modules ./apps/server/node_modules
COPY packages/shared/ ./packages/shared/
COPY --from=shared-build /repo/packages/shared/dist ./packages/shared/dist
COPY apps/server/ ./apps/server/
WORKDIR /repo/apps/server
# typescript devDep of the server package resolves via its own node_modules
RUN ./node_modules/.bin/tsc

# ---------- runtime ----------
# NOTE: mirrors the monorepo layout (/app/apps/server + /app/packages/shared).
# npm ci resolves the `file:` dependency path recorded in the lockfile
# (../../packages/shared, relative to apps/server), so flattening to /app breaks it.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app/apps/server
ENV NODE_ENV=production

RUN groupadd --system nodeapp && useradd --system --gid nodeapp --home /app nodeapp

COPY packages/shared/package*.json /app/packages/shared/
COPY --from=shared-build /repo/packages/shared/dist /app/packages/shared/dist
COPY apps/server/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /repo/apps/server/lib ./lib
COPY --from=build /repo/apps/server/package.json ./

USER nodeapp
EXPOSE 10000
# Direct node entry (not `npm start`): the local prestart hook that rebuilds
# @pawify/shared does not apply inside the production image.
CMD ["node", "--enable-source-maps", "lib/index.js"]
