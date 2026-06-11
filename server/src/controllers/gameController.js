const gameService = require("../services/gameService");

/**
 * 시뮬레이션 시작 컨트롤러
 */
exports.startSimulation = async (req, res) => {
  try {
    const { gameId } = req.params; 

    // 입력값 검증: gameId를 숫자로 변환 (DB의 SERIAL/Integer 타입 대응)
    const numericGameId = parseInt(gameId);
    if (isNaN(numericGameId)) {
      return res.status(400).json({ success: false, message: "유효한 gameId(숫자)가 필요합니다." });
    }

    // 서비스 호출
    const result = await gameService.startSimulation(numericGameId);

    res.status(200).json({
      success: true,
      message: "시뮬레이션이 성공적으로 시작되었습니다.",
      data: result
    });
  } catch (error) {
    console.error("Simulation Controller Error:", error);
    res.status(500).json({
      success: false,
      message: "시뮬레이션 시작 실패",
      error: error.message
    });
  }
};

/**
 * 경기 상태 조회 컨트롤러
 */
exports.getGameStatus = async (req, res) => {
  try {
    const { gameId } = req.params;
    const status = await gameService.getGameStatus(gameId);

    if (!status) {
      return res.status(404).json({ success: false, message: "경기를 찾을 수 없습니다." });
    }

    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};