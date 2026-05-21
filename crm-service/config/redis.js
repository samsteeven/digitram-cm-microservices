const { createClient } = require("redis");
let client = null;
async function connectRedis() {
  client = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
    socket: { reconnectStrategy: r => Math.min(r * 100, 3000) }
  });
  client.on("error", err => console.error("Redis error:", err.message));
  await client.connect();
  return client;
}
function getRedis() {
  if (!client) throw new Error("Redis non initialisé");
  return client;
}
module.exports = { connectRedis, getRedis };
