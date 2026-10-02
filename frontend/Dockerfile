# syntax=docker/dockerfile:1

# ---- Build: compile the Vite bundle on Node 24 (AGENT.md §3.2) ------------------------------
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Vite inlines VITE_* values at build time, so they are build args, not runtime env.
# The build fails if VITE_API_BASE_URL is missing (see vite.config.ts).
# (The Google sign-in client ID comes from the API at runtime, not from the build.)
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Sources (filtered by .dockerignore).
COPY . .
RUN pnpm build

# ---- Runtime: static files on unprivileged nginx (runs as uid 101, listens on 8080) -------
FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime

# Origins allowed by the Content-Security-Policy. Required at container start.
ENV API_ORIGIN="" \
    SUPABASE_STORAGE_ORIGIN=""

COPY --chmod=755 docker/05-require-env.sh /docker-entrypoint.d/05-require-env.sh
COPY docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
