const { pool } = require("../config/db");

async function getLiveGames() {
  const query = `
    SELECT game_id, home_team, away_team, status, home_score, away_score
    FROM games 
    WHERE status = 'live' -- 시뮬레이션 중인 경기는 'live' 상태임
  `;
  try {
    const result = await pool.query(query);
    return result.rows;
  } catch (err) {
    console.error("DB getLiveGames Error:", err);
    return [];
  }
} 

// 특정 경기 상세 조회
async function getGameStatus(gameId) {
  const query = `
    SELECT game_id, home_team, away_team, status, home_score, away_score
    FROM games 
    WHERE game_id = $1
  `;
  try {
    const result = await pool.query(query, [parseInt(gameId)]);
    return result.rows[0] || null;
  } catch (err) {
    console.error("DB getGameStatus Error:", err);
    return null;
  }
}

async function updateLiveScore(statusData) {
  const { gameId, homeScore, awayScore, status } = statusData;

  const query = `
    UPDATE games 
    SET home_score = $1, away_score = $2, status = $3
    WHERE game_id = $4
  `;

  try {
    const result = await pool.query(query, [
      parseInt(homeScore), 
      parseInt(awayScore), 
      status, 
      parseInt(gameId)
    ]);
    
    return result.rowCount > 0;
  } catch (err) {
    console.error("DB 점수 업데이트 오류:", err.message);
    return false;
  }
}

module.exports = { getLiveGames, getGameStatus, updateLiveScore };