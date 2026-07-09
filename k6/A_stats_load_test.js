import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";

// ── 커스텀 메트릭 ──────────────────────────────────
const readLatency  = new Trend("read_latency",  true);
const writeLatency = new Trend("write_latency", true);
const readCount    = new Counter("read_count");
const writeCount   = new Counter("write_count");

// ── 설정 ────────────────────────────────────────────
// Nginx 리버스 프록시를 통해 app-1, app-2로 분산
const BASE_URL = __ENV.BASE_URL || "http://localhost";

// 선수 이름 풀
const PLAYERS = [
  '최정','푸이그','홍창기','고효준','손주환',
  '김헌곤','이준영','강백호','김종수','추신수',
  '김형준','김진수','김민준','임근우','위즈덤',
  '김재혁','이재원','박주홍','이진영','문보경',
  '신민재','김태훈','김도영','주성원','박동원',
  '김창평','박해민','박헌','김연주','문현빈',
  '오스틴','진우영','박찬호','주효상','박인우',
  '윤준혁','문성주','오지환','고명준','최정용',
  '구본혁','육선엽','박성한','박영빈','박신지',
  '김준태','전경원','류현준','김대유','김선빈'
];

// ── 부하 단계 ────────────────────────────────────────
// [변경 이유]
// 기존 테스트(VU 200→500→1000)는 pool max 20 환경에서
// 대부분의 요청이 연결 대기 → 타임아웃으로 터지는 Stress Test였음.
// 재테스트 목적: 에러율 5% 미만이 유지되는 정상 부하 구간에서
// 세 전략의 순수 응답속도 차이를 비교하는 것.
//
// VU 20  = pool max(20) 이하 → 에러 거의 0%, 안정 비교 구간
// VU 30  = pool 약간 초과    → Redis 캐시의 DB 압박 흡수 효과가 드러나는 구간
export const options = {
  stages: [
    { duration: "2m", target: 10 },  // 워밍업 — 캐시 초기 적재 구간
    { duration: "3m", target: 20 },  // 안정 구간 — pool 한계 이하, 핵심 비교 구간
    { duration: "3m", target: 30 },  // 관찰 구간 — pool 약간 초과, 전략 간 차이 부각
    { duration: "2m", target: 0  },  // 쿨다운
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"], // 정상 부하 구간 기준: p95 500ms 이내
    http_req_failed:   ["rate<0.05"], // 에러율 5% 미만 유지 확인
  },
};

// ── 헬퍼 ────────────────────────────────────────────
function randomPlayer() {
  return PLAYERS[Math.floor(Math.random() * PLAYERS.length)];
}

// ── 메인 시나리오 ────────────────────────────────────
export default function () {
  const name = randomPlayer();

  if (Math.random() < 0.01) {
    // ── 쓰기 10%: PUT (DB UPDATE + 캐시 무효화 트리거) ──
    const payload = JSON.stringify({
      home_runs: Math.floor(Math.random() * 40),
      rbi:       Math.floor(Math.random() * 100),
    });

    const res = http.put(
      `${BASE_URL}/api/stats/players/name/${encodeURIComponent(name)}`,
      payload,
      { headers: { "Content-Type": "application/json" } }
    );

    writeLatency.add(res.timings.duration);
    writeCount.add(1);
    check(res, { "PUT 200": (r) => r.status === 200 });

  } else {
    // ── 읽기 90%: GET (Look-Aside 캐싱 경로) ──
    const res = http.get(
      `${BASE_URL}/api/stats/players/name/${encodeURIComponent(name)}`
    );

    readLatency.add(res.timings.duration);
    readCount.add(1);
    check(res, { "GET 200": (r) => r.status === 200 });
  }

  sleep(0.1);
}

// import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";

// export function handleSummary(data) {
//   return {
//     "results/ttl_graph_report_prom.html": htmlReport(data),
//   };
// }