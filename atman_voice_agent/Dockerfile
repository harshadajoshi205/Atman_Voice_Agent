# ── Stage 1: Build the frontend ──────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Install build tools for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the Vite frontend
# GEMINI_API_KEY is required at build time so Vite can embed it in the client bundle
ARG GEMINI_API_KEY
ENV GEMINI_API_KEY=${GEMINI_API_KEY}
RUN npm run build

# ── Stage 2: Production image ───────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Install build tools for native modules (better-sqlite3 needs rebuild)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files and install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built frontend
COPY --from=builder /app/dist ./dist

# Copy server and config files needed at runtime
COPY server.ts ./
COPY tsconfig.json ./

# Install tsx for running TypeScript server in production
RUN npm install tsx

# Runtime environment
ENV NODE_ENV=production
ENV PORT=3000

# The API key is passed at runtime (for server-side lead extraction)
# and was already embedded in the frontend bundle at build time
ENV GEMINI_API_KEY=""

# Expose the port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/leads').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start the server
CMD ["npx", "tsx", "server.ts"]
