# ─── Stage 1: base ───────────────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@11.1.0 --activate

# ─── Stage 2: deps (install — cached separately from source) ─────────────────
FROM base AS deps
WORKDIR /app

# Workspace manifests — lets pnpm resolve the full monorepo graph
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# package.json files for the frontend and its local workspace dependencies
COPY artifacts/daddyx/package.json       ./artifacts/daddyx/
COPY lib/api-client-react/package.json   ./lib/api-client-react/
COPY lib/db/package.json                 ./lib/db/

RUN pnpm install --frozen-lockfile

# ─── Stage 3: build ──────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

# Bring in installed deps
COPY --from=deps /app/ .

# Source for the frontend and its local libraries
COPY artifacts/daddyx     ./artifacts/daddyx
COPY lib/api-client-react ./lib/api-client-react
COPY lib/db               ./lib/db

# Build → artifacts/daddyx/.next/standalone (output: 'standalone' in next.config.ts)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN pnpm --filter @workspace/daddyx build


# ─── Stage 4: production image ───────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next.js standalone output is fully self-contained
COPY --from=builder --chown=nextjs:nodejs /app/artifacts/daddyx/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/artifacts/daddyx/.next/static     ./artifacts/daddyx/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/artifacts/daddyx/public           ./artifacts/daddyx/public

EXPOSE 3000

USER nextjs

CMD ["node", "artifacts/daddyx/server.js"]

