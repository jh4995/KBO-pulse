const express = require("express");
const router = express.Router();

// A 담당: 선수 스탯 조회 API
// Redis 패턴: Look-Aside 캐싱 (String/Hash)

// TODO: GET /api/stats/players         — 선수 목록 조회
// TODO: GET /api/stats/players/:id     — 선수 상세 스탯
// TODO: GET /api/stats/ranking         — 부문별 랭킹

module.exports = router;
