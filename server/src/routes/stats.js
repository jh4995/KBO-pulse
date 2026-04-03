const express = require("express");
const router = express.Router();
const statsService = require("../services/statsService");
const { success, fail } = require("../utils/response");

// ──────────────────────────────────────────────
// A 담당: 선수 스탯 조회 API
// route는 HTTP 요청/응답만 처리, 로직은 service에 위임
// Redis 패턴: Look-Aside 캐싱 (String/Hash)
// ──────────────────────────────────────────────

// GET /api/stats/players — 선수 목록 조회 (팀별/포지션별 필터)
router.get("/players", async (req, res) => {
  const { team, position, season } = req.query;
  const result = await statsService.getPlayers({ team, position, season });
  res.json(success(result));
});
 
// GET /api/stats/players/:id — 선수 상세 스탯 조회
router.get("/players/:id", async (req, res) => {
  const result = await statsService.getPlayerStats(req.params.id);
  if (!result) {
    return res.status(404).json(fail("NOT_FOUND", "선수를 찾을 수 없습니다"));
  }
  res.json(success(result));
});
 
// GET /api/stats/ranking — 부문별 랭킹
router.get("/ranking", async (req, res) => {
  const { category, season, limit } = req.query;
  const result = await statsService.getRanking({ category, season, limit: parseInt(limit) || 10 });
  res.json(success(result));
});
 
module.exports = router;
