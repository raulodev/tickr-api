# syntax=docker/dockerfile:1

FROM node:24-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@12.16.1 --activate

WORKDIR /app

FROM base AS build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile

COPY . .
RUN pnpm exec prisma generate --config prisma7.config.ts \
    && pnpm exec prisma migrate deploy --config prisma7.config.ts \
    && pnpm build \
    && pnpm prune --prod

FROM node:24-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json

USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]