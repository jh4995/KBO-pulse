const express = require("express");
const router = express.Router();

// B 담당: MVP 투표 / 랭킹 API
// Redis 패턴: INCR, Sorted Set, SET NX EX (분산 락)

// TODO: POST /api/vote/:gameId/:playerId  — 투표하기
// TODO: GET  /api/vote/:gameId/ranking    — 실시간 투표 랭킹

module.exports = router;
