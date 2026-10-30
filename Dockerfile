# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS build

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

# Keep dependency downloads cached across release-version bumps in package.json.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --frozen-lockfile
COPY package.json ./
RUN pnpm install --offline --frozen-lockfile

COPY index.html vite.config.js tsconfig.json ./
COPY public ./public
COPY src ./src
COPY shared ./shared
RUN pnpm build

# Prepare writable paths in the builder because Distroless has no shell.
RUN mkdir -p /qidian-runtime/data \
    /qidian-runtime/run/qidian-update-inbox \
    /qidian-runtime/run/qidian-update-status \
  && chmod 755 /qidian-runtime/run/qidian-update-status

FROM gcr.io/distroless/nodejs24-debian13:nonroot AS runtime
ARG QIDIAN_VERSION
ENV NODE_ENV=production \
    QIDIAN_VERSION=${QIDIAN_VERSION} \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    STATIC_DIR=/app/dist \
    MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY --from=build --chown=1000:1000 /app/dist ./dist
COPY --chown=1000:1000 package.json ./package.json
COPY --chown=1000:1000 server ./server
COPY --chown=1000:1000 shared ./shared
COPY --chown=1000:1000 migrations ./migrations
COPY --from=build --chown=1000:1000 /qidian-runtime/data /data
COPY --from=build --chown=1000:1000 /qidian-runtime/run/qidian-update-inbox /run/qidian-update-inbox
COPY --from=build --chown=0:0 /qidian-runtime/run/qidian-update-status /run/qidian-update-status
USER 1000:1000
EXPOSE 9908
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "require('node:http').get('http://127.0.0.1:9908/readyz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"]
CMD ["server/selfhost.mjs"]
