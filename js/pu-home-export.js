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

  /* 「감싸기」로 내보낼 때, 줄에 이미 <div> 가 들어 있으면 짝이 안 맞는 HTML 이 되어
     그 뒤 화면 구조가 통째로 깨진다. 그냥 꺾쇠가 든 것보다 훨씬 나쁘다.
     ★ 이 판단은 원래 화면(pu-home.html) 안에 있었다. 화면에 두니 검사가 화면 안
       helper 이름(divInLine)을 못 박았고, 파일만 옮겨도 검사가 깨져 모든 앱 배포를
       막게 된다. 판단은 부품에 두고 검사는 «돌려서» 확인한다. */
  function divInLine(line) {
    return /<\s*\/?\s*div[\s>]/i.test(String(line || '') + ' ');
  }

  /* 경고를 두 세기로 가른다.
       soft   — 꺾쇠가 들어 홈페이지에서 «안 보일 수» 있는 줄 (알리기만)
       broken — 줄 모양이 '감싸기'인데 그 줄에 이미 <div> 가 있어 «화면 구조를 깨뜨릴» 줄
     format 이 'div' 가 아니면 감싸기를 안 하므로 broken 은 없다. */
  function riskReport(careers, format) {
    const risky = riskyLines(careers);
    const broken = (format === 'div') ? risky.filter(divInLine) : [];
    const soft = risky.filter(function (l) { return broken.indexOf(l) < 0; });
    return { risky: risky, broken: broken, soft: soft };
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

  global.PuHomeExport = {
    ORIGIN: ORIGIN, careersText: careersText, riskyLines: riskyLines, editUrl: editUrl,
    divInLine: divInLine, riskReport: riskReport
  };
})(typeof window !== 'undefined' ? window : globalThis);
