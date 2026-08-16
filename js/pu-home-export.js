/* 푸른통합시스템 — 홈페이지에 붙여넣을 글자 만들기
   이 파일은 글자만 만든다. 홈페이지에 보내지 않는다. 보내는 경로 자체가 없다. */
(function (global) {
  'use strict';

  const ORIGIN = 'https://xn--o80bs5mdnbm0bf80anms.kr';

  /* 진짜 HTML 태그만 걷어낸다. 태그 이름은 영문자로 시작해야 한다.
     '<노무담당>'처럼 한글로 시작하거나 '< 나'처럼 이름이 없는 것은
     사람이 쓴 글자이므로 건드리지 않는다. */
  function clean(line) {
    return String(line || '').replace(/<\/?[A-Za-z][^<>]*>/g, '').replace(/\s+/g, ' ').trim();
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

  /* 다듬은 뒤에도 <, > 가 남은 줄. 홈페이지가 태그로 오인해 안 보일 수 있으니
     자동으로 고치지 않고 사람이 판단하도록 그대로 돌려준다. */
  function riskyLines(careers) {
    return toLines(careers).map(clean).filter(Boolean).filter(function (l) {
      return /[<>]/.test(l);
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
