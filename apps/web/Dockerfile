# ── Stage 1: Build ─────────────────────────────────────────────────
FROM node:20-alpine AS build

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpm-approve-builds.json ./
COPY tsconfig.base.json ./

# Copy package.json files for all workspaces
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/

# Build args (injected at build time)
ARG VITE_API_URL
ARG VITE_TELEGRAM_BOT_USERNAME

# Build the web app
WORKDIR /app/apps/web
RUN npx vite build

# ── Stage 2: Serve with nginx ─────────────────────────────────────
FROM nginx:alpine AS production

# Copy built files
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

# Copy nginx config
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
