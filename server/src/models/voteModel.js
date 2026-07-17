const { pool } = require("../config/db");

// ──────────────────────────────────────────────
// B 담당: votes 테이블 쿼리
// REDIS_ENABLED=false일 때 DB 직접 투표 처리 (대조군)
// ──────────────────────────────────────────────

/**
 * 투표 INSERT
 * - UNIQUE(user_id, game_id) 제약 위반 시 PostgreSQL이 에러 발생
 * - 호출측(voteService)에서 catch해서 409 응답으로 변환
 */
async function insertVote(gameId, playerId, userId) {
  const result = await pool.query(
    `INSERT INTO votes (game_id, player_id, user_id)
     VALUES ($1, $2, $3)
     RETURNING vote_id, voted_at`,
    [gameId, playerId, userId]
  );
  return result.rows[0];
}

/**
 * 경기별 MVP 랭킹 조회 (대조군)
 * - GROUP BY + COUNT + ORDER BY DESC
 * - k6에서 Redis ZREVRANGE와 응답 시간 비교 대상
 */
async function getRankingByGame(gameId, limit = 10) {
  const result = await pool.query(
    `SELECT
       p.player_id,
       p.name,
       p.team_short,
       COUNT(*) AS vote_count
     FROM votes v
     JOIN players p ON v.player_id = p.player_id
     WHERE v.game_id = $1
     GROUP BY p.player_id, p.name, p.team_short
     ORDER BY vote_count DESC
     LIMIT $2`,
    [gameId, limit]
  );
  return result.rows;
}

/**
 * 중복 투표 확인
 * - SELECT EXISTS로 O(1) 인덱스 탐색 (uidx_user_game 활용)
 */
async function checkDuplicate(gameId, userId) {
  const result = await pool.query(
    `SELECT EXISTS(
       SELECT 1 FROM votes
       WHERE game_id = $1 AND user_id = $2
     ) AS already_voted`,
    [gameId, userId]
  );
  return result.rows[0].already_voted;
}

/**
 * 특정 선수의 경기별 투표 수 조회
 */
async function getVoteCount(gameId, playerId) {
  const result = await pool.query(
    `SELECT COUNT(*) AS count
     FROM votes
     WHERE game_id = $1 AND player_id = $2`,
    [gameId, playerId]
  );
  return parseInt(result.rows[0].count, 10);
}

/**
 * player_id 목록으로 선수 정보 일괄 조회
 * - Redis 랭킹에서 player_id만 반환되므로 이름/팀 보강용
 */
async function getPlayersByIds(playerIds) {
  if (playerIds.length === 0) return [];

  const result = await pool.query(
    `SELECT player_id, name, team_short
     FROM players
     WHERE player_id = ANY($1)`,
    [playerIds]
  );
  return result.rows;
}

module.exports = {
  insertVote,
  getRankingByGame,
  checkDuplicate,
  getVoteCount,
  getPlayersByIds,
};
