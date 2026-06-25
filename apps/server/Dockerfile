# Vox Composer local backend. Build context is the repo root (needs the pnpm
# workspace), e.g.:  docker build -f apps/server/Dockerfile -t voxcomposer-server .
# Node 22 — pnpm 11.7 requires >= 22.13 (uses node:sqlite).
FROM node:22-slim

# ffmpeg for MP3->WAV transcoding; openssl for Prisma engines.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /app

# Install dependencies for the whole workspace (server + shared + web) and
# build the editor's static bundle — this image serves it directly (see
# index.ts), so customers run one container, not "this plus your own nginx".
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @voxcomposer/server db:generate \
  && pnpm --filter @voxcomposer/web build

ENV NODE_ENV=production
ENV DATABASE_URL=file:/data/vox.db
ENV VOX_CACHE_DIR=/data/cache
ENV PORT=8080

WORKDIR /app/apps/server
EXPOSE 8080

# Ensure the schema exists, then run (tsx executes the TS source directly).
CMD ["sh", "-c", "pnpm exec prisma db push --skip-generate && pnpm exec tsx src/index.ts"]
