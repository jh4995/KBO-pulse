const { redis } = require("../config/redis");
const gameModel = require("../models/gameModel");

const REDIS_ENABLED = process.env.REDIS_ENABLED !== "false"; // 기본값 true

// ──────────────────────────────────────────────
// C 담당: 실시간 경기 현황 비즈니스 로직
// REDIS_ENABLED=false → DB 직접 조회 (부하테스트 대조군)
// REDIS_ENABLED=true  → Redis Hash 캐싱 경유
// ──────────────────────────────────────────────

async function getLiveGames() {
  if (REDIS_ENABLED) {
    // TODO: C가 구현
    // Redis에서 진행 중 경기 목록 조회
    return [];
  }

  // DB 직접 조회 (대조군)
  // TODO: C가 구현
  // return gameModel.getLiveGames();
  return [];
}

async function getGameStatus(gameId) {
  if (REDIS_ENABLED) {
    // TODO: C가 구현
    // HGETALL로 Redis Hash에서 경기 상태 조회
    return null;
  }

  // DB 직접 조회 (대조군)
  // TODO: C가 구현
  // return gameModel.getGameStatus(gameId);
  return null;
}

module.exports = { getLiveGames, getGameStatus };
