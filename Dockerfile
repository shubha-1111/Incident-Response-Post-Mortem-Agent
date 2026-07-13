# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Explicitly neutralise any proxy env vars injected by the build platform.
# Setting to empty string takes precedence over npm config files.
ENV npm_config_proxy=""
ENV npm_config_https_proxy=""
ENV npm_config_noproxy="*"
ENV CI=false

# Copy package manifests, npmrc, and TS config first (layer-cache friendly)
COPY package*.json .npmrc tsconfig.json ./

# Clear proxy from npm config store as well (belt-and-suspenders)
RUN npm config delete proxy 2>/dev/null || true && \
    npm config delete https-proxy 2>/dev/null || true && \
    npm install

# Copy entire workspace
COPY . .

# Install frontend dependencies as a separate, cache-able layer
RUN cd src/frontend && \
    npm config delete proxy 2>/dev/null || true && \
    npm config delete https-proxy 2>/dev/null || true && \
    npm install

# Build backend (tsc) then frontend (vite) — no nested npm install during build
RUN npm run build:backend && npm run build:frontend:only

# ─────────────────────────────────────────────────────────────────
# Stage 2: Minimal production runner
# ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV npm_config_proxy=""
ENV npm_config_https_proxy=""
ENV npm_config_noproxy="*"

# Copy manifests and install prod-only deps
COPY package*.json .npmrc ./
RUN npm config delete proxy 2>/dev/null || true && \
    npm config delete https-proxy 2>/dev/null || true && \
    npm install --omit=dev

# Copy compiled backend
COPY --from=builder /app/dist ./dist

# Copy runtime assets (report templates etc.) not compiled by tsc
COPY --from=builder /app/config ./config

# Copy minified frontend static bundle
COPY --from=builder /app/src/frontend/dist ./src/frontend/dist

# Port the Express server listens on
EXPOSE 3001

CMD ["npm", "run", "start"]
