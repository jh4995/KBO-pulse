const express = require("express");
const router = express.Router();
const gameService = require("../services/gameService");
const { success, fail } = require("../utils/response");

// ──────────────────────────────────────────────
// C 담당: 실시간 경기 현황 API
// route는 HTTP 요청/응답만 처리, 로직은 service에 위임
// Redis 패턴: Hash (경기 상태 캐싱), HTTP 폴링
// ──────────────────────────────────────────────

// GET /api/game/live — 진행 중인 경기 목록
router.get("/live", async (req, res) => {
  const result = await gameService.getLiveGames();
  res.json(success(result));
});
 
// GET /api/game/:gameId/status — 특정 경기 현재 상태 (HTTP 폴링)
router.get("/:gameId/status", async (req, res) => {
  const result = await gameService.getGameStatus(req.params.gameId);
  if (!result) {
    return res.status(404).json(fail("NOT_FOUND", "경기를 찾을 수 없습니다"));
  }
  res.json(success(result));
});
 
module.exports = router;
