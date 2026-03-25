const express = require("express");
const router = express.Router();
const { pool, testConnection: testDB } = require("../config/db");
const { redis, testConnection: testRedis } = require("../config/redis");

const INSTANCE_ID = process.env.APP_INSTANCE_ID || "local";

// 1) 기본 헬스체크 — Nginx 라운드 로빈 확인용
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    instance: INSTANCE_ID,
    timestamp: new Date().toISOString(),
  });
});

// 2) PostgreSQL 연결 테스트
router.get("/check/db", async (req, res) => {
  const result = await testDB();
  res.status(result.status === "ok" ? 200 : 500).json({
    instance: INSTANCE_ID,
    ...result,
  });
});

// 3) Redis 연결 테스트
router.get("/check/redis", async (req, res) => {
  try {
    await redis.set("health:check", INSTANCE_ID, "EX", 10);
    const value = await redis.get("health:check");
    res.json({ status: "ok", instance: INSTANCE_ID, redis_value: value });
  } catch (err) {
    res.status(500).json({
      status: "error",
      instance: INSTANCE_ID,
      message: err.message,
    });
  }
});

// 4) 전체 인프라 상태 종합
router.get("/check/all", async (req, res) => {
  const dbResult = await testDB();
  const redisResult = await testRedis();

  const allOk = dbResult.status === "ok" && redisResult.status === "ok";

  res.status(allOk ? 200 : 500).json({
    status: allOk ? "ok" : "degraded",
    instance: INSTANCE_ID,
    postgres: dbResult.status,
    redis: redisResult.status,
  });
});

module.exports = router;
