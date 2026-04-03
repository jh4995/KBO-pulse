const express = require("express");
const router = express.Router();
const voteService = require("../services/voteService");
const { success, fail } = require("../utils/response");

// ──────────────────────────────────────────────
// B 담당: MVP 투표 / 랭킹 API
// route는 HTTP 요청/응답만 처리, 로직은 service에 위임
// Redis 패턴: INCR, Sorted Set, SET NX EX (분산 락)
// ──────────────────────────────────────────────

// POST /api/vote/:gameId/:playerId — 투표하기
router.post("/:gameId/:playerId", async (req, res) => {
  const { gameId, playerId } = req.params;
  const result = await voteService.castVote(gameId, playerId);
  res.status(201).json(success(result));
});
 
// GET /api/vote/:gameId/ranking — 실시간 투표 랭킹 조회
router.get("/:gameId/ranking", async (req, res) => {
  const { gameId } = req.params;
  const limit = parseInt(req.query.limit) || 10;
  const result = await voteService.getRanking(gameId, limit);
  res.json(success(result));
});
 
module.exports = router;
