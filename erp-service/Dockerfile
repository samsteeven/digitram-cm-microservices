# Dockerfile générique pour tous les microservices Node.js
# Copier ce fichier dans erp-service/, crm-service/, supply-chain-service/, bi-service/
# et adapter EXPOSE + CMD si nécessaire

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

# PORT sera surchargé par la variable d'environnement docker-compose
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3001}/health || exit 1

ENV NODE_ENV=production
CMD ["node", "src/index.js"]
