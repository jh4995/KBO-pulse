const { redis } = require("../config/redis");
const playerModel = require("../models/playerModel");

const REDIS_ENABLED = process.env.REDIS_ENABLED !== "false"; // 기본값 true

// ──────────────────────────────────────────────
// A 담당: 선수 스탯 조회 비즈니스 로직
// REDIS_ENABLED=false → DB 직접 조회 (부하테스트 대조군)
// REDIS_ENABLED=true  → Redis Look-Aside 캐싱 경유
// ──────────────────────────────────────────────

async function getPlayers(filters) {
  // TODO: A가 구현
  // if (REDIS_ENABLED) {
  //   const cacheKey = `cache:players:${filters.team}:${filters.season}`;
  //   const cached = await redis.get(cacheKey);
  //   if (cached) return JSON.parse(cached);
  //   const data = await playerModel.findAll(filters);
  //   await redis.set(cacheKey, JSON.stringify(data), "EX", 3600);
  //   return data;
  // }
  // return playerModel.findAll(filters);
  return [];
}

async function getPlayerStats(playerId) {
  // TODO: A가 구현
  return null;
}

async function getRanking(options) {
  // TODO: A가 구현
  return [];
}

module.exports = { getPlayers, getPlayerStats, getRanking };
