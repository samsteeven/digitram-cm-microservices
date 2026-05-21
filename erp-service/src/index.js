/**
 * ══════════════════════════════════════════════════════
 *  DIGITRANS-CM — ERP Service (Port 3001)
 *  Modules : Ressources Humaines, Comptabilité,
 *            Approvisionnements
 *  Stack : Node.js + Express + PostgreSQL
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
const employeeRoutes = require("./routes/employee.routes");
const accountingRoutes = require("./routes/accounting.routes");
const purchaseOrderRoutes = require("./routes/purchase-order.routes");
const { extractUserFromHeaders } = require("./middleware/user.middleware");
const { errorHandler } = require("./middleware/error.middleware");

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Swagger / OpenAPI ─────────────────────────────────────────────
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "DIGITRANS-CM — ERP Service API",
      version: "1.0.0",
      description: "API REST pour la gestion RH, comptabilité et approvisionnements d'AGROCAM S.A."
    },
    components: {
      securitySchemes: {
        BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" }
      }
    },
    security: [{ BearerAuth: [] }]
  },
  apis: ["./routes/*.js"]
});
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ─── Middleware globaux ────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(morgan(process.env.LOG_FORMAT === "json" ? "combined" : "dev"));
app.use(express.json({ limit: "5mb" }));
app.use(extractUserFromHeaders); // Lit X-User-Id, X-User-Role injectés par le gateway

// ─── Health check ─────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ service: "erp-service", status: "ok", timestamp: new Date().toISOString() });
});

// ─── Routes métier ────────────────────────────────────────────────
app.use("/employees", employeeRoutes);
app.use("/accounting", accountingRoutes);
app.use("/purchase-orders", purchaseOrderRoutes);

// ─── Erreurs ──────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Démarrage ────────────────────────────────────────────────────
async function start() {
  await connectDb();
  console.warn("PostgreSQL connecté (ERP)");
  app.listen(PORT, () => {
    console.warn(`ERP Service démarré sur le port ${PORT}`);
    console.warn(`Swagger : http://localhost:${PORT}/api-docs`);
  });
}

start().catch(err => {
  console.error("❌ ERP Service — erreur démarrage :", err.message);
  process.exit(1);
});

module.exports = app;
