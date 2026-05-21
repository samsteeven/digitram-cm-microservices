/**
 * ══════════════════════════════════════════════════════
 *  DIGITRANS-CM — Auth Gateway (Port 3000)
 *  Rôle : Authentification centralisée OAuth2/JWT
 *         + Reverse proxy vers les microservices
 *  Stack : Node.js + Express
 * ══════════════════════════════════════════════════════
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const path = require("path");

const authRoutes = require("./src/routes/auth.routes");
const proxyRoutes = require("./src/routes/proxy.routes");
const { verifyToken } = require("./src/middleware/auth.middleware");
const { errorHandler } = require("./src/middleware/error.middleware");
const { connectRedis } = require("./src/utils/redis.client");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Sécurité globale ──────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// ─── Rate limiting global (anti-DDoS) ─────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: { error: "Trop de requêtes, veuillez réessayer plus tard." }
});
app.use(globalLimiter);

// ─── Rate limiting strict sur /auth ───────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Trop de tentatives d'authentification." }
});

// ─── Logging + parsing ────────────────────────────────────────────
app.use(morgan(process.env.LOG_FORMAT === "json" ? "combined" : "dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Swagger UI ───────────────────────────────────────────────────
try {
  const swaggerDoc = YAML.load(path.join(__dirname, "docs/openapi.yaml"));
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDoc, {
    customSiteTitle: "DIGITRANS-CM — Auth Gateway API"
  }));
} catch (e) {
  console.warn("⚠ OpenAPI spec non trouvée — /api-docs indisponible");
}

// ─── Routes publiques (auth) ──────────────────────────────────────
app.use("/auth", authLimiter, authRoutes);

// ─── Health check (public) ────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    service: "auth-gateway",
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0"
  });
});

// ─── Routes protégées (proxy vers microservices) ──────────────────
// Toutes les routes /api/* passent par la vérification JWT
app.use("/api", verifyToken, proxyRoutes);

// ─── Gestion erreurs globale ──────────────────────────────────────
app.use(errorHandler);

// ─── Démarrage ────────────────────────────────────────────────────
async function start() {
  try {
    await connectRedis();
    console.log("✅ Redis connecté");

    app.listen(PORT, () => {
      console.log(`🚀 Auth Gateway démarré sur le port ${PORT}`);
      console.log(`📚 Swagger UI : http://localhost:${PORT}/api-docs`);
    });
  } catch (err) {
    console.error("❌ Erreur au démarrage :", err.message);
    process.exit(1);
  }
}

start();

module.exports = app; // export pour les tests
