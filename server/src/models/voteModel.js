const { pool } = require("../config/db");

// ──────────────────────────────────────────────
// B 담당: votes 테이블 쿼리
// REDIS_ENABLED=false일 때 DB 직접 투표 처리 (대조군)
// ──────────────────────────────────────────────

async function insertVote(gameId, playerId) {
  // TODO: B가 구현
  // await pool.query("INSERT INTO votes ...", [gameId, playerId]);
}

async function getRanking(gameId, limit) {
  // TODO: B가 구현
  // const result = await pool.query(
  //   "SELECT player_id, COUNT(*) as vote_count FROM votes WHERE game_id = $1 GROUP BY player_id ORDER BY vote_count DESC LIMIT $2",
  //   [gameId, limit]
  // );
  // return result.rows;
  return [];
}

module.exports = { insertVote, getRanking };
