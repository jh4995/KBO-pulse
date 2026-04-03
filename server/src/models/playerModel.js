const { pool } = require("../config/db");

// ──────────────────────────────────────────────
// A 담당: players, seasons_batting, seasons_pitching 테이블 쿼리
// 스키마가 바뀌면 이 파일만 수정 → routes/services에 영향 없음
// ──────────────────────────────────────────────

async function findAll(filters) {
  // TODO: A가 구현
  // const { team, position, season } = filters;
  // const result = await pool.query("SELECT ...", [team, position, season]);
  // return result.rows;
  return [];
}

async function findById(playerId) {
  // TODO: A가 구현
  // const result = await pool.query("SELECT ... WHERE id = $1", [playerId]);
  // return result.rows[0] || null;
  return null;
}

async function getRanking(category, season, limit) {
  // TODO: A가 구현
  return [];
}

module.exports = { findAll, findById, getRanking };
