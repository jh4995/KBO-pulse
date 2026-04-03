const healthRoutes = require("./health");
const statsRoutes = require("./stats");
const voteRoutes = require("./vote");
const gameRoutes = require("./game");

/**
 * 라우트 자동 등록
 * - A/B/C가 각자 routes/stats.js, vote.js, game.js만 수정
 * - app.js를 건드리지 않으므로 Git 충돌 방지
 */
module.exports = function registerRoutes(app) {
  app.use("/", healthRoutes);
  app.use("/api/stats", statsRoutes);   // A: 선수 스탯 조회
  app.use("/api/vote", voteRoutes);     // B: MVP 투표/랭킹
  app.use("/api/game", gameRoutes);     // C: 실시간 경기 현황
};
