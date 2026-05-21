# ════════════════════════════════════════════
#  Dockerfile — Auth Gateway (Node.js 20 LTS)
#  Multi-stage : build léger pour la prod
# ════════════════════════════════════════════

# ─── Stage 1 : dépendances de production ──
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# ─── Stage 2 : image finale ───────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Sécurité : exécuter en tant qu'utilisateur non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=appuser:appgroup . .

# Port exposé
EXPOSE 3000

# Health check intégré
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

ENV NODE_ENV=production
CMD ["node", "index.js"]
