const { redis } = require("../config/redis"); // Redis 클라이언트
const playerModel = require("../models/playerModel");

/**
 * [직접 제어 스위치]
 * .env가 동작하지 않으므로 여기서 직접 값을 수정하여 테스트
 */
const REDIS_ENABLED = true;   // true: Redis 캐싱 사용 / false: 순수 DB만 사용
const CACHE_STRATEGY = 'TTL'; // 'TTL': 시간 기반 만료 / 'EVENT': 이벤트 기반 무효화

// 1. 읽기(GET) 함수
async function getPlayerByName(name) {
  
  // --- [A. REDIS_ENABLED = false (순수 DB 모드)] ---
  if (REDIS_ENABLED === false) {
    console.log(`\n[MODE] BASELINE (순수 DB 조회)`);
    console.time("Baseline_DB_Latency"); 
    
    const data = await playerModel.findByName(name);
    
    console.timeEnd("Baseline_DB_Latency"); 
    return data;
  }

  // --- [B. REDIS_ENABLED = true (Redis 캐싱 모드)] ---
  const cacheKey = `player:name:${name}`;

  // 1) Redis에서 데이터 조회 (Cache Get)
  console.time("Cache_Hit_Latency"); 
  const cachedData = await redis.get(cacheKey);

  if (cachedData) {
    console.log(`[Cache Hit - Strategy:${CACHE_STRATEGY}] ${cacheKey}`);
    console.timeEnd("Cache_Hit_Latency"); 
    return JSON.parse(cachedData);
  }

  // 2) Cache Miss 발생 시 DB 조회
  console.timeEnd("Cache_Hit_Latency"); 
  console.log(`[Cache Miss - Strategy:${CACHE_STRATEGY}] ${cacheKey}`);
  
  console.time("Baseline_DB_Latency"); // 성능 비교를 위해 동일 타이머 사용
  const data = await playerModel.findByName(name);
  console.timeEnd("Baseline_DB_Latency");

  // 3) 조회한 데이터를 Redis에 저장 (Cache Store)
  if (data && data.length > 0) {
    if (CACHE_STRATEGY === 'TTL') {
      // TTL 모드: 3600초(1시간) 후 자동 삭제. Redis에서 TTL 확인 가능.
      await redis.set(cacheKey, JSON.stringify(data), "EX", 30);
      console.log(`[Redis Store] TTL 적용: 3600s`);
    } else {
      // EVENT 모드: EX 옵션 없음. 영구 저장 (TTL 조회 시 -1 출력).
      await redis.set(cacheKey, JSON.stringify(data));
      console.log(`[Redis Store] EVENT 적용: 영구 저장`);
    }
  }

  return data;
}

// 2. 수정(UPDATE) 함수
async function updatePlayer(playerId, name, stats) {
  // DB 업데이트는 공통 사항
  await playerModel.updatePlayerStats(playerId, stats);

  // --- [전략별 캐시 무효화 분기] ---
  
  // 1. Redis가 꺼져있거나 전략이 TTL이면 캐시를 건드리지 않음
  if (REDIS_ENABLED === false) {
    console.log(`[Baseline] DB만 수정함 (Redis 비활성)`);
    return { success: true };
  }

  if (CACHE_STRATEGY === 'EVENT') {
    // 2. EVENT 모드일 때만 명시적으로 삭제 (Invalidation)
    const cacheKey = `player:name:${name}`;
    await redis.del(cacheKey); 
    console.log(`[Cache Invalidation] EVENT 모드: 캐시 즉시 삭제 완료: ${cacheKey}`);
  } else {
    // 3. TTL 모드일 때는 삭제 로직을 타지 않음 (유효기간 만료까지 대기)
    console.log(`[TTL Mode] 데이터 수정됨. 캐시 삭제 안함 (시간 만료 대기)`);
  }
  
  return { success: true };
}

module.exports = { getPlayerByName, updatePlayer };