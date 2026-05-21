/**
 * Configuration PostgreSQL — Pool de connexions partagé
 * Utilisé par : ERP, CRM, Supply Chain, BI
 */

const { Pool } = require("pg");

let pool = null;

function connectDb() {
  pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    user: process.env.DB_USER || "digitrans",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "digitrans",
    max: 10,                  // max connexions simultanées
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false
  });

  pool.on("error", (err) => {
    console.error("Pool PostgreSQL — erreur inattendue :", err.message);
  });

  return pool.query("SELECT 1"); // test de connexion
}

function getDb() {
  if (!pool) throw new Error("Base de données non initialisée. Appelez connectDb() d'abord.");
  return pool;
}

module.exports = { connectDb, getDb };
