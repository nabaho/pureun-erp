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

  /* ===== 3단계 판정 =====
     핵심 규칙: "이름 끝이 결과물 단어인가". 중간에 있으면 결과물이 아니다.
     예) '…위촉장' = 위촉장 / '위촉장 목록' = 목록표 / '위촉식 시나리오' = 행사 진행표 */
  var ORIG_EXT = /\.(pdf|jpg|jpeg|png|hwp|hwpx)$/i;
  var RESULT_END = /(위촉장|위촉계약서|재위촉|위촉서|표창장|표창|포상|상장|자격증|수료증|이수증|협약서|경력증명서|실적증명서|참여확인서|수행확인서)$/;
  var RESULT_ANY = /위촉장|위촉계약|재위촉|표창|포상|상장|자격증|수료증|이수증|협약서|경력증명|실적증명|참여확인|수행확인/;
  // ⚠ 부정어에 '회의'를 넣지 말 것 — '상공회의소 위촉장'이 오탐된다(설계서 7.3).
  var NEGATIVE = /동의서|신청서|제출|공고|양식|서식|명단|시나리오|좌석|추천\s*계획|모집|목록|초안|회의록|회의자료|교재|자료집|매뉴얼/;

  // 이름 끝 단어 → 어느 목록으로 갈지
  var KIND_MAP = [
    { re: /(위촉장|위촉계약서|재위촉|위촉서)$/,                  store: 'wiccok',  type: '위촉장', titleHint: '' },
    { re: /협약서$/,                                          store: 'wiccok',  type: '협약서', titleHint: '' },
    { re: /(표창장|표창|포상|상장)$/,                           store: 'wiccok',  type: '표창',   titleHint: '' },
    { re: /자격증$/,                                          store: 'cert',    type: '',       titleHint: '자격' },
    { re: /(수료증|이수증)$/,                                  store: 'cert',    type: '',       titleHint: '수료' },
    { re: /(경력증명서|실적증명서|참여확인서|수행확인서)$/,         store: 'certdoc', type: '',       titleHint: '' }
  ];

  function mapKind(core) {
    for (var i = 0; i < KIND_MAP.length; i++) {
      if (KIND_MAP[i].re.test(core)) return KIND_MAP[i];
    }
    return null;
  }

  function classify(name) {
    if (isIgnoredFile(name)) return { level: 'ignore' };
    var core = cleanCore(name);
    var neg = NEGATIVE.test(core);
    if (ORIG_EXT.test(String(name)) && RESULT_END.test(core) && !neg) {
      var k = mapKind(core);
      if (k) return { level: 'sure', store: k.store, type: k.type, titleHint: k.titleHint };
    }
    if (RESULT_ANY.test(core) && !neg) return { level: 'maybe' };
    return { level: 'submission' };
  }

  var api = {
    extOf: extOf,
    isIgnoredFile: isIgnoredFile,
    cleanCore: cleanCore,
    classify: classify
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KcareerScan = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
