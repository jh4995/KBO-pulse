const Redis = require("ioredis");
const { redis } = require("../config/redis");
const voteModel = require("../models/voteModel");

const REDIS_ENABLED = process.env.REDIS_ENABLED !== "false";
const INSTANCE_ID = process.env.APP_INSTANCE_ID || "local";
const WRITE_BEHIND_INTERVAL = parseInt(
  process.env.WRITE_BEHIND_INTERVAL || "30000"
);

// ──────────────────────────────────────────────
// Redis 키 네이밍 컨벤션
// - A(stats), C(game)의 키와 prefix가 겹치지 않도록 구분
// ──────────────────────────────────────────────
const KEYS = {
  voteLock: (gameId, userId) => `lock:vote:game:${gameId}:user:${userId}`,
  voteCount: (gameId, playerId) =>
    `vote:count:game:${gameId}:player:${playerId}`,
  ranking: (gameId) => `ranking:game:${gameId}`,
  queue: "vote:queue",
};

const LOCK_TTL = 7200;
const CACHE_CHANNEL = "cache:invalidate";
const BATCH_SIZE = 100;

// ──────────────────────────────────────────────
// 모듈 내부 상태 (init/cleanup으로만 관리)
// - subscriber, timer를 이 파일 안에서만 생성/정리
// - config/redis.js와 app.js를 건드리지 않음
// ──────────────────────────────────────────────
let subscriber = null;
let writeBehindTimer = null;

// ──────────────────────────────────────────────
// 초기화 / 정리
// ──────────────────────────────────────────────

/**
 * REDIS_ENABLED=true일 때만 호출
 * - Pub/Sub 구독용 별도 Redis 연결 생성
 * - Write-Behind 주기적 flush 타이머 등록
 *
 * app.js에서 init() 한 줄만 호출하면 됨
 */
function init() {
  if (!REDIS_ENABLED) return;

  // Pub/Sub 전용 Redis 연결 (subscribe 모드 전용)
  subscriber = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
  });

  subscriber.subscribe(CACHE_CHANNEL, (err) => {
    if (err) {
      console.error(`[${INSTANCE_ID}] Pub/Sub 구독 실패:`, err.message);
    } else {
      console.log(`[${INSTANCE_ID}] Pub/Sub 구독 시작: ${CACHE_CHANNEL}`);
    }
  });

  subscriber.on("message", (channel, message) => {
    if (channel === CACHE_CHANNEL) {
      handleCacheInvalidation(message);
    }
  });

  // Write-Behind 배치 타이머
  writeBehindTimer = setInterval(() => {
    flushVoteQueue().catch((err) => {
      console.error(`[${INSTANCE_ID}] Write-Behind 에러:`, err.message);
    });
  }, WRITE_BEHIND_INTERVAL);

  console.log(
    `[${INSTANCE_ID}] Vote 초기화 완료 (Write-Behind: ${WRITE_BEHIND_INTERVAL / 1000}초 간격)`
  );
}

/**
 * Graceful Shutdown 시 호출
 * - Write-Behind 타이머 정리 + 마지막 flush
 * - Pub/Sub 구독 해제
 */
async function cleanup() {
  if (writeBehindTimer) {
    clearInterval(writeBehindTimer);
    writeBehindTimer = null;

    try {
      console.log(`[${INSTANCE_ID}] 종료 전 마지막 Write-Behind flush...`);
      await flushVoteQueue();
    } catch (err) {
      console.error(`[${INSTANCE_ID}] 마지막 flush 실패:`, err.message);
    }
  }

  if (subscriber) {
    subscriber.disconnect();
    subscriber = null;
  }
}

// ──────────────────────────────────────────────
// 투표 처리
// ──────────────────────────────────────────────

async function castVote(gameId, playerId, userId) {
  if (REDIS_ENABLED) {
    return castVoteRedis(gameId, playerId, userId);
  }
  return castVoteDB(gameId, playerId, userId);
}

/**
 * [대조군] DB만 사용하는 투표 처리
 */
async function castVoteDB(gameId, playerId, userId) {
  const isDuplicate = await voteModel.checkDuplicate(gameId, userId);
  if (isDuplicate) {
    const err = new Error("이미 이 경기에 투표하셨습니다");
    err.status = 409;
    err.code = "DUPLICATE_VOTE";
    throw err;
  }

  const row = await voteModel.insertVote(gameId, playerId, userId);

  return {
    voteId: row.vote_id,
    gameId: Number(gameId),
    playerId: Number(playerId),
    userId: Number(userId),
    votedAt: row.voted_at,
    method: "db",
  };
}

/**
 * [실험군] Redis를 사용하는 투표 처리
 *
 * 1) SET NX EX  → 분산 락 (중복 투표 방지)
 * 2) INCR       → 투표 카운터 atomic 증가
 * 3) ZINCRBY    → Sorted Set 랭킹 갱신
 * 4) LPUSH      → Write-Behind 큐에 추가
 * 5) PUBLISH    → Pub/Sub 캐시 무효화 알림
 */
