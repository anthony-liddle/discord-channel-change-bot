# Build stage. Compiles TypeScript to dist/ and is then thrown away.
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
# --ignore-scripts skips the "prepare": "husky" hook, which needs a .git
# directory that does not exist inside the image. None of the runtime
# dependencies have install scripts.
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
COPY register-commands.ts ./
RUN pnpm build

# Runtime stage. Production dependencies plus the compiled output only.
FROM node:22-slim AS runtime
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts
COPY --from=build /app/dist ./dist

# The persistent volume mounts here. themes.json, state.json and config.json
# live on it, not in /app, because /app is rebuilt on every deploy.
ENV DATA_DIR=/data
RUN mkdir -p /data

CMD ["node", "dist/src/index.js"]
