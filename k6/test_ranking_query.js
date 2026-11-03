/**
 * ──────────────────────────────────────────────
 * 부하테스트 #2: 투표 랭킹 조회  (B 기능2)
 * ──────────────────────────────────────────────
 * 목적: getRanking()의 대조군(GROUP BY + ORDER BY) vs 실험군(ZREVRANGE) 비교
 *
 * 측정 지표:
 *   - 응답 시간 (p50, p95, p99)
 *   - RPS
 *   - 응답 데이터 정합성 (ranking 배열 길이, vote_count 존재 여부)
 *
 * 전제 조건:
 *   - votes 테이블에 충분한 synthetic 데이터가 적재된 상태
 *   - 실험군의 경우, Redis Sorted Set에도 데이터가 로드된 상태
 *     (사전에 투표 API를 통해 Redis에 데이터를 생성하거나,
 *      별도의 Redis 워밍업 스크립트를 실행해야 함)
 *
 * 실행:
 *   k6 run k6/test_ranking_query.js
 * ──────────────────────────────────────────────
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

// ── 커스텀 메트릭 ──
const rankingDuration = new Trend("ranking_duration", true);
const rankingSuccess = new Rate("ranking_success_rate");
const cacheHit = new Rate("cache_hit_rate");

// ── 설정 ──
const BASE_URL = __ENV.BASE_URL || "http://localhost";
const TOTAL_GAMES = parseInt(__ENV.TOTAL_GAMES || "1561");

export const options = {
  scenarios: {
    ranking_sustained: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 100 },
        { duration: "30s", target: 100 },
        { duration: "10s", target: 500 },
        { duration: "60s", target: 500 },  // 메인 구간: 500 VU × 60초
        { duration: "10s", target: 1000 },
        { duration: "30s", target: 1000 }, // 피크
        { duration: "10s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<300"],
    ranking_success_rate: ["rate>0.99"],
  },
};

export default function () {
  // 랜덤 경기의 랭킹 조회
  const gameId = Math.floor(Math.random() * TOTAL_GAMES) + 1;
  const limit = [5, 10, 20][Math.floor(Math.random() * 3)]; // limit 랜덤 변경

  const url = `${BASE_URL}/api/vote/${gameId}/ranking?limit=${limit}`;
  const res = http.get(url, { tags: { name: "GET_ranking" } });

  rankingDuration.add(res.timings.duration);

  const isSuccess = res.status === 200;
  rankingSuccess.add(isSuccess);

  if (isSuccess) {
    check(res, {
      "response is JSON": (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch {
          return false;
        }
      },
      "data is array": (r) => {
        const body = JSON.parse(r.body);
        return Array.isArray(body.data);
      },
      "ranking has player_id and vote_count": (r) => {
        const body = JSON.parse(r.body);
        if (!body.data || body.data.length === 0) return true; // 빈 배열도 OK
        const first = body.data[0];
        return first.player_id !== undefined && first.vote_count !== undefined;
      },
      "ranking is sorted descending": (r) => {
        const body = JSON.parse(r.body);
        if (!body.data || body.data.length < 2) return true;
        for (let i = 0; i < body.data.length - 1; i++) {
          if (body.data[i].vote_count < body.data[i + 1].vote_count) {
            return false;
          }
        }
        return true;
      },
      "ranking respects limit": (r) => {
        const body = JSON.parse(r.body);
        return body.data.length <= limit;
      },
    });
  }

  sleep(Math.random() * 0.3);
}

import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: "  ", enableColors: true }),
  };
}