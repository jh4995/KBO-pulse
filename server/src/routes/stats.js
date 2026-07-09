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

// GET /api/stats/players/name/:name — 선수 이름으로 스탯 조회
router.get("/players/name/:name", async (req, res) => {
  const result = await statsService.getPlayerByName(req.params.name);
  
  if (!result || result.length === 0) {
    return res.status(404).json({ message: "선수를 찾을 수 없습니다" });
  }
  
  res.json({ success: true, data: result });
});
 
// GET /api/stats/ranking — 부문별 랭킹
router.get("/ranking", async (req, res) => {
  const { category, season, limit } = req.query;
  const result = await statsService.getRanking({ category, season, limit: parseInt(limit) || 10 });
  res.json(success(result));
});

// PUT 요청을 처리하는 로직(이벤트 기반 캐시 무효화를 호출하는 핵심)
router.put("/players/name/:name", async (req, res) => {
  const { name } = req.params;
  const stats = req.body; // 여기서 { "home_runs": 10, "rbi": 50 } 을 받게 됨

  // 1. 이름으로 선수 찾기 (ID를 얻기 위함)
  const playerList = await statsService.getPlayerByName(name);
  if (!playerList || playerList.length === 0) {
    return res.status(404).json({ success: false, message: "선수를 찾을 수 없습니다" });
  }

  // 2. 첫 번째 검색 결과에서 player_id 추출
  const playerId = playerList[0].player_id;

  // 3. 서비스 계층의 업데이트 함수 호출 (여기서 DB 업데이트 + 캐시 삭제 수행)
  const result = await statsService.updatePlayer(playerId, name, stats);
  
  res.json({ success: true, message: "데이터 수정 및 캐시 삭제 완료", data: result });
});
 
module.exports = router;
