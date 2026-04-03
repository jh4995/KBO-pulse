/**
 * 글로벌 에러 핸들러
 * - express-async-errors가 async 라우트의 에러를 자동으로 여기로 전달
 * - A/B/C 전원이 동일한 에러 응답 포맷을 사용 → k6에서 에러 판정이 일관됨
 */
module.exports = function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const code = err.code || "INTERNAL_ERROR";
  const message = err.message || "서버 내부 오류가 발생했습니다";

  // 개발 환경에서만 스택 트레이스 로깅
  if (process.env.NODE_ENV === "development") {
    console.error(`[ERROR] ${req.method} ${req.url}`, err);
  }

  res.status(status).json({
    success: false,
    error: { code, message },
  });
};
