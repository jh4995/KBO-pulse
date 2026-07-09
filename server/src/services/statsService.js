const { redis } = require("../config/redis"); // Redis 클라이언트
const playerModel = require("../models/playerModel");

/**
 * [제어 스위치]
 * 부하테스트 시 이 두 값만 변경하여 전략 전환
 *   순수 DB  : REDIS_ENABLED = false
 *   TTL 전략 : REDIS_ENABLED = true,  CACHE_STRATEGY = 'TTL'
 *   Event 전략: REDIS_ENABLED = true,  CACHE_STRATEGY = 'EVENT'
 */
const REDIS_ENABLED =true;   // true: Redis 캐싱 사용 / false: 순수 DB만 사용
const CACHE_STRATEGY = 'EVENT'; // 'TTL': 시간 기반 만료 / 'EVENT': 이벤트 기반 무효화

// 1. 읽기(GET) 함수
async function getPlayerByName(name) {

  // --- [A. REDIS_ENABLED = false (순수 DB 모드)] ---
  if (REDIS_ENABLED === false) {
    const data = await playerModel.findByName(name);
    return data;
  }

  // --- [B. REDIS_ENABLED = true (Redis 캐싱 모드)] ---
  const cacheKey = `player:name:${name}`;

  // 1) Redis에서 데이터 조회 (Cache Get)
  const cachedData = await redis.get(cacheKey);

  if (cachedData) {
    return JSON.parse(cachedData);
  }

  // 2) Cache Miss 발생 시 DB 조회
  const data = await playerModel.findByName(name);

  // 3) 조회한 데이터를 Redis에 저장 (Cache Store)
  if (data && data.length > 0) {
    if (CACHE_STRATEGY === 'TTL') {
      const TTL_SECONDS = 60; // 💡 앞으로 이 값만 바꾸면 자동으로 전체 반영됩니다.
      await redis.set(cacheKey, JSON.stringify(data), "EX", TTL_SECONDS);
    } else {
      // EVENT 모드: EX 옵션 없음. 영구 저장 (TTL 조회 시 -1 출력).
      await redis.set(cacheKey, JSON.stringify(data));
    }
  }

  return data;
}

// 2. 수정(UPDATE) 함수
async function updatePlayer(playerId, name, stats) {
  // DB 업데이트는 공통 사항
  await playerModel.updatePlayerStats(playerId, stats);

  // --- [전략별 캐시 무효화 분기] ---

  // 1. Redis가 꺼져있으면 캐시를 건드리지 않음
  if (REDIS_ENABLED === false) {
    return { success: true };
  }

  if (CACHE_STRATEGY === 'EVENT') {
    // 2. EVENT 모드: 명시적 캐시 삭제 (Invalidation)
    const cacheKey = `player:name:${name}`;
    await redis.del(cacheKey);
  }
  // 3. TTL 모드: 캐시 삭제 없음 — 유효기간 만료까지 대기

  return { success: true };
}

module.exports = { getPlayerByName, updatePlayer };
