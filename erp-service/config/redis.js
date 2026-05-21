const { createClient } = require("redis");
let client = null;
async function connectRedis() {
  client = createClient({ url: process.env.REDIS_URL });
  client.on("error", err => console.error("Redis error:", err.message));
  await client.connect();
  return client;
}
function getRedis() {
  if (!client) throw new Error("Redis non initialisé");
  return client;
}
module.exports = { connectRedis, getRedis };
