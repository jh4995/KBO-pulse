const { redis } = require("../config/redis");
const voteModel = require("../models/voteModel");

const REDIS_ENABLED = process.env.REDIS_ENABLED !== "false"; // 기본값 true

// ──────────────────────────────────────────────
// B 담당: MVP 투표 비즈니스 로직
// REDIS_ENABLED=false → DB UPDATE로 투표 처리 (부하테스트 대조군)
// REDIS_ENABLED=true  → Redis INCR + Sorted Set + 분산 락
// ──────────────────────────────────────────────

async function castVote(gameId, playerId) {
  if (REDIS_ENABLED) {
    // TODO: B가 구현
    // 1) SET NX EX로 분산 락 획득
    // 2) INCR로 투표 수 atomic 증가
    // 3) ZINCRBY로 Sorted Set 랭킹 반영
    // 4) Write-Behind: 주기적으로 DB에 배치 동기화
    return { gameId, playerId, method: "redis", voted: true };
  }

  // DB 직접 처리 (대조군)
  // TODO: B가 구현
  // await voteModel.insertVote(gameId, playerId);
  return { gameId, playerId, method: "db", voted: true };
}

async function getRanking(gameId, limit) {
  if (REDIS_ENABLED) {
    // TODO: B가 구현
    // ZREVRANGE로 Sorted Set에서 상위 N명 조회
    return [];
  }

  // DB 직접 조회 (대조군)
  // TODO: B가 구현
  // return voteModel.getRanking(gameId, limit);
  return [];
}

module.exports = { castVote, getRanking };
