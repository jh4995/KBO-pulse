import http from "k6/http";
import { check } from "k6";
import { Counter, Trend } from "k6/metrics";

const BASE_URL = "http://localhost";
const GAME_ID = 1561;
const MAX_USERS = 200000;
const PLAYER_IDS = [29,199,216,238,244,252,261,324,361,384,395,443,451,495,533,683,705,712,713,756,798,806];

const voteSuccess = new Counter("vote_success");
const voteFail = new Counter("vote_fail");
const voteDuration = new Trend("vote_duration", true);

export const options = {
  scenarios: {
    vote_time: {
      executor: "constant-vus",
      vus: 400,
      duration: "2m",  // 파일럿 테스트 후 조정
    },
  },
};

export default function () {
  const userId = ((__VU - 1) * 500 + __ITER) % MAX_USERS + 1;
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