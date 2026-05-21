/**
 * Client Redis partagé — Auth Gateway
 * Utilisé pour : blacklist tokens, refresh tokens, rate limiting
 */

const { createClient } = require("redis");

let client = null;

async function connectRedis() {
  client = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) return new Error("Redis: trop de tentatives de reconnexion");
        return Math.min(retries * 100, 3000);
      }
    }
  });

  client.on("error", (err) => console.error("Redis error:", err.message));
  client.on("reconnecting", () => console.warn("Redis: reconnexion..."));
  client.on("ready", () => console.log("✅ Redis prêt"));

  await client.connect();
  return client;
}

function getRedisClient() {
  if (!client) throw new Error("Redis non initialisé. Appelez connectRedis() d'abord.");
  return client;
}

module.exports = { connectRedis, getRedisClient };
