/* 푸른통합시스템 — 홈페이지에 붙여넣을 글자 만들기
   이 파일은 글자만 만든다. 홈페이지에 보내지 않는다. 보내는 경로 자체가 없다. */
(function (global) {
  'use strict';

  const ORIGIN = 'https://xn--o80bs5mdnbm0bf80anms.kr';

  function clean(line) {
    return String(line || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  /* format: 'plain' 은 줄바꿈만(기본), 'div' 는 줄마다 감싸기 */
  function careersText(careers, format) {
    const lines = (careers || []).map(clean).filter(Boolean);
    if (format === 'div') {
      return lines.map(function (l) { return '<div>' + l + '</div>'; }).join('\n');
    }
    return lines.join('\n');
  }

  function editUrl(kind, key) {
    if (kind === 'member') {
      return ORIGIN + '/index.php?mid=people_board&act=dispBoardWrite&document_srl=' + encodeURIComponent(key);
    }
    // 쪽은 글 번호가 아니라 관리자 화면에서 찾아 들어간다.
    return ORIGIN + '/admin';
  }

  global.PuHomeExport = { ORIGIN: ORIGIN, careersText: careersText, editUrl: editUrl };
})(typeof window !== 'undefined' ? window : globalThis);
