FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=appuser:appgroup . .
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3002}/health || exit 1
ENV NODE_ENV=production
CMD ["node", "src/index.js"]