async function castVoteRedis(gameId, playerId, userId) {
  // 1) 분산 락
  const lockKey = KEYS.voteLock(gameId, userId);
  const locked = await redis.set(lockKey, INSTANCE_ID, "EX", LOCK_TTL, "NX");

  if (locked === null) {
    const err = new Error("이미 이 경기에 투표하셨습니다");
    err.status = 409;
    err.code = "DUPLICATE_VOTE";
    throw err;
  }

  // 2) 투표 카운터 증가
  const countKey = KEYS.voteCount(gameId, playerId);
  const newCount = await redis.incr(countKey);

  // 3) Sorted Set 랭킹 갱신
  const rankKey = KEYS.ranking(gameId);
  await redis.zincrby(rankKey, 1, String(playerId));

  // 4) Write-Behind 큐에 추가
  const voteData = JSON.stringify({
    gameId: Number(gameId),
    playerId: Number(playerId),
    userId: Number(userId),
    timestamp: new Date().toISOString(),
  });
  await redis.lpush(KEYS.queue, voteData);

  // 5) Pub/Sub 캐시 무효화 알림
  await redis.publish(
    CACHE_CHANNEL,
    JSON.stringify({
      type: "vote",
      gameId: Number(gameId),
      playerId: Number(playerId),
      instance: INSTANCE_ID,
    })
  );

  return {
    gameId: Number(gameId),
    playerId: Number(playerId),
    userId: Number(userId),
    voteCount: newCount,
    method: "redis",
  };
}

// ──────────────────────────────────────────────
// 랭킹 조회
// ──────────────────────────────────────────────

async function getRanking(gameId, limit = 10) {
  if (REDIS_ENABLED) {
    return getRankingRedis(gameId, limit);
  }
  return getRankingDB(gameId, limit);
}

/**
 * [대조군] DB에서 GROUP BY + ORDER BY로 랭킹 조회
 */
async function getRankingDB(gameId, limit) {
  return voteModel.getRankingByGame(gameId, limit);
}

/**
 * [실험군] Redis Sorted Set에서 ZREVRANGE로 랭킹 조회
 * - O(log N + M) → DB GROUP BY 대비 압도적으로 빠름
 */
async function getRankingRedis(gameId, limit) {
  const rankKey = KEYS.ranking(gameId);
  const raw = await redis.zrevrange(rankKey, 0, limit - 1, "WITHSCORES");

  if (raw.length === 0) return [];

  // raw: ["playerId1", "score1", "playerId2", "score2", ...]
  const entries = [];
  const playerIds = [];

  for (let i = 0; i < raw.length; i += 2) {
    const playerId = parseInt(raw[i], 10);
    const voteCount = parseInt(raw[i + 1], 10);
    entries.push({ player_id: playerId, vote_count: voteCount });
    playerIds.push(playerId);
  }

  // DB에서 선수명/팀 보강
  const players = await voteModel.getPlayersByIds(playerIds);
  const playerMap = new Map(players.map((p) => [p.player_id, p]));

  return entries.map((e) => {
    const player = playerMap.get(e.player_id);
    return {
      player_id: e.player_id,
      name: player ? player.name : "Unknown",
      team_short: player ? player.team_short : "???",
      vote_count: e.vote_count,
    };
  });
}

// ──────────────────────────────────────────────
// Write-Behind 배치 동기화
// ──────────────────────────────────────────────

/**
 * Redis vote:queue에서 투표 데이터를 꺼내 DB에 INSERT
 * - RPOP으로 FIFO 순서 (LPUSH → RPOP)
 * - 한 번에 최대 BATCH_SIZE건
 * - UNIQUE 위반(이미 동기화된 건)은 무시
 */
async function flushVoteQueue() {
  let processed = 0;
  let skipped = 0;

  for (let i = 0; i < BATCH_SIZE; i++) {
    const raw = await redis.rpop(KEYS.queue);
    if (raw === null) break;

    try {
      const { gameId, playerId, userId } = JSON.parse(raw);
      await voteModel.insertVote(gameId, playerId, userId);
      processed++;
    } catch (err) {
      if (err.code === "23505") {
        // PostgreSQL UNIQUE 위반 → 이미 동기화된 건
        skipped++;
      } else {
        console.error("[Write-Behind] DB INSERT 실패:", err.message);
        await redis.rpush(KEYS.queue, raw);
        break;
      }
    }
  }

  if (processed > 0 || skipped > 0) {
    console.log(
      `[Write-Behind][${INSTANCE_ID}] 처리: ${processed}건, 스킵: ${skipped}건`
    );
  }
}

// ──────────────────────────────────────────────
// Pub/Sub 메시지 핸들러
// ──────────────────────────────────────────────

/**
 * cache:invalidate 메시지 수신 시 호출
 * - 자기가 보낸 메시지는 무시
 * - 향후 인메모리 캐시 도입 시 여기서 무효화 로직 추가
 */
function handleCacheInvalidation(message) {
  try {
    const data = JSON.parse(message);

    if (data.instance === INSTANCE_ID) return;

    console.log(
      `[Pub/Sub][${INSTANCE_ID}] 캐시 무효화 수신: game=${data.gameId}, from=${data.instance}`
    );
  } catch (err) {
    console.error("[Pub/Sub] 메시지 파싱 실패:", err.message);
  }
}

module.exports = {
  init,
  cleanup,
  castVote,
  getRanking,
};
