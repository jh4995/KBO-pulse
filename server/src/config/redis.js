const Redis = require("ioredis");

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  retryStrategy(times) {
    const delay = Math.min(times * 200, 2000);
    return delay;
  },
});

redis.on("connect", () => {
  console.log("[Redis] Connected");
});

redis.on("error", (err) => {
  console.error("[Redis] Error:", err.message);
});

async function testConnection() {
  try {
    const pong = await redis.ping();
    return { status: pong === "PONG" ? "ok" : "error" };
  } catch (err) {
    return { status: "error", message: err.message };
  }
}

module.exports = { redis, testConnection };
