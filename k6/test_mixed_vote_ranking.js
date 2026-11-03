import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";

const voteDuration = new Trend("vote_duration", true);
const rankingDuration = new Trend("ranking_duration", true);
const voteErrors = new Counter("vote_errors");
const rankingErrors = new Counter("ranking_errors");

const BASE_URL = __ENV.BASE_URL || "http://localhost";
const TOTAL_USERS = parseInt(__ENV.TOTAL_USERS || "50000");
const TOTAL_GAMES = parseInt(__ENV.TOTAL_GAMES || "1561");
const MAX_PLAYER_ID = parseInt(__ENV.MAX_PLAYER_ID || "810");
const WRITE_RATIO = parseFloat(__ENV.WRITE_RATIO || "0.3");

export const options = {
  scenarios: {
    mixed_load: {
      executor: "constant-vus",
      vus: 500,
      duration: "120s",
    },
  },
  thresholds: {
    vote_duration: ["p(95)<500"],
    ranking_duration: ["p(95)<200"],
    http_req_failed: ["rate<0.05"],
  },
};

function castVote() {
  const userId = Math.floor(Math.random() * TOTAL_USERS) + 1;
  const gameId = Math.floor(Math.random() * TOTAL_GAMES) + 1;
  const playerId = Math.floor(Math.random() * MAX_PLAYER_ID) + 1;

  const url = BASE_URL + "/api/vote/" + gameId + "/" + playerId;
  const payload = JSON.stringify({ userId: userId });
  const params = {
    headers: { "Content-Type": "application/json" },
    tags: { name: "POST_vote_mixed" },
  };

  const res = http.post(url, payload, params);
  voteDuration.add(res.timings.duration);

  if (res.status !== 201 && res.status !== 409) {
    voteErrors.add(1);
  }

  check(res, {
    "vote: valid status": function (r) { return r.status === 201 || r.status === 409; },
  });
}

function getRanking() {
  const gameId = Math.floor(Math.random() * TOTAL_GAMES) + 1;

  const url = BASE_URL + "/api/vote/" + gameId + "/ranking?limit=10";
  const res = http.get(url, { tags: { name: "GET_ranking_mixed" } });
  rankingDuration.add(res.timings.duration);

  if (res.status !== 200) {
    rankingErrors.add(1);
  }

  check(res, {
    "ranking: status 200": function (r) { return r.status === 200; },
  });
}

export default function () {
  if (Math.random() < WRITE_RATIO) {
    castVote();
  } else {
    getRanking();
  }
  sleep(Math.random() * 0.2);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: "  ", enableColors: true }),
  };
}