const { pool } = require("../config/db");

// ──────────────────────────────────────────────
// C 담당: games, game_scores 테이블 쿼리
// REDIS_ENABLED=false일 때 DB 직접 조회 (대조군)
// ──────────────────────────────────────────────

async function getLiveGames() {
  // TODO: C가 구현
  // const result = await pool.query("SELECT ... FROM games WHERE status = 'live'");
  // return result.rows;
  return [];
}

async function getGameStatus(gameId) {
  // TODO: C가 구현
  // const result = await pool.query("SELECT ... FROM games WHERE id = $1", [gameId]);
  // return result.rows[0] || null;
  return null;
}

module.exports = { getLiveGames, getGameStatus };
