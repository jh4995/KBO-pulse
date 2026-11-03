import http from "k6/http";
import { check } from "k6";
import { Counter, Trend } from "k6/metrics";

const BASE_URL = "http://localhost";
const GAME_ID = 1561;
const TOTAL = 200000;
const VUS = 400;
const PER_VU = Math.ceil(TOTAL / VUS);  // 500
const PLAYER_IDS = [29,199,216,238,244,252,261,324,361,384,395,443,451,495,533,683,705,712,713,756,798,806];

const voteSuccess = new Counter("vote_success");
const voteFail = new Counter("vote_fail");
const voteDuration = new Trend("vote_duration", true);

export const options = {
  scenarios: {
    vote_iter: {
      executor: "shared-iterations",
      iterations: TOTAL,
      vus: VUS,
      maxDuration: "30m",
    },
  },
};

export default function () {
  // VU별 고유 userId: VU 1→1~500, VU 2→501~1000, ...
  const userId = (__VU - 1) * PER_VU + __ITER + 1;
  if (userId > TOTAL) return;

  const playerId = PLAYER_IDS[(__VU + __ITER) % PLAYER_IDS.length];

  const url = `${BASE_URL}/api/vote/${GAME_ID}/${playerId}`;
  const payload = JSON.stringify({ userId });
  const params = {
    headers: { "Content-Type": "application/json" },
    tags: { name: "POST_vote" },
  };

  const res = http.post(url, payload, params);
  voteDuration.add(res.timings.duration);

  if (check(res, { "status 201": (r) => r.status === 201 })) {
    voteSuccess.add(1);
  } else {
    voteFail.add(1);
  }
}