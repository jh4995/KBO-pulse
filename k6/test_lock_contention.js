/**
 * ──────────────────────────────────────────────
 * 부하테스트 #6: 분산 락 경합 테스트  (B 기능1 심화)
 * ──────────────────────────────────────────────
 * 목적: 동일 경기 + 동일 유저에 대한 동시 투표 요청 시
 *       분산 락(SET NX EX)의 원자성 검증
 *
 * 시나리오:
 *   소수의 유저(100명)가 소수의 경기(5개)에 집중 투표
 *   → 높은 중복 비율 유발 → 409 비율 측정
 *   → 대조군(DB UNIQUE) vs 실험군(Redis NX) 비교
 *
 * 핵심 측정:
 *   - 409 응답 비율: 높을수록 중복 방지가 정상 동작
 *   - 5xx 에러: 0이어야 함 (락 경합으로 인한 크래시 없어야 함)
 *   - 대조군: PostgreSQL row-level lock contention 발생 시 응답 시간 증가 관찰
 *   - 실험군: SET NX EX는 lock-free이므로 응답 시간 일정해야 함
 *
 * 실행:
 *   k6 run k6/test_lock_contention.js
 * ──────────────────────────────────────────────
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Counter, Trend } from "k6/metrics";

// ── 커스텀 메트릭 ──
const duplicateRate = new Rate("duplicate_rejection_rate");
const firstVoteLatency = new Trend("first_vote_latency", true);
const duplicateLatency = new Trend("duplicate_vote_latency", true);
const serverErrors = new Counter("server_error_5xx");

// ── 설정 ──
const BASE_URL = __ENV.BASE_URL || "http://localhost";

// 의도적으로 좁은 범위 설정 → 경합 극대화
const NUM_USERS = 100;
const NUM_GAMES = 5;
const NUM_PLAYERS = 20;

export const options = {
  scenarios: {
    lock_contention: {
      executor: "constant-vus",
      vus: 200,       // 200 VU가 100명의 유저를 공유 → 높은 충돌률
      duration: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],  // 5xx 에러 1% 미만
  },
};

export default function () {
  // 좁은 범위에서 랜덤 선택 → 중복 확률 극대화
  const userId = Math.floor(Math.random() * NUM_USERS) + 1;
  const gameId = Math.floor(Math.random() * NUM_GAMES) + 1;
  const playerId = Math.floor(Math.random() * NUM_PLAYERS) + 1;

  const url = `${BASE_URL}/api/vote/${gameId}/${playerId}`;
  const payload = JSON.stringify({ userId });
  const params = {
    headers: { "Content-Type": "application/json" },
    tags: { name: "POST_vote_contention" },
  };

  const res = http.post(url, payload, params);

  if (res.status === 201) {
    duplicateRate.add(false); // 첫 투표 성공
    firstVoteLatency.add(res.timings.duration);
  } else if (res.status === 409) {
    duplicateRate.add(true); // 중복 거절
    duplicateLatency.add(res.timings.duration);
  } else {
    serverErrors.add(1);
  }

  check(res, {
    "no server error": (r) => r.status !== 500,
    "valid response": (r) => r.status === 201 || r.status === 409,
    "response body parseable": (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    },
  });

  // 빠르게 반복하여 경합 극대화
  sleep(Math.random() * 0.05);
}

import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: "  ", enableColors: true }),
  };
}