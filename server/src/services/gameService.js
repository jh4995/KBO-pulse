const { redis } = require("../config/redis");
const { pool } = require("../config/db"); 
const gameModel = require("../models/gameModel");

// CSV 모듈(fs, path, csv-parser)은 더 이상 필요 없으므로 삭제했습니다.
const REDIS_ENABLED = process.env.REDIS_ENABLED !== "false";

async function getLiveGames() {
  if (REDIS_ENABLED) {
    const gameIds = await redis.smembers("game:live:ids");
    if (gameIds.length === 0) return [];
    const pipeline = redis.pipeline();
    gameIds.forEach((id) => pipeline.hgetall(`game:live:${id}`));
    const results = await pipeline.exec();
    return results.map(([err, data]) => data);
  }
  return gameModel.getLiveGames();
}

async function getGameStatus(gameId) {
  if (REDIS_ENABLED) {
    const data = await redis.hgetall(`game:live:${gameId}`);
    if (Object.keys(data).length === 0) return null;
    if (data.inningDetails) {
      try {
        data.inningDetails = JSON.parse(data.inningDetails);
      } catch (e) {
        console.error("Inning details parse error:", e);
      }
    }
    return data;
  }
  return gameModel.getGameStatus(gameId);
}

/**
 * 시뮬레이션 시작 - DB 기반으로 전면 수정
 * @param {number} gameId - DB의 games 테이블에 있는 실제 game_id
 */
async function startSimulation(gameId) {
  try {
    // 1. DB에서 경기 정보 및 이닝별 점수 한꺼번에 가져오기
    const gameInfoQuery = `
      SELECT g.home_team, g.away_team, gi.inning, gi.team_short, gi.runs
      FROM games g
      JOIN game_innings gi ON g.game_id = gi.game_id
      WHERE g.game_id = $1
      ORDER BY gi.inning ASC, gi.team_short DESC; 
    `;
    const dbResult = await pool.query(gameInfoQuery, [gameId]);


    console.log(`DB Query Result Count: ${dbResult.rows.length} rows found for gameId ${gameId}`);

if (dbResult.rows.length === 0) {
    // 힌트를 얻기 위해 개별 조회 시도
    const checkGames = await pool.query("SELECT * FROM games WHERE game_id = $1", [gameId]);
    const checkInnings = await pool.query("SELECT * FROM game_innings WHERE game_id = $1", [gameId]);
    console.log(`Games Table: ${checkGames.rows.length}, Innings Table: ${checkInnings.rows.length}`);
    
    throw new Error(`DB에 해당 경기(ID: ${gameId}) 데이터가 없습니다. (Games: ${checkGames.rows.length}, Innings: ${checkInnings.rows.length})`);
}


    if (dbResult.rows.length === 0) {
      throw new Error(`DB에 해당 경기(ID: ${gameId}) 데이터가 없습니다.`);
    }

    const rows = dbResult.rows;
    const homeTeamName = rows[0].home_team;
    const awayTeamName = rows[0].away_team;

    // 2. 이닝 데이터를 시뮬레이션에서 쓰기 좋게 분리 (Home/Away)
    const inningData = {
      home: rows.filter(r => homeTeamName.includes(r.team_short)).map(r => r.runs),
      away: rows.filter(r => awayTeamName.includes(r.team_short)).map(r => r.runs)
    };

    console.log(`[시뮬레이션 시작] ${awayTeamName} vs ${homeTeamName} (ID: ${gameId})`);

    let currentInning = 1;
    let homeTotalScore = 0;
    let awayTotalScore = 0;
    let homeInningHistory = [];
    let awayInningHistory = [];

    await redis.sadd("game:live:ids", gameId.toString());

    // 3. 시뮬레이션 루프
    const interval = setInterval(async () => {
      // 9회 또는 데이터 끝까지 실행
      if (currentInning > 9 || currentInning > inningData.home.length) {
        clearInterval(interval);
        await redis.srem("game:live:ids", gameId.toString());
        console.log(`[Sim] ${gameId} 경기 종료`);
        return;
      }

      try {
        const hScore = inningData.home[currentInning - 1] || 0;
        const aScore = inningData.away[currentInning - 1] || 0;

        homeTotalScore += hScore;
        awayTotalScore += aScore;
        homeInningHistory.push(hScore);
        awayInningHistory.push(aScore);

        const statusData = {
          gameId: String(gameId),
          homeTeam: homeTeamName,
          awayTeam: awayTeamName,
          homeScore: String(homeTotalScore),
          awayScore: String(awayTotalScore),
          inning: String(currentInning),
          status: "live",
          inningDetails: JSON.stringify({ home: homeInningHistory, away: awayInningHistory }),
          updatedAt: new Date().toISOString()
        };

        // Redis 및 DB 업데이트 (기존 로직 유지)
        await redis.hset(`game:live:${gameId}`, statusData);
        await gameModel.updateLiveScore(statusData);

        console.log(`[Sim] ${gameId} - ${currentInning}회: ${awayTeamName}(${awayTotalScore}) vs ${homeTeamName}(${homeTotalScore})`);
        currentInning++;
      } catch (err) {
        console.error("시뮬레이션 루프 에러:", err);
        clearInterval(interval);
      }
    }, 2000); // 2초마다 1이닝씩 진행

    return { gameId, status: "started" };

  } catch (error) {
    console.error("시뮬레이션 시작 실패:", error);
    throw error;
  }
}

module.exports = { getLiveGames, getGameStatus, startSimulation };