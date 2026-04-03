/**
 * 통일 응답 포맷
 * - k6 부하테스트에서 success 필드로 성공/실패 판정 가능
 *
 * 성공: { success: true, data: { ... } }
 * 실패: { success: false, error: { code: "...", message: "..." } }
 */

function success(data) {
  return { success: true, data };
}

function fail(code, message) {
  return { success: false, error: { code, message } };
}

module.exports = { success, fail };
