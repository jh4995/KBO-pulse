/**
 * ──────────────────────────────────────────────
 * 부하테스트 #4: Write-Behind 정합성 검증  (B 기능3)
 * ──────────────────────────────────────────────
 * 목적: 대량 투표 후 Redis ↔ DB 간 데이터 정합성 검증
 *
 * 시나리오:
 *   Phase 1 — 특정 경기 1개에 대해 대량 투표를 집중 발생시킴
 *   Phase 2 — Write-Behind 배치 동기화 대기 (30초 × 2 = 60초)
 *   Phase 3 — Redis Sorted Set 점수 합계와 DB votes COUNT를 비교
 *
 * 전제 조건:
 *   - REDIS_ENABLED=true 상태에서만 의미 있음
 *   - Write-Behind 배치 간격: 30초 (WRITE_BEHIND_INTERVAL=30000)
 *   - 검증 API가 구현되어 있어야 함:
 *     GET /api/vote/:gameId/verify-sync
 *     (Redis 카운트 vs DB 카운트 비교 결과 반환)
 *
 * 실행:
 *   k6 run k6/test_write_behind.js
 *
 * 판단 기준:
 *   - 동기화 완료 후 diff === 0 이면 정합성 보장됨
 *   - diff > 0이면 아직 동기화 중이거나 유실 발생
 * ──────────────────────────────────────────────
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";

// ── 커스텀 메트릭 ──
const voteCount = new Counter("total_votes_cast");
const syncDiff = new Trend("sync_diff_after_wait");
const integrityPass = new Rate("integrity_pass_rate");

// ── 설정 ──
const BASE_URL = __ENV.BASE_URL || "http://localhost";
const TARGET_GAME_ID = parseInt(__ENV.TARGET_GAME_ID || "1"); // 집중 공격 대상 경기
const TOTAL_USERS = parseInt(__ENV.TOTAL_USERS || "50000");
const MAX_PLAYER_ID = parseInt(__ENV.MAX_PLAYER_ID || "810");

export const options = {
  scenarios: {
    // Phase 1: 대량 투표 발생
    burst_votes: {
      executor: "constant-vus",
      vus: 200,
      duration: "30s",
      exec: "votePhase",
      tags: { phase: "vote" },
    },
    // Phase 2: Write-Behind 동기화 대기 후 검증
    verify_sync: {
      executor: "shared-iterations",
      vus: 1,
      iterations: 5,           // 10초 간격으로 5번 검증
      startTime: "40s",        // 투표 종료 10초 후부터 검증 시작
      exec: "verifyPhase",
      tags: { phase: "verify" },
    },
  },
};

// ── Phase 1: 특정 경기에 투표 집중 ──
export function votePhase() {
  const userId = Math.floor(Math.random() * TOTAL_USERS) + 1;
  const playerId = Math.floor(Math.random() * MAX_PLAYER_ID) + 1;

  const url = `${BASE_URL}/api/vote/${TARGET_GAME_ID}/${playerId}`;
  const payload = JSON.stringify({ userId });
  const params = {
    headers: { "Content-Type": "application/json" },
    tags: { name: "POST_vote_burst" },
  };

  const res = http.post(url, payload, params);

  if (res.status === 201) {
    voteCount.add(1);
  }

  check(res, {
    "vote accepted or duplicate": (r) => r.status === 201 || r.status === 409,
  });

  sleep(Math.random() * 0.1);
}

// ── Phase 2: 정합성 검증 ──
export function verifyPhase() {
  sleep(10); // 각 검증 사이 10초 대기 (Write-Behind 동기화 여유)

  // 방법 1: 별도 검증 API가 있는 경우
  const verifyUrl = `${BASE_URL}/api/vote/${TARGET_GAME_ID}/verify-sync`;
  let res = http.get(verifyUrl, { tags: { name: "GET_verify_sync" } });

  if (res.status === 200) {
    try {
      const body = JSON.parse(res.body);
      if (body.data && body.data.diff !== undefined) {
        syncDiff.add(Math.abs(body.data.diff));
        integrityPass.add(body.data.diff === 0);
        console.log(
          `[검증] Redis: ${body.data.redisTotal}, DB: ${body.data.dbTotal}, Diff: ${body.data.diff}`
        );
      }
    } catch (e) {
      console.log(`[검증] 파싱 실패: ${res.body}`);
    }
  } else if (res.status === 404) {
    // 방법 2: 검증 API가 없으면 랭킹 API로 간접 확인
    console.log("[검증] verify-sync API 미구현. 랭킹 API로 간접 확인.");
    res = http.get(`${BASE_URL}/api/vote/${TARGET_GAME_ID}/ranking?limit=100`, {
      tags: { name: "GET_ranking_verify" },
    });
    check(res, {
      "ranking returns data": (r) => r.status === 200,
    });
    if (res.status === 200) {
      const body = JSON.parse(res.body);
      const totalVotes = body.data.reduce((sum, p) => sum + p.vote_count, 0);
      console.log(`[간접 검증] 랭킹 기반 총 투표 수: ${totalVotes}`);
    }
  }
}

import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: "  ", enableColors: true }),
  };
}