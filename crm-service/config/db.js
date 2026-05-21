const { Pool } = require("pg");
let pool = null;
function connectDb() {
  pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
  });
  pool.on("error", err => console.error("Pool PG error:", err.message));
  return pool.query("SELECT 1");
}
function getDb() {
  if (!pool) throw new Error("DB non initialisée");
  return pool;
}
module.exports = { connectDb, getDb };
