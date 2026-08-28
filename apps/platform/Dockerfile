# syntax=docker/dockerfile:1.7
# Multi-stage build for apps/platform. Build from the monorepo root:
#   docker build -f apps/platform/Dockerfile -t make-it-social/platform .
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.9.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/platform/package.json apps/platform/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile --filter @make-it-social/platform...

FROM deps AS build
COPY packages/ui packages/ui
COPY apps/platform apps/platform
ENV NEXT_TELEMETRY_DISABLED=1
# DATABASE_URL is only read at runtime; a placeholder keeps the build from throwing.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
RUN pnpm --filter @make-it-social/platform build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /repo/apps/platform/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/platform/.next/static ./apps/platform/.next/static
COPY --from=build --chown=app:app /repo/apps/platform/public ./apps/platform/public
# Migrations are applied by a separate job step (drizzle-kit migrate), not at container start.
USER app
EXPOSE 3000
CMD ["node", "apps/platform/server.js"]
