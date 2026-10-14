# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS build

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile --prefer-offline
COPY . .
RUN pnpm build

FROM node:24-bookworm-slim AS runtime
ARG QIDIAN_VERSION
ENV NODE_ENV=production \
    QIDIAN_VERSION=${QIDIAN_VERSION} \
    PORT=9908 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    STATIC_DIR=/app/dist \
    MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/migrations ./migrations
COPY --from=build --chown=node:node /app/scripts/sqlite-adapter.mjs ./scripts/sqlite-adapter.mjs
RUN mkdir -p /data /run/qidian-update-inbox /run/qidian-update-status && chown node:node /data /run/qidian-update-inbox && chown root:root /run/qidian-update-status && chmod 755 /run/qidian-update-status
USER node
EXPOSE 9908
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('node:http').get('http://127.0.0.1:9908/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "server/selfhost.mjs"]
