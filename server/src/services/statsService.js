const { redis } = require("../config/redis"); // Redis 클라이언트
const playerModel = require("../models/playerModel");

// 환경 변수에서 전략을 불러옵니다 (기본값은 TTL)
const CACHE_STRATEGY = process.env.CACHE_STRATEGY || 'TTL';

// 1. 읽기(GET) 전용 함수
async function getPlayerByName(name) {
  const cacheKey = `player:name:${name}`;

  // --- [성능 측정 시작: Redis 조회] ---
  console.time("Cache_Hit_Latency"); 
  
  // 1. Redis에서 데이터 조회
  const cachedData = await redis.get(cacheKey);

  if (cachedData) {
    // Redis에 데이터가 있을 경우 시간 측정 종료 및 출력
    console.log(`[Cache Hit - Strategy:${CACHE_STRATEGY}] ${cacheKey}`);
    console.timeEnd("Cache_Hit_Latency"); 
    
    return JSON.parse(cachedData);
  }

  // 2. Cache Miss 발생 시 (Redis에 데이터 없음)
  // 데이터가 없으므로 Hit 측정은 종료(무의미)하고 Miss 측정을 시작합니다.
  console.timeEnd("Cache_Hit_Latency"); 
  console.log(`[Cache Miss - Strategy:${CACHE_STRATEGY}] ${cacheKey}`);
  
  // --- [성능 측정 시작: 순수 DB 조회] ---
  console.time("Cache_Miss_DB_Latency"); 
  
  const data = await playerModel.findByName(name);
  
  // DB 조회 시간 측정 종료 및 출력
  console.timeEnd("Cache_Miss_DB_Latency");

  // 3. 조회한 데이터를 Redis에 저장 (Cache Store)
  if (data && data.length > 0) {
    if (CACHE_STRATEGY === 'TTL') {
      await redis.set(cacheKey, JSON.stringify(data), "EX", 3600);
    } else {
      await redis.set(cacheKey, JSON.stringify(data));
    }
  }

  return data;
}

// 2. 수정(UPDATE) 전용 함수 (이벤트 기반 무효화)
async function updatePlayer(playerId, name, stats) {
  // A. DB에 데이터 업데이트
  await playerModel.updatePlayerStats(playerId, stats);

  // B. 캐시 무효화 (DB가 바뀌었으니 즉시 삭제)
  const cacheKey = `player:name:${name}`;
  await redis.del(cacheKey); 
  
  console.log(`[Cache Invalidation] 데이터 수정으로 인해 캐시 삭제: ${cacheKey}`);
  return { success: true };
}

module.exports = { getPlayerByName, updatePlayer };