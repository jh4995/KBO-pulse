const { pool } = require("../config/db");

// ──────────────────────────────────────────────
// A 담당: players, seasons_batting, seasons_pitching 테이블 쿼리
// 스키마가 바뀌면 이 파일만 수정 → routes/services에 영향 없음
// ──────────────────────────────────────────────

async function findAll(filters) {
  const { team, position } = filters;
  let query = "SELECT * FROM players WHERE 1=1";
  const values = [];

  if (team) {
    query += " AND team_short = $" + (values.length + 1);
    values.push(team);
  }
  if (position) {
    query += " AND position = $" + (values.length + 1);
    values.push(position);
  }

  const result = await pool.query(query, values);
  return result.rows;
}

async function findById(playerId) {
  // 선수 정보와 스탯 정보를 JOIN하여 상세 정보 조회
  const query = `
    SELECT p.*, s.hits, s.at_bats, s.rbi 
    FROM players p
    LEFT JOIN season_batting s ON p.player_id = s.player_id
    WHERE p.player_id = $1
  `;
  const result = await pool.query(query, [playerId]);
  return result.rows[0] || null;
}

async function findByName(name) {
  // DB에서 데이터 조인하여 가져오기
  const query = `
    SELECT p.name, g.game_date, b.hits, b.at_bats, b.rbi
    FROM game_batters b
    JOIN players p ON b.name = p.name
    JOIN games g ON b.game_id = g.game_id
    WHERE p.name = $1
    ORDER BY g.game_date DESC;
  `;
  const result = await pool.query(query, [name]);
  return result.rows;
}

// 모델 계층: DB와 직접 통신
async function updatePlayerStats(playerId, { home_runs, rbi }) {
  const query = `
    UPDATE season_batting 
    SET home_runs = $1, rbi = $2 
    WHERE player_id = $3
  `;
  // DB 업데이트 수행
  // 파라미터 순서 주의 ($1: home_runs, $2: rbi, $3: player_id)
  await pool.query(query, [home_runs, rbi, playerId]);
  return { success: true };
}

module.exports = { findAll, findById, findByName, updatePlayerStats };
