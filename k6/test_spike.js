/**
 * ──────────────────────────────────────────────
 * 부하테스트 #7: 스파이크 트래픽 시뮬레이션  (B 전체 기능 스트레스)
 * ──────────────────────────────────────────────
 * 목적: 경기 종료 직전 MVP 투표 폭주 상황 시뮬레이션
 *   - 평상시 50 VU → 갑자기 2000 VU 스파이크 → 다시 50 VU 복귀
 *   - 스파이크 구간에서의 에러율, 응답 시간 급증 여부 관찰
 *   - Graceful degradation 검증
 *
 * 측정 지표:
 *   - 스파이크 구간 vs 평상시 구간의 p95 비교
 *   - 스파이크 중 에러율 (5xx)
 *   - 스파이크 후 복구 시간 (응답 시간이 평상시로 돌아오는 데 걸리는 시간)
 *
 * 시나리오:
 *   투표 50% + 랭킹 조회 50% 혼합
 *
 * 실행:
 *   k6 run k6/test_spike.js
 * ──────────────────────────────────────────────
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";

// ── 커스텀 메트릭 ──
const spikeDuration = new Trend("spike_phase_duration", true);
const normalDuration = new Trend("normal_phase_duration", true);
const spikeErrors = new Counter("spike_phase_errors");
const overallSuccess = new Rate("overall_success_rate");

// ── 설정 ──
const BASE_URL = __ENV.BASE_URL || "http://localhost";
const TOTAL_USERS = parseInt(__ENV.TOTAL_USERS || "50000");
const TOTAL_GAMES = parseInt(__ENV.TOTAL_GAMES || "1561");
const MAX_PLAYER_ID = parseInt(__ENV.MAX_PLAYER_ID || "810");

export const options = {
  scenarios: {
    spike_test: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 50 },    // 워밍업: 평상시 수준
        { duration: "30s", target: 50 },    // 평상시 유지 (베이스라인)
        { duration: "5s",  target: 2000 },  // 급격한 스파이크! (5초 만에 50→2000)
        { duration: "20s", target: 2000 },  // 스파이크 유지
        { duration: "5s",  target: 50 },    // 급격한 하강
        { duration: "30s", target: 50 },    // 복구 구간 (응답 시간 안정화 관찰)
        { duration: "5s",  target: 0 },     // 종료
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(99)<3000"],  // 스파이크 포함해도 3초 이내
    overall_success_rate: ["rate>0.90"], // 스파이크 중에도 90% 이상 성공
  },
};

export default function () {
  // 현재 VU 수로 스파이크 여부 추정
  const isSpike = __VU > 100;
  const metricTrend = isSpike ? spikeDuration : normalDuration;

  if (Math.random() < 0.5) {
    // ── 투표 ──
    const userId = Math.floor(Math.random() * TOTAL_USERS) + 1;
    const gameId = Math.floor(Math.random() * TOTAL_GAMES) + 1;
    const playerId = Math.floor(Math.random() * MAX_PLAYER_ID) + 1;

    const url = `${BASE_URL}/api/vote/${gameId}/${playerId}`;
    const payload = JSON.stringify({ userId });
    const params = {
      headers: { "Content-Type": "application/json" },
      tags: { name: "POST_vote_spike" },
    };

    const res = http.post(url, payload, params);
    metricTrend.add(res.timings.duration);

    const ok = res.status === 201 || res.status === 409;
    overallSuccess.add(ok);
    if (!ok && isSpike) spikeErrors.add(1);

    check(res, {
      "vote: no 5xx": (r) => r.status < 500,
    });
  } else {
    // ── 랭킹 조회 ──
    const gameId = Math.floor(Math.random() * TOTAL_GAMES) + 1;
    const url = `${BASE_URL}/api/vote/${gameId}/ranking?limit=10`;
    const res = http.get(url, { tags: { name: "GET_ranking_spike" } });
    metricTrend.add(res.timings.duration);

    const ok = res.status === 200;
    overallSuccess.add(ok);
    if (!ok && isSpike) spikeErrors.add(1);

    check(res, {
      "ranking: no 5xx": (r) => r.status < 500,
    });
  }

  sleep(Math.random() * 0.1);
}

import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: "  ", enableColors: true }),
  };
}