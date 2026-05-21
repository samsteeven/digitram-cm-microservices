/**
 * ══════════════════════════════════════════════════════
 *  DIGITRANS-CM — CRM Service (Port 3002)
 *  Modules : Gestion clients, commandes, fidélité
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
const customerRoutes = require("./routes/customer.routes");
const orderRoutes = require("./routes/order.routes");
const { extractUserFromHeaders } = require("./middleware/user.middleware");
const { errorHandler } = require("./middleware/error.middleware");

const app = express();
const PORT = process.env.PORT || 3002;

// ─── Swagger / OpenAPI ─────────────────────────────────────────────
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "DIGITRANS-CM — CRM Service API",
      version: "1.0.0",
      description: "API REST pour la gestion des clients et commandes d'AGROCAM S.A."
    },
    components: {
      securitySchemes: {
        BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" }
      }
    },
    security: [{ BearerAuth: [] }]
  },
  apis: ["./src/routes/*.js"]
});
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ─── Middleware globaux ────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(morgan(process.env.LOG_FORMAT === "json" ? "combined" : "dev"));
app.use(express.json({ limit: "5mb" }));
app.use(extractUserFromHeaders); // Lit X-User-Id, X-User-Role, X-User-Email injectés par le gateway

// ─── Health check ─────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ service: "crm-service", status: "ok", timestamp: new Date().toISOString() });
});

// ─── Routes métier ────────────────────────────────────────────────
app.use("/customers", customerRoutes);
app.use("/orders", orderRoutes);

// ─── Erreurs ──────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Démarrage ────────────────────────────────────────────────────
async function start() {
  await connectDb();
  console.log("✅ PostgreSQL connecté (CRM)");
  await connectRedis();
  console.log("✅ Redis connecté (CRM)");
  
  app.listen(PORT, () => {
    console.log(`🚀 CRM Service démarré sur le port ${PORT}`);
    console.log(`📚 Swagger : http://localhost:${PORT}/api-docs`);
  });
}

start().catch(err => {
  console.error("❌ CRM Service — erreur démarrage :", err.message);
  process.exit(1);
});

module.exports = app;
