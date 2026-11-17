# syntax=docker/dockerfile:1

# ---- build: install the whole workspace, build core, server and web ----
FROM node:24-alpine AS build
RUN npm install -g pnpm@10.15.1
WORKDIR /app

# Manifests first, so dependency layers are cached until a package.json changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY packages packages
COPY apps apps
RUN pnpm turbo run build --filter=@lag-switch/server --filter=@lag-switch/web

# A self-contained copy of the server with production dependencies only
# (core included, as a regular dependency).
RUN pnpm --filter @lag-switch/server deploy --prod --legacy /out

# ---- runtime: one small image, one process, one port ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST=/app/public
WORKDIR /app
COPY --from=build --chown=node:node /out ./
COPY --from=build --chown=node:node /app/apps/web/dist ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "--enable-source-maps", "dist/main.js"]
