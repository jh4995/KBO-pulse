const express = require("express");
const router = express.Router();

// C 담당: 실시간 경기 현황 API
// Redis 패턴: Hash (경기 상태 캐싱), HTTP 폴링

// TODO: GET /api/game/live            — 진행 중 경기 목록
// TODO: GET /api/game/:gameId/status  — 특정 경기 현재 상태

module.exports = router;
