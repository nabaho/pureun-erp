/* 푸른통합시스템 — 홈페이지에 붙여넣을 글자 만들기
   이 파일은 글자만 만든다. 홈페이지에 보내지 않는다. 보내는 경로 자체가 없다. */
(function (global) {
  'use strict';

  const ORIGIN = 'https://xn--o80bs5mdnbm0bf80anms.kr';

  /* 들어온 글자를 지우지 않는다. 공백만 정리한다.
     ★ 태그처럼 생긴 것을 지우는 규칙을 세 번 만들었고 세 번 다 사람이 쓴 표기를
     말없이 삭제했다(<S> 등급, <PM>, <Team Leader>, <노무담당>).
     찌꺼기와 사람 글자를 기계가 가릴 방법이 없다. 지우지 말고 riskyLines 로 알린다.
     "간단히 정규식으로 지우자"로 되돌리지 말 것. */
  function clean(line) {
    return String(line || '').replace(/\s+/g, ' ').trim();
  }

  /* 배열이 아니라 글자 하나가 와도 한 줄짜리로 받아준다 */
  function toLines(careers) {
    if (Array.isArray(careers)) return careers;
    if (typeof careers === 'string') return [careers];
    return careers ? [careers] : [];
  }

  /* format: 'plain' 은 줄바꿈만(기본), 'div' 는 줄마다 감싸기 */
  function careersText(careers, format) {
    const lines = toLines(careers).map(clean).filter(Boolean);
    if (format === 'div') {
      return lines.map(function (l) { return '<div>' + l + '</div>'; }).join('\n');
    }
    return lines.join('\n');
  }

  /* 홈페이지 편집 칸은 HTML 을 받는다. 꺾쇠가 든 줄은 브라우저가 모르는 태그로 여겨
     화면에서 안 보일 수 있다. 지우지 않고 사람에게 알린다. */
  function riskyLines(careers) {
    return toLines(careers).map(clean).filter(function (l) {
      return l && /[<>]/.test(l);
    });
  }

  function editUrl(kind, key) {
    if (kind !== 'member' && kind !== 'page') return null;
    if (kind === 'member') {
      if (key === null || key === undefined || key === '') return null;
      return ORIGIN + '/index.php?mid=people_board&act=dispBoardWrite&document_srl=' + encodeURIComponent(key);
    }
    // 쪽은 글 번호가 아니라 관리자 화면에서 찾아 들어간다.
    return ORIGIN + '/admin';
  }

  global.PuHomeExport = { ORIGIN: ORIGIN, careersText: careersText, riskyLines: riskyLines, editUrl: editUrl };
})(typeof window !== 'undefined' ? window : globalThis);
