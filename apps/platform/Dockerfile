# syntax=docker/dockerfile:1.7
# Multi-stage build for apps/platform. Build from the monorepo root:
#   docker build -f apps/platform/Dockerfile -t rocketease/platform .
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.9.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/platform/package.json apps/platform/
# @rocketease/providers is a workspace dependency of the platform (and the worker),
# so its manifest must be here for the filtered install to resolve the link.
COPY packages/ui/package.json packages/ui/
COPY packages/providers/package.json packages/providers/
COPY packages/media/package.json packages/media/
RUN pnpm install --frozen-lockfile --filter @rocketease/platform...

FROM deps AS build
COPY packages/ui packages/ui
# Source-only, like @rocketease/ui: package.json exports point straight at src/*.ts
# and it is listed in transpilePackages, so there is nothing to build — but without
# the sources the Next build fails on "Can't resolve @rocketease/providers/client".
COPY packages/providers packages/providers
COPY packages/media packages/media
COPY apps/platform apps/platform
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* IS INLINED INTO THE CLIENT BUNDLE AT BUILD TIME, so these cannot
# be supplied by a ConfigMap at runtime. Omitting one does not error: the browser
# simply gets `undefined`, and social sign-in, One Tap and the AI controls all
# quietly never render against a deploy that otherwise looks healthy.
# They are public identifiers by definition — passed as repo variables, not secrets.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_AUTH_SOCIAL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_AI_ENABLED
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_AUTH_SOCIAL=$NEXT_PUBLIC_AUTH_SOCIAL
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_AI_ENABLED=$NEXT_PUBLIC_AI_ENABLED
# DATABASE_URL is only read at runtime; a placeholder keeps the build from throwing.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
RUN pnpm --filter @rocketease/platform build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# NUMERIC uid/gid, and USER is the NUMBER. Kubernetes cannot verify a non-numeric
# user against runAsNonRoot: true — it refuses the container outright with
#   "image has non-numeric user (app), cannot verify user is non-root"
# which surfaces as CreateContainerConfigError, not as an image or secret problem.
RUN addgroup -g 1001 -S app && adduser -u 1001 -S app -G app
COPY --from=build --chown=1001:1001 /repo/apps/platform/.next/standalone ./
COPY --from=build --chown=1001:1001 /repo/apps/platform/.next/static ./apps/platform/.next/static
COPY --from=build --chown=1001:1001 /repo/apps/platform/public ./apps/platform/public
# Migrations are applied by a separate job step (drizzle-kit migrate), not at container start.
USER 1001
EXPOSE 3000
CMD ["node", "apps/platform/server.js"]
