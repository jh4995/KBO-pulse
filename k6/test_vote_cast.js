/**
 * ──────────────────────────────────────────────
 * 부하테스트 #1: MVP 투표 동시 요청  (B 기능1)
 * ──────────────────────────────────────────────
 * 목적: castVote()의 대조군(DB) vs 실험군(Redis) 성능 비교
 *
 * 측정 지표:
 *   - 응답 시간 (p50, p95, p99)
 *   - RPS (초당 처리 요청 수)
 *   - 에러율 (409 중복 투표 vs 5xx 서버 에러 분리)
 *   - 분산 락 acquire/reject 비율
 *
 * 시나리오:
 *   50,000명의 유저가 랜덤 경기 + 랜덤 선수에게 투표
 *   VU 100 → 300 → 500 → 1000 단계적 증가
 *
 * 실행:
 *   k6 run k6/test_vote_cast.js
 *   k6 run k6/test_vote_cast.js --out json=results/vote_cast.json
 * ──────────────────────────────────────────────
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Counter, Trend } from "k6/metrics";

// ── 커스텀 메트릭 ──
const voteSuccess = new Rate("vote_success_rate");
const duplicateVote = new Counter("duplicate_vote_count");
const serverError = new Counter("server_error_count");
const voteDuration = new Trend("vote_duration", true);

// ── 설정 ──
const BASE_URL = __ENV.BASE_URL || "http://localhost";
const TOTAL_USERS = parseInt(__ENV.TOTAL_USERS || "50000");
const TOTAL_GAMES = parseInt(__ENV.TOTAL_GAMES || "1561");
const MAX_PLAYER_ID = parseInt(__ENV.MAX_PLAYER_ID || "810");

export const options = {
  scenarios: {
    vote_rampup: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "15s", target: 100 },   // 워밍업
        { duration: "30s", target: 100 },   // 100 VU 유지
        { duration: "15s", target: 300 },   // 300 VU로 증가
        { duration: "30s", target: 300 },   // 300 VU 유지
        { duration: "15s", target: 500 },   // 500 VU로 증가
        { duration: "30s", target: 500 },   // 500 VU 유지
        { duration: "15s", target: 1000 },  // 1000 VU 피크
        { duration: "30s", target: 1000 },  // 1000 VU 유지
        { duration: "10s", target: 0 },     // 쿨다운
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    vote_success_rate: ["rate>0.8"],
  },
};

export default function () {
  // 각 VU마다 고유한 userId 할당 (VU ID 기반)
  const userId = (__VU % TOTAL_USERS) + 1;

  // 매 반복마다 랜덤 경기 + 랜덤 선수 선택
  const gameId = Math.floor(Math.random() * TOTAL_GAMES) + 1;
  const playerId = Math.floor(Math.random() * MAX_PLAYER_ID) + 1;

  const url = `${BASE_URL}/api/vote/${gameId}/${playerId}`;
  const payload = JSON.stringify({ userId });
  const params = {
    headers: { "Content-Type": "application/json" },
    tags: { name: "POST_vote" },
  };

  const res = http.post(url, payload, params);

  // 응답 시간 기록
  voteDuration.add(res.timings.duration);

  // 상태 코드별 분류
  if (res.status === 201) {
    voteSuccess.add(true);
  } else if (res.status === 409) {
    voteSuccess.add(false);
    duplicateVote.add(1);
  } else {
    voteSuccess.add(false);
    serverError.add(1);
  }

  check(res, {
    "status is 201 or 409": (r) => r.status === 201 || r.status === 409,
    "response has success field": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success !== undefined;
      } catch {
        return false;
      }
    },
    "response has method field": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.data && (body.data.method === "redis" || body.data.method === "db");
      } catch {
        return false;
      }
    },
  });

  // 로드밸런싱 확인: 어느 인스턴스가 응답했는지
  const instanceId = res.headers["X-Instance-Id"];
  if (instanceId) {
    check(res, {
      "instance header present": () => true,
    });
  }

  sleep(Math.random() * 0.5); // 0~0.5초 랜덤 대기
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: "  ", enableColors: true }),
  };
}

// k6 내장 textSummary
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";
