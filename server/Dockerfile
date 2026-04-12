# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Copy compiled JS
COPY --from=builder /app/dist ./dist

# Copy SQL migration files (read by dist/migrate.js at startup)
COPY migrations/ ./migrations/

# Install production dependencies (bcrypt needs build tools for native binding)
COPY package*.json ./
RUN apk add --no-cache python3 make g++ && \
    npm ci --omit=dev && \
    apk del python3 make g++

EXPOSE 3001

# Run migrations then start the server
CMD ["sh", "-c", "node dist/migrate.js && node dist/index.js"]
