# 1. Install dependencies
FROM node:25-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# 2. Build the application
FROM node:25-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 3. Production runner
FROM node:25-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy essential files from builder
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/server.ts ./
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./

# Install all production dependencies and tools for the custom server
RUN npm install --omit=dev && \
    npm install -g tsx typescript

USER nextjs

EXPOSE 3000
ENV PORT=3000

# Use the custom server
CMD ["npx", "tsx", "server.ts"]
