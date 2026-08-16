/* 푸른통합시스템 — 홈페이지에 붙여넣을 글자 만들기
   이 파일은 글자만 만든다. 홈페이지에 보내지 않는다. 보내는 경로 자체가 없다. */
(function (global) {
  'use strict';

  const ORIGIN = 'https://xn--o80bs5mdnbm0bf80anms.kr';

  /* "태그 이름이 영문자로 시작하면 진짜 태그"라는 판별은 틀렸다. 노무·인사
     경력 표기에는 <PM>, <HR>, <A등급> 처럼 영문 약어를 꺾쇠로 감싸는 표기가
     흔해서, 그 규칙으로는 사람이 쓴 글자가 통째로 사라진다.
     그래서 실제로 걷어낼 필요가 있는 진짜 HTML 태그 이름만 미리 목록으로
     정해 두고, 이름이 정확히 이 목록의 것과 같을 때만 태그로 본다.
     목록에 없는 이름(PM, HR, A등급, Team Leader, 노무담당 등)은 그대로 둔다. */
  var KNOWN_TAGS = [
    'div', 'span', 'p', 'br', 'a', 'b', 'strong', 'i', 'em', 'u', 's', 'font',
    'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'center', 'small', 'sub', 'sup'
  ];

  /* <\/?(태그이름)(?=[\s/>]) 로 이름 뒤에 공백·슬래시·> 가 와야만 태그로 본다
     (그래야 '<A등급>'의 'a'가 태그 이름 'a'와 헷갈리지 않는다).
     따옴표로 감싼 속성값 안의 >는 태그 끝으로 보지 않도록, 속성 부분은
     따옴표 문자열 전체이거나 따옴표 밖의 >가 아닌 글자만 반복해서 삼킨 뒤
     마지막에 오는 진짜 >에서 태그를 닫는다. */
  var TAG_RE = new RegExp(
    '<\\/?(?:' + KNOWN_TAGS.join('|') + ')(?=[\\s/>])(?:[^>"\']|"[^"]*"|\'[^\']*\')*>',
    'gi'
  );

  function clean(line) {
    return String(line || '').replace(TAG_RE, '').replace(/\s+/g, ' ').trim();
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
