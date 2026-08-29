# syntax=docker/dockerfile:1.7
# Multi-stage build for apps/web. Build from the monorepo root:
#   docker build -f apps/web/Dockerfile -t rocketease/web .
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.9.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile --filter @rocketease/web...

FROM deps AS build
COPY packages/ui packages/ui
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @rocketease/web build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# NUMERIC uid/gid, and USER is the NUMBER. Kubernetes cannot verify a non-numeric
# user against runAsNonRoot: true — it refuses the container outright with
#   "image has non-numeric user (app), cannot verify user is non-root"
# which surfaces as CreateContainerConfigError, not as an image or secret problem.
RUN addgroup -g 1001 -S app && adduser -u 1001 -S app -G app
COPY --from=build --chown=1001:1001 /repo/apps/web/.next/standalone ./
COPY --from=build --chown=1001:1001 /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=1001:1001 /repo/apps/web/public ./apps/web/public
USER 1001
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
