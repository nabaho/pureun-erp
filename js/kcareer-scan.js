'use strict';
// 푸른노무법인 경력관리 — 서류 폴더 스캔·판정 모듈
// (브라우저 window.KcareerScan / Node module.exports 겸용, DOM·브라우저 API 미사용)
// 설계서: docs/superpowers/specs/2026-07-31-kcareer-일괄등록-design.md
(function (root) {

  /* ===== 읽지 않는 파일 ===== */
  var IGNORE_PREFIX = /^(\.~lock\.|~\$)/;   // 엑셀·한글 임시·잠금 파일
  var IGNORE_EXACT = ['4NZFL.DOCX'];        // OneDrive 부산물(0바이트, 모든 폴더에 존재)
  var IGNORE_EXT = ['md'];                  // 작업 문서는 서류가 아니다

  function extOf(name) {
    var s = String(name == null ? '' : name);
    var dot = s.lastIndexOf('.');
    if (dot <= 0) return '';
    return s.slice(dot + 1).toLowerCase();
  }

  function isIgnoredFile(name) {
    var s = String(name == null ? '' : name);
    if (!s) return true;
    if (IGNORE_PREFIX.test(s)) return true;
    if (IGNORE_EXACT.indexOf(s) >= 0) return true;
    var ext = extOf(s);
    if (!ext) return true;                       // 확장자 없는 부산물(test_write 등)
    if (IGNORE_EXT.indexOf(ext) >= 0) return true;
    return false;
  }

  /* ===== 이름 정리 =====
     발급일 괄호와 사본 연번을 떼어, 뒤에서 '이름 끝 단어'를 정확히 볼 수 있게 만든다. */
  function cleanCore(name) {
    return String(name == null ? '' : name)
      .replace(/\.[^.]+$/, '')                                        // 확장자
      .replace(/\(\s*20\d{2}[.\-]\d{1,2}[.\-]\d{1,2}\s*\)/g, '')      // (2015.05.07)
      .replace(/\s*\(\d+\)\s*$/, '')                                  // (1) (2) 사본 연번
      .replace(/[\s_\-]+$/, '')
      .trim();
  }

  var api = {
    extOf: extOf,
    isIgnoredFile: isIgnoredFile,
    cleanCore: cleanCore
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KcareerScan = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
