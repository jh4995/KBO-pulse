require("dotenv").config();
require("express-async-errors");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { pool } = require("./config/db");
const { redis } = require("./config/redis");
const registerRoutes = require("./routes");
const errorHandler = require("./middleware/errorHandler");

const app = express();
const PORT = process.env.APP_PORT || 3000;
const INSTANCE_ID = process.env.APP_INSTANCE_ID || "local";

// ──────────────────────────────────────────────
// 공통 미들웨어
// ──────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());

// 모든 응답에 인스턴스 ID 포함 (로드밸런싱 확인용)
app.use((req, res, next) => {
  res.setHeader("X-Instance-ID", INSTANCE_ID);
  next();
});

// ──────────────────────────────────────────────
// 라우트 자동 등록 (각자 기능 담당자가 app.js를 건드리지 않음)
// ──────────────────────────────────────────────
registerRoutes(app)

// ──────────────────────────────────────────────
// 404 + 글로벌 에러 핸들러
// ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "not found" } });
});
 
app.use(errorHandler);

// ──────────────────────────────────────────────
// 서버 시작 + Graceful Shutdown
// ──────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`[${INSTANCE_ID}] Server running on port ${PORT}`);
  console.log(`[${INSTANCE_ID}] REDIS_ENABLED=${process.env.REDIS_ENABLED || "true"}`);
});
 
async function shutdown(signal) {
  console.log(`[${INSTANCE_ID}] ${signal} received. Shutting down...`);
  server.close(async () => {
    await pool.end();
    redis.disconnect();
    console.log(`[${INSTANCE_ID}] Shutdown complete.`);
    process.exit(0);
  });
}
 
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
 