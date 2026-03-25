const express = require("express");
const { pool, testConnection: testDB } = require("./config/db");
const { redis, testConnection: testRedis } = require("./config/redis");
const healthRoutes = require("./routes/health");

const app = express();
const PORT = process.env.APP_PORT || 3000;
const INSTANCE_ID = process.env.APP_INSTANCE_ID || "local";

// JSON 파싱
app.use(express.json());

// 모든 응답에 인스턴스 ID 포함 (로드밸런싱 확인용)
app.use((req, res, next) => {
  res.setHeader("X-Instance-ID", INSTANCE_ID);
  next();
});

// 라우트 등록
app.use("/", healthRoutes);

// ──────────────────────────────────────────────
// 기능별 라우트 (구현 시 각 담당자가 추가)
// ──────────────────────────────────────────────
// const statsRoutes = require("./routes/stats");   // A: 선수 스탯 조회
// const voteRoutes = require("./routes/vote");     // B: MVP 투표/랭킹
// const gameRoutes = require("./routes/game");     // C: 실시간 경기 현황
// app.use("/api/stats", statsRoutes);
// app.use("/api/vote", voteRoutes);
// app.use("/api/game", gameRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: "not found" });
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`[${INSTANCE_ID}] Server running on port ${PORT}`);
});
