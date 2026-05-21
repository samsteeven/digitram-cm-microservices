/**
 * ══════════════════════════════════════════════════════
 *  DIGITRANS-CM — Supply Chain Service (Port 3003)
 *  Modules : Suivi des flux de marchandises
 *            Offline-first avec Redis + sync asynchrone
 *  Stack : Node.js + Express + PostgreSQL + Redis
 * ══════════════════════════════════════════════════════
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

const { connectDb } = require("../config/db");
const { connectRedis } = require("../config/redis");
const { startSyncWorker } = require("./sync/sync.worker");
const { connectFabric, disconnectFabric } = require("./blockchain/fabric.client");
const shipmentRoutes = require("./routes/shipment.routes");
const checkpointRoutes = require("./routes/checkpoint.routes");
const syncRoutes = require("./routes/sync.routes");
const { extractUserFromHeaders } = require("./middleware/user.middleware");
const { errorHandler } = require("./middleware/error.middleware");

const app = express();
const PORT = process.env.PORT || 3003;

// ─── Swagger ──────────────────────────────────────────────────────
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "DIGITRANS-CM — Supply Chain Service API",
      version: "1.0.0",
      description: "API REST pour le suivi des flux marchandises AGROCAM S.A. — Offline-first"
    }
  },
  apis: ["./routes/*.js"]
});
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ─── Middleware ───────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(morgan(process.env.LOG_FORMAT === "json" ? "combined" : "dev"));
app.use(express.json({ limit: "10mb" }));
app.use(extractUserFromHeaders);

// ─── Health check ─────────────────────────────────────────────────
app.get("/health", async (req, res) => {
  try {
    const { getDb } = require("../config/db");
    const { getRedis } = require("../config/redis");
    await getDb().query("SELECT 1");
    await getRedis().ping();
    res.json({ service: "supply-chain-service", status: "ok", timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ service: "supply-chain-service", status: "degraded", error: err.message });
  }
});

// ─── Routes ───────────────────────────────────────────────────────
app.use("/shipments", shipmentRoutes);
app.use("/checkpoints", checkpointRoutes);
app.use("/sync", syncRoutes); // endpoint de synchronisation offline

app.use(errorHandler);

// ─── Démarrage ────────────────────────────────────────────────────
async function start() {
  await connectDb();
  console.log("✅ PostgreSQL connecté (Supply Chain)");
  await connectRedis();
  console.log("✅ Redis connecté (Supply Chain)");

  // Connexion à Hyperledger Fabric (non-bloquante, mode degraded si indisponible)
  await connectFabric();

  // Démarrer le worker de synchronisation offline-first
  startSyncWorker();
  console.log("✅ Worker de synchronisation offline-first démarré");

  app.listen(PORT, () => {
    console.log(`🚀 Supply Chain Service démarré sur le port ${PORT}`);
  });
}

start().catch(err => {
  console.error("❌ Supply Chain Service — erreur démarrage :", err.message);
  process.exit(1);
});

module.exports = app;
