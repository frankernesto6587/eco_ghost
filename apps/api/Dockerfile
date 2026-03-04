# ── Stage 1: Install dependencies ──────────────────────────────────
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpm-approve-builds.json ./
COPY tsconfig.base.json ./

# Copy package.json files for all workspaces
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# Install dependencies
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ─────────────────────────────────────────────────
FROM node:20-alpine AS build

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy source
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/

# Build shared package
WORKDIR /app/packages/shared
RUN npx tsc -p tsconfig.json

# Generate Prisma client & build API
WORKDIR /app/apps/api
RUN npx prisma generate --schema=src/prisma/schema.prisma
RUN npx nest build --webpack

# ── Stage 3: Production ───────────────────────────────────────────
FROM node:20-alpine AS production

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

WORKDIR /app

# Copy built output and dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/src/prisma/schema.prisma ./apps/api/schema.prisma
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json

COPY apps/api/package.json ./apps/api/
COPY package.json pnpm-workspace.yaml ./

# Entrypoint script
COPY apps/api/entrypoint.sh ./apps/api/entrypoint.sh
RUN chmod +x ./apps/api/entrypoint.sh

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["./entrypoint.sh"]
