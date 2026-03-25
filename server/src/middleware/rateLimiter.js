// B 담당: API Rate Limiting 미들웨어
// Redis 패턴: Sliding Window Counter + Lua Script

// TODO: 구현 전 — 모든 요청 통과
module.exports = function rateLimiter(options) {
  return (req, res, next) => {
    next();
  };
};
