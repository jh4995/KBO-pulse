import http from "k6/http";
import { check } from "k6";
import { Counter, Trend } from "k6/metrics";

const BASE_URL = "http://localhost";
const GAME_ID = 1561;

const rankingSuccess = new Counter("ranking_success");
const rankingFail = new Counter("ranking_fail");
const rankingDuration = new Trend("ranking_duration", true);

export const options = {
  scenarios: {
    ranking_iter: {
      executor: "shared-iterations",
      iterations: 200000,
      vus: 400,
      maxDuration: "30m",
    },
  },
};

export default function () {
  const url = `${BASE_URL}/api/vote/${GAME_ID}/ranking?limit=5`;
  const params = { tags: { name: "GET_ranking" } };

  const res = http.get(url, params);
  rankingDuration.add(res.timings.duration);

  const ok = check(res, {
    "status 200": (r) => r.status === 200,
    "has data": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true && Array.isArray(body.data);
      } catch { return false; }
    },
  });

  if (ok) { rankingSuccess.add(1); } else { rankingFail.add(1); }
}