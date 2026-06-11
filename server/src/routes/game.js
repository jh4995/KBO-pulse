const express = require("express");
const router = express.Router();
const gameService = require("../services/gameService");
const gameController = require("../controllers/gameController");
const { success } = require("../utils/response");

// ──────────────────────────────────────────────
// C 담당: 실시간 경기 현황 및 시뮬레이션 API
// 이제 모든 로직은 DB의 game_id(숫자)를 기반으로 작동합니다.
// ──────────────────────────────────────────────

/**
 * 1. GET /api/game/live
 * 현재 시뮬레이션이 진행 중인(status='live') 경기 목록을 가져옵니다.
 */
router.get("/live", async (req, res) => {
  const result = await gameService.getLiveGames();
  res.json(success(result));
});

/**
 * 2. GET /api/game/:gameId/status
 * 특정 경기의 실시간 점수와 이닝 상세 정보를 가져옵니다. (HTTP 폴링용)
 */
router.get("/:gameId/status", gameController.getGameStatus);

/**
 * 3. POST /api/game/:gameId/simulate
 * DB의 game_innings 테이블 데이터를 기반으로 시뮬레이션을 시작합니다.
 */
router.post("/:gameId/simulate", gameController.startSimulation);

module.exports = router;