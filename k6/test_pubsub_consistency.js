/**
 * ──────────────────────────────────────────────
 * 부하테스트 #5: Pub/Sub 캐시 일관성 검증  (B 기능4)
 * ──────────────────────────────────────────────
 * 목적: app-1에서 투표 → app-2에서 랭킹 조회 시
 *       Pub/Sub 캐시 무효화가 정상 동작하는지 검증
 *
 * 시나리오:
 *   Writer VU: 한 경기에 투표를 지속적으로 발생시킴
 *   Reader VU: 같은 경기의 랭킹을 반복 조회하면서
 *              "이전 응답보다 투표 수가 같거나 증가했는지" 확인
 *              (stale 응답이면 감소하는 경우가 발생)
 *
 * 핵심 측정:
 *   - stale_response_rate: 랭킹이 이전보다 감소한 비율
 *   - Nginx 라운드 로빈으로 app-1/app-2가 번갈아 응답하므로
 *     Pub/Sub이 없으면 stale 비율이 높고, 있으면 0에 수렴
 *
 * 전제 조건:
 *   - REDIS_ENABLED=true
 *   - Pub/Sub cacheInvalidator가 양쪽 서버에서 동작 중
 *
 * 실행:
 *   k6 run k6/test_pubsub_consistency.js
 * ──────────────────────────────────────────────
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Counter, Trend } from "k6/metrics";

// ── 커스텀 메트릭 ──
const staleRate = new Rate("stale_response_rate");
const freshRate = new Rate("fresh_response_rate");
const instanceSwitch = new Counter("instance_switch_count");
const readLatency = new Trend("read_latency", true);
const writeLatency = new Trend("write_latency", true);

// ── 설정 ──
const BASE_URL = __ENV.BASE_URL || "http://localhost";
const TARGET_GAME_ID = parseInt(__ENV.TARGET_GAME_ID || "2");
const TOTAL_USERS = parseInt(__ENV.TOTAL_USERS || "50000");
const MAX_PLAYER_ID = parseInt(__ENV.MAX_PLAYER_ID || "810");

export const options = {
  scenarios: {
    // 투표를 지속적으로 발생시키는 Writer
    writers: {
      executor: "constant-vus",
      vus: 50,
      duration: "60s",
      exec: "writeVote",
      tags: { role: "writer" },
    },
    // 랭킹을 반복 조회하면서 stale 여부를 확인하는 Reader
    readers: {
      executor: "constant-vus",
      vus: 100,
      duration: "60s",
      exec: "readRanking",
      tags: { role: "reader" },
    },
  },
  thresholds: {
    stale_response_rate: ["rate<0.05"],  // stale 응답 5% 미만이면 성공
  },
};

// ── Writer: 투표 발생 ──
export function writeVote() {
  const userId = Math.floor(Math.random() * TOTAL_USERS) + 1;
  const playerId = Math.floor(Math.random() * MAX_PLAYER_ID) + 1;

  const url = `${BASE_URL}/api/vote/${TARGET_GAME_ID}/${playerId}`;
  const payload = JSON.stringify({ userId });
  const params = {
    headers: { "Content-Type": "application/json" },
    tags: { name: "POST_vote_writer" },
  };

  const res = http.post(url, payload, params);
  writeLatency.add(res.timings.duration);

  sleep(Math.random() * 0.3);
}

// ── Reader: 랭킹 조회 + stale 감지 ──
// VU별로 이전 응답의 총 투표 수를 추적
let prevTotalByVU = {};

export function readRanking() {
  const url = `${BASE_URL}/api/vote/${TARGET_GAME_ID}/ranking?limit=50`;
  const res = http.get(url, { tags: { name: "GET_ranking_reader" } });
  readLatency.add(res.timings.duration);

  if (res.status !== 200) {
    sleep(0.2);
    return;
  }

  try {
    const body = JSON.parse(res.body);
    const currentTotal = body.data.reduce(
      (sum, p) => sum + (p.vote_count || 0),
      0
    );

    // 이전 값과 비교
    const vuKey = `vu_${__VU}`;
    const prevTotal = prevTotalByVU[vuKey] || 0;

    if (prevTotal > 0 && currentTotal < prevTotal) {
      // 투표 수가 줄었다 = stale 캐시에서 응답받음
      staleRate.add(true);
      freshRate.add(false);
    } else {
      staleRate.add(false);
      freshRate.add(true);
    }

    prevTotalByVU[vuKey] = currentTotal;

    // 응답한 인스턴스 추적
    const instanceId = res.headers["X-Instance-Id"];
    const prevInstance = prevTotalByVU[`${vuKey}_instance`];
    if (prevInstance && prevInstance !== instanceId) {
      instanceSwitch.add(1); // app-1 ↔ app-2 전환 발생
    }
    prevTotalByVU[`${vuKey}_instance`] = instanceId;
  } catch (e) {
    // 파싱 실패 무시
  }

  sleep(Math.random() * 0.2);
}

import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: "  ", enableColors: true }),
  };
}