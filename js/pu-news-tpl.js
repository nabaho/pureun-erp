/* 뉴스레터 — 편지를 «짓는» 층
   ═══════════════════════════════════════════════════════════════════════════
   받으신 「푸른노무법인 2026년 08월 5주차 주간뉴스레터」의 뼈대를 그대로 옮긴다 —
   머리(로고) · 배너(WEEKLY NEWS LETTER + 회차) · 꼭지 차림표 넷 ·
   Best 딱지 + 꼭지 제목 · 기사 목록 · 꼬리.
   목업: docs/mockups/newsletter-letter.html

   ★ 메일은 «표(table)»로 짠다. div 로 자리를 잡으면 아웃룩·다음메일에서 무너진다.
     2026년에도 그렇다 — 메일 프로그램의 서식 읽기는 브라우저보다 20년 뒤에 있다.

   ★ 꾸밈은 «태그 안에 직접»(inline style) 적는다. <style> 덩이는 메일에서 지워진다.
     실제로 우리 발송기(functions/mail-send.js)도 <style> 을 통째로 버린다.

   ★ 배너는 «사진이 아니라 색칠한 칸»이다.
     ① 원본 사진은 공인노무사회 것이라 우리에게 없다.
     ② 발송기가 바깥 그림을 막는다 — 받는 쪽이 열 때 남의 서버로
        「언제 읽었나」가 새 나가기 때문이다.
     우리 홈페이지에 올린 그림은 통과하므로, 설정에 주소를 넣으면 그때 사진이 된다.

   ★ 평문 몫도 «여기서» 만든다. 서식을 못 읽는 메일 프로그램이 아직 있고,
     서버가 알아서 뽑게 두면 표 뼈대가 글자로 쏟아진다. */

(function (global) {
  'use strict';

  var Core = (typeof require === 'function' && typeof module === 'object')
    ? require('./pu-news-core.js')
    : global.PuNewsCore;

  /* 빛깔 한 곳 — 목업(docs/mockups/newsletter-letter.html)과 «같은 값»이다.
     ⚠ 목업을 고치면 여기도 고친다. 두 곳이 달라지면 「보고 정한 것」과
       「나가는 것」이 달라진다. */
  var 색 = {
    갈: '#6f5a48', 짙은갈: '#241a13', 딱지: '#8a6f57',
    남색: '#1b3a6b', 글: '#33302c', 흐린글: '#9a938a',
    줄: '#e0dcd6', 가는줄: '#eceae6', 바탕: '#e9e7e3', 상자: '#f7f5f2',
    /* 자료 꼭지 바탕 — 원본의 「고용·노동정책」 칸이 옅은 살구빛이다 */
    살구: '#fbf4ea', 표지테: '#d9d2c8', 표지바탕: '#ffffff'
  };
  var 폰트 = "'Malgun Gothic',sans-serif";
  /* ⚠ 600 → 700 (2026-09-05). 자료 칸이 «두 줄 나란히»라 600 에서는
       표지 옆 글자가 152px 밖에 안 남아 제목이 예닐곱 줄로 쏟아졌다.
       받으신 원본도 600 보다 넓다. 700 은 메일 프로그램이 다 견디는 폭이다. */
  var 넓이 = 700;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  /* ══════ 열람·클릭 추적 ══════
     대표 지시 2026-09-03: 「열람 미열람을 정확하게 확인하고 …」
     ★ 편지짓기 가 세우고, 끝나면 지운다. 여기 두는 까닭은 href() 가 «모든 링크의
       목구멍»이라 한 곳만 고치면 전부 감싸지기 때문이다.
     ⚠ 링크는 «번호»로 감싼다. 목적지를 주소로 실으면 누구나 우리 도메인으로 남을
       속이는 링크를 만들 수 있다(열린 리다이렉트). functions/news-track.js 참고. */
  var _추적 = null;

  /* 그림 주소 — «감싸지 않는다». 배너·로고를 newsClick 로 감싸면 그림이 안 나온다.
     ⚠ href() 와 갈라 둔 까닭이 이것이다. 하나로 두면 그림이 조용히 깨진다. */
  function img주소(s) {
    var u = String(s == null ? '' : s).trim();
    return /^https?:\/\//i.test(u) ? esc(u) : '';
  }

  /* 누를 수 있는 주소만. 발송기도 같은 잣대로 한 번 더 씻는다(문이 둘이다). */
  function href(s) {
    var u = String(s == null ? '' : s).trim();
    if (!/^(https?:\/\/|mailto:)/i.test(u)) return '';
    /* mailto: 는 감싸지 않는다 — 메일 앱을 여는 것이라 우리 서버를 지날 수 없다. */
    if (_추적 && /^https?:\/\//i.test(u)) {
      var n = _추적.링크들.indexOf(u);
      if (n < 0) { _추적.링크들.push(u); n = _추적.링크들.length - 1; }
      return esc(_추적.밑주소 + '/newsClick?i=' + encodeURIComponent(_추적.회차)
        + '&e={추적열쇠}&n=' + n);
    }
    return esc(u);
  }
  function 날짜꼴(s) {
    var t = String(s == null ? '' : s).replace(/\D/g, '');
    return t.length === 8 ? t.slice(0, 4) + '-' + t.slice(4, 6) + '-' + t.slice(6) : String(s || '');
  }

  /* 한 칸짜리 표 — 메일에서 «여백 있는 상자»를 만드는 가장 안전한 길 */
  function 줄긋기(위여백) {
    return '<tr><td style="padding:' + (위여백 || 22) + 'px 28px 0 28px;">'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
      + '<tr><td style="border-top:1px solid ' + 색.가는줄 + ';font-size:1px;line-height:1px;">&nbsp;</td>'
      + '</tr></table></td></tr>';
  }

  /* ── 머리 — 로고 ─────────────────────────────────────────────────────
     설정에 로고 그림 주소가 있으면 그림을, 없으면 «방패 글자»를 그린다.
     ⚠ 그림이 안 뜨는 메일 프로그램이 많다 — 그래서 그림 옆에 이름 글자를 늘 둔다. */
  function 머리(설정) {
    var s = 설정 || {};
    var 표시 = img주소(s.로고그림)
      ? '<img src="' + img주소(s.로고그림) + '" width="34" height="34" alt="">'
      : '<div style="width:34px;height:34px;background-color:' + 색.남색 + ';border-radius:17px;'
        + 'color:#ffffff;font-size:17px;font-weight:bold;text-align:center;line-height:34px;'
        + 'font-family:' + 폰트 + ';">푸</div>';
    return '<tr><td style="padding:22px 28px 18px 28px;">'
      + '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
      + '<td style="padding-right:10px;">' + 표시 + '</td>'
      + '<td><div style="font-size:21px;font-weight:bold;color:' + 색.남색 + ';'
      + 'letter-spacing:-0.5px;font-family:' + 폰트 + ';">'
      + esc(s.회사이름 || '푸른노무법인') + '</div></td>'
      + '</tr></table></td></tr>';
  }

  /* ── 배너 — WEEKLY NEWS LETTER + 회차 ─────────────────────────────── */
  function 배너(회차한벌, 설정) {
    var s = 설정 || {};
    var 회 = 회차한벌 || {};
    var 속 =
      '<div style="font-size:27px;font-weight:bold;color:#ffffff;letter-spacing:3px;'
      + 'font-family:Georgia,\'Times New Roman\',serif;line-height:1.2;">'
      + esc(s.배너글 || 'WEEKLY NEWS LETTER') + '</div>'
      + '<div style="height:16px;line-height:16px;font-size:1px;">&nbsp;</div>'
      + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>'
      + '<td style="background-color:' + 색.짙은갈 + ';padding:9px 22px;">'
      + '<span style="font-size:15px;color:#ffffff;font-weight:bold;font-family:' + 폰트 + ';">'
      /* ⚠ 짧은이름(「8월 5주차」)이 아니라 이름을 쓴다 — 원본 띠가 「2026년 08월 5주차」로
           달을 «두 자리»로 적는다. 이것 하나로 나란히 놓으면 티가 난다. */
      + esc(회.이름 || '주간뉴스레터') + '</span>'
      + '</td></tr></table>';

    /* 사진을 넣으신 경우 — 글자를 사진 «위»에 얹지 않는다.
       메일에서 겹쳐 놓기(background-image·position)는 절반의 프로그램에서 깨진다.
       사진을 위에, 회차 띠를 아래에 «쌓는다» — 어디서든 같게 보인다. */
    var 사진 = img주소(s.배너그림)
      ? '<tr><td style="padding:0;font-size:0;line-height:0;">'
        + '<img src="' + img주소(s.배너그림) + '" width="' + (넓이 - 56) + '" alt=""'
        + ' style="display:block;width:100%;"></td></tr>'
      : '';

    return '<tr><td style="padding:0 28px;">'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
      + ' style="background-color:' + 색.갈 + ';">'
      + 사진
      + '<tr><td align="center" style="padding:' + (사진 ? '18px 20px 20px' : '34px 20px 30px') + ' 20px;">'
      + 속 + '</td></tr></table></td></tr>';
  }

  /* ── 꼭지 차림표 넷 ──────────────────────────────────────────────────
     ⚠ 링크로 만들지 않는다. 메일 프로그램은 같은 편지 안 자리이동(#앵커)을
       대개 무시한다 — 누르면 헛일이 되는 손잡이는 두지 않는다. */
  function 차림표() {
    var 칸 = Core.꼭지들.map(function (g) {
      return '<td align="center" width="25%" style="padding:14px 4px;font-size:14px;'
        + 'font-weight:bold;color:' + 색.글 + ';font-family:' + 폰트 + ';">'
        + esc(g.이름) + '</td>';
    }).join('');
    return '<tr><td style="padding:20px 28px 0 28px;">'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
      + ' style="border-top:1px solid ' + 색.줄 + ';border-bottom:1px solid ' + 색.줄 + ';">'
      + '<tr>' + 칸 + '</tr></table></td></tr>';
  }

  /* ── 꼭지 제목 (Best 딱지는 첫 꼭지에만) ────────────────────────────── */
  function 꼭지제목(g) {
    var 이름 = '<span style="font-size:19px;font-weight:bold;color:' + 색.짙은갈 + ';'
      + 'font-family:' + 폰트 + ';">' + esc(g.이름) + '</span>';
    if (!g.딱지) {
      return '<tr><td style="padding:22px 28px 0 28px;">' + 이름 + '</td></tr>';
    }
    return '<tr><td style="padding:26px 28px 0 28px;">'
      + '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
      + '<td style="background-color:' + 색.딱지 + ';padding:5px 13px;">'
      + '<span style="font-size:12px;font-weight:bold;color:#ffffff;font-family:' + 폰트 + ';">'
      + esc(g.딱지) + '</span>'
      + '</td><td style="padding-left:11px;">' + 이름 + '</td>'
      + '</tr></table></td></tr>';
  }

  /* ── 기사 — «우리가 쓴 글»을 싣는다 (대표 지시 2026-09-08) ─────────────
     「매일 노동뉴스를 그대로 나오게 하면 문제가 된다 … 정리 편집하고
      노동뉴스 참고했다고 정리할 수 있나?」

     ★ 예전에는 «제목을 그대로» 여덟 줄 나열했다. 유료 구독 매체의 제목을 매주
       그렇게 옮기면 「그대로 전달」에 가깝다 — 대표께서 그것을 짚으셨다.
     ★ 이제 대표께서 쓰신 «우리 말»이 본문이고, 원문은 「원문 ↗」 링크로만 간다.
       우리 말이 없는 줄은 여기까지 오지 않는다(Core.편지에실릴까가 걸러 낸다).
     ⚠ 그래도 제목을 «되살리지 말 것». 우리 말이 없으면 그 줄은 안 나가는 것이 규칙이다.
     ⚠ 출처는 꼭지 아래에 한 줄로 밝힌다 — 참고한 것을 안 밝히면 그것이 더 나쁘다. */
  function 기사줄(항목들, 그림) {
    var 것 = (항목들 || []);
    var 줄 = 것.map(function (x) {
      var u = href(x.링크);
      /* ⚠ «우리 말»이 본문이다. 지난 회차(그때는 이 칸이 없었다)에는 없으니
           그때는 제목으로 물러선다 — 이미 나간 편지를 다시 그리는 자리다. */
      var 내글 = String(x.우리말 || '').trim();
      var 몸 = 내글
        ? esc(내글).replace(/\r?\n/g, '<br>')
        : esc(x.제목 || '');
      var 링 = u
        ? ' <a href="' + u + '" style="color:' + 색.남색 + ';font-size:12px;'
          + 'text-decoration:none;font-weight:bold;">원문 ↗</a>'
        : '';
      /* 우리 글은 «단」이고, 옛 제목 줄은 «점 목록»이다 — 모양으로도 갈라 보인다 */
      return 내글
        ? '<div style="padding:3px 0 9px 11px;border-left:3px solid ' + 색.바탕 + ';'
          + 'margin-bottom:7px;">' + 몸 + 링 + '</div>'
        : '<div style="padding-bottom:2px;">·&nbsp;' + 몸
          + (x.언론사 ? ' <span style="color:' + 색.흐린글 + ';font-size:12px;">· '
              + esc(x.언론사) + '</span>' : '') + 링 + '</div>';
    }).join('');
    /* ── 출처 한 줄 — 「참고: 매일노동뉴스 · 위 정리는 우리가 썼습니다」 ──
       ⚠ 우리 말로 쓴 줄이 하나라도 있을 때만 붙인다. 옛 제목 줄에는 이미
         줄마다 언론사가 적혀 있어, 또 붙이면 같은 말이 두 번이다. */
    var 곳 = {};
    것.forEach(function (x) {
      if (String(x.우리말 || '').trim() && x.언론사) 곳[String(x.언론사)] = 1;
    });
    var 이름들 = Object.keys(곳);
    if (이름들.length) {
      줄 += '<div style="margin-top:11px;padding-top:9px;border-top:1px solid ' + 색.줄 + ';'
        + 'font-size:11.5px;color:' + 색.흐린글 + ';font-family:' + 폰트 + ';">'
        + '참고: <strong>' + esc(이름들.join(' · ')) + '</strong>'
        + ' · 위 정리는 푸른노무법인이 썼습니다</div>';
    }
    var 글칸 = 'font-size:14px;line-height:1.95;color:' + 색.글 + ';font-family:' + 폰트 + ';';

    /* 사진을 «옆»에 두는 꼴 — 원본의 「주간노동뉴스」가 그렇다(사진 왼쪽, 줄 오른쪽).
       ⚠ 설정에 그림 주소가 있을 때만이다. 없으면 예전처럼 줄만 그린다 —
         자리만 잡아 두고 빈 네모를 그리면 「그림이 깨졌나」로 보인다.
       ⚠ 우리 홈페이지에 올린 그림만 나간다(mail-send.js 의 IMG_HOST_OK). */
    var g = img주소(그림);
    if (!g) {
      return '<tr><td style="padding:16px 28px 0 28px;' + 글칸 + '">' + 줄 + '</td></tr>';
    }
    return '<tr><td style="padding:16px 28px 0 28px;">'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
      + '<td width="190" valign="top" style="width:190px;">'
      + '<img src="' + g + '" width="190" alt="" style="display:block;width:190px;"></td>'
      + '<td valign="top" style="padding-left:16px;' + 글칸 + '">' + 줄 + '</td>'
      + '</tr></table></td></tr>';
  }

  /* ── 법령 — 공포일·시행일·부처까지 싣는다(저작권 대상이 아니다) ─────── */
  function 법령줄(항목들) {
    var 줄 = (항목들 || []).map(function (x) {
      if (x.갈래 !== '법령') return null;
      var u = href(x.링크);
      return '<div style="padding-bottom:10px;">'
        + '<b style="color:' + 색.짙은갈 + ';">' + esc(x.제목 || '') + '</b>'
        + (x.구분 || x.고친결
            ? ' <span style="color:' + 색.갈 + ';">(' + esc([x.구분, x.고친결].filter(Boolean).join(' · ')) + ')</span>'
            : '')
        + '<br><span style="font-size:12px;color:' + 색.흐린글 + ';">'
        + (x.공포일 ? '공포 ' + esc(날짜꼴(x.공포일)) : '')
        + (x.시행일 ? ' · 시행 ' + esc(날짜꼴(x.시행일)) : '')
        + (x.부처 ? ' · ' + esc(x.부처) : '')
        + '</span>'
        + (u ? '&nbsp;<a href="' + u + '" style="color:' + 색.남색 + ';font-size:12px;">법제처에서 보기</a>' : '')
        + '</div>';
    }).filter(Boolean).join('');
    return 줄;
  }


  /* ══════════════════════════════════════════════════════════════════════
     자료 칸 — 「법제처에서 보기」가 아니라 «자료 그 자체»
     ══════════════════════════════════════════════════════════════════════
     대표 지시 2026-09-05: 「자료가 법제처에서 나오면 안된다. 정리해서 첨부자료에
     있어야된다.」

     받으신 원본의 「고용·노동정책」 칸 생김새를 그대로 옮긴다 —
       옅은 살구빛 바탕 · 두 칸 나란히 · 왼쪽에 표지 · 오른쪽에 제목과 목차.
     거기에 우리 것 하나를 더 붙인다: «내려받기»(파일 종류와 크기까지).
     거리는 functions/news-docs.js 가 고용노동부 정책자료실에서 가져온다. */

  /* 표지 — 그림이 있으면 그림, 없으면 «글자 표지».
     ⚠ 그림에 기대면 안 된다. 아웃룩·회사 메일은 바깥 그림을 기본으로 막고,
       우리 발송기도 허락한 곳 밖의 그림은 지운다(mail-send.js 의 IMG_HOST_OK).
       그래서 그림이 없어도 «책 표지처럼 보이는 칸»이 늘 그려지게 둔다. */
  function 표지칸(x, 너비) {
    var w = Number(너비) || 96;
    var 그림 = img주소(x && x.표지);
    if (그림) {
      return '<img src="' + 그림 + '" width="' + w + '" alt=""'
        + ' style="display:block;width:' + w + 'px;border:1px solid ' + 색.표지테 + ';">';
    }
    var 제 = String((x && x.제목) || '').replace(/\s+/g, ' ').trim();
    /* ⚠ 28자에서 자른다. 안 자르면 표지가 글자 수만큼 «길어져» 두 칸 높이가 어긋난다
         (미리보기에서 왼쪽 표지만 20px 더 길었다). 표지는 책등이지 본문이 아니다. */
    var 짧 = 제.length > 28 ? 제.slice(0, 28) + '…' : 제;
    return '<table role="presentation" width="' + w + '" cellpadding="0" cellspacing="0" border="0"'
      + ' style="width:' + w + 'px;background-color:' + 색.표지바탕 + ';border:1px solid ' + 색.표지테 + ';">'
      + '<tr><td height="132" align="center" valign="middle"'
      + ' style="height:132px;padding:10px 9px;">'
      + '<div style="font-size:11px;line-height:1.5;font-weight:bold;color:' + 색.갈 + ';'
      + 'font-family:' + 폰트 + ';word-break:keep-all;">' + esc(짧) + '</div>'
      + '<div style="height:9px;line-height:9px;font-size:1px;">&nbsp;</div>'
      + '<div style="font-size:9.5px;color:' + 색.흐린글 + ';font-family:' + 폰트 + ';">'
      + esc((x && x.발행처) || '') + '</div>'
      + '</td></tr></table>';
  }

  /* 「pdf · 756KB」 — 누르기 «전에» 무엇을 얼마나 받는지 알려 준다 */
  function 파일글(x) {
    var 것 = [];
    if (x && x.확장자) 것.push(String(x.확장자).toUpperCase());
    /* ⚠ 크기 셈은 Core 것을 쓴다 — 화면과 편지가 «같은 자»를 써야 한다.
         두 벌로 두면 화면은 756KB, 편지는 0.7MB 라고 적는 날이 온다. */
    var 크 = Core.크기글(x && x.파일크기);
    if (크) 것.push(크);
    return 것.join(' · ');
  }

  function 자료카드(x) {
    var 제 = esc(String((x && x.제목) || '').replace(/\s+/g, ' ').trim());
    var 상세 = href(x && x.링크);
    var 제목칸 = 상세
      ? '<a href="' + 상세 + '" style="color:' + 색.짙은갈 + ';text-decoration:none;">' + 제 + '</a>'
      : 제;

    /* 목차 — 있으면 번호를 매겨 두세 줄. 없으면 «지어내지 않는다».
       ⚠ 자료 목차를 기계가 지어내면 «책에 없는 차례»가 법인 이름으로 나간다. */
    var 목 = (x && x.목차 || []).filter(Boolean).slice(0, 4);
    var 목차칸 = 목.length
      ? '<div style="padding-top:7px;font-size:12px;line-height:1.7;color:' + 색.갈 + ';'
        + 'font-family:' + 폰트 + ';">'
        + 목.map(function (t, i) { return (i + 1) + '. ' + esc(String(t).trim()); }).join('<br>')
        + '</div>'
      : '';

    var 밑줄 = [];
    if (x && x.발행처) 밑줄.push(esc(x.발행처));
    if (x && x.발행일) 밑줄.push(esc(날짜꼴(x.발행일)));
    var 밑칸 = 밑줄.length
      ? '<div style="padding-top:8px;font-size:11.5px;color:' + 색.흐린글 + ';'
        + 'font-family:' + 폰트 + ';">' + 밑줄.join(' · ') + '</div>'
      : '';

    var 파일 = href(x && x.파일);
    var 받기 = 파일
      ? '<div style="padding-top:9px;">'
        + '<a href="' + 파일 + '" style="display:inline-block;background-color:' + 색.갈 + ';'
        + 'color:#ffffff;font-size:11.5px;font-weight:bold;text-decoration:none;padding:6px 14px;'
        + 'font-family:' + 폰트 + ';">내려받기'
        + (파일글(x) ? ' <span style="font-weight:normal;">(' + esc(파일글(x)) + ')</span>' : '')
        + '</a></div>'
      : '';

    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
      + '<td width="96" valign="top" style="width:96px;">' + 표지칸(x, 96) + '</td>'
      + '<td valign="top" style="padding-left:13px;">'
      + '<div style="font-size:13.5px;font-weight:bold;line-height:1.5;color:' + 색.짙은갈 + ';'
      + 'font-family:' + 폰트 + ';word-break:keep-all;">' + 제목칸 + '</div>'
      + 목차칸 + 밑칸 + 받기
      + '</td></tr></table>';
  }

  /* 두 칸 나란히. 홀수면 마지막 오른쪽은 빈 칸으로 둔다 — 폭이 흔들리지 않게. */
  function 자료칸(항목들, 바탕) {
    var 것 = (항목들 || []).filter(function (x) { return x && x.갈래 === '자료'; });
    if (!것.length) return '';
    var 줄 = '';
    for (var i = 0; i < 것.length; i += 2) {
      var 첫줄 = i === 0;
      var 테 = 첫줄 ? '' : 'border-top:1px solid #efe7dc;';
      줄 += '<tr>'
        + '<td width="50%" valign="top" style="width:50%;padding:16px 15px;' + 테
        + 'border-right:1px solid #efe7dc;">' + 자료카드(것[i]) + '</td>'
        + '<td width="50%" valign="top" style="width:50%;padding:16px 15px;' + 테 + '">'
        + (것[i + 1] ? 자료카드(것[i + 1]) : '&nbsp;') + '</td>'
        + '</tr>';
    }
    return '<tr><td style="padding:15px 28px 0 28px;">'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
      + ' style="background-color:' + (바탕 || 색.살구) + ';">' + 줄 + '</table>'
      + '</td></tr>';
  }

  /* ══════════════════════════════════════════════════════════════════════
     판례 칸 — 갈색 상자 + 「* 사건 / * 법원 / * 선고」
     ══════════════════════════════════════════════════════════════════════
     ★ 판결문은 저작권 대상이 아니다(저작권법 제7조 제4호). 기사와 달리
       판시사항·판결요지를 «그대로» 실을 수 있다. 그래서 링크 한 줄이 아니라
       내용을 싣는다 — 받으신 원본이 그렇게 되어 있다.
     거리는 functions/news-prec.js 가 법제처 판례 API 에서 가져온다. */
  /* 판시사항 한도 — «두 줄»이 한도다 (2026-09-08 실측: 한 건이 179자, 다섯 줄이었다).
     ⚠ 값을 여기 한 곳에만 둔다. 여러 군데 흩어 두면 한쪽만 늘어난다. */
  var 판례제목한도 = 100;

  function 판례한칸(x) {
    var 온제목 = String(x.제목 || '').replace(/\s+/g, ' ').trim();
    /* ★ 대표께서 쓰신 «우리 말»이 있으면 그것이 제목이다 — 자른 글보다 낫다.
       ⚠ 없으면 자른다. 자를 때 「…」을 붙여 «잘렸다»는 것을 숨기지 않는다 —
         숨기면 문장이 이상하게 끝난 것으로 읽힌다. */
    var 내글 = String(x.우리말 || '').trim();
    var 쓸것 = 내글 || (온제목.length > 판례제목한도
      ? 온제목.slice(0, 판례제목한도).replace(/[\s·,]+$/, '') + '…'
      : 온제목);
    var 제 = esc(쓸것);
    var 인 = esc(String(x.인용 || '').trim());
    var u = href(x.링크);
    /* ⚠ 「전문 보기」라고 «적어» 준다. 인용만 밑줄 쳐 두면 그것이 누를 수 있는
         것인지, 무엇이 열리는지 알 수 없다 — 요지를 뺀 뒤로는 더 그렇다. */
    var 인용칸 = 인
      ? '<div style="height:12px;line-height:12px;font-size:1px;">&nbsp;</div>'
        + '<div align="right" style="text-align:right;">'
        + (u ? '<a href="' + u + '" style="color:#ffffff;text-decoration:underline;'
              + 'font-size:12.5px;font-weight:bold;font-family:' + 폰트 + ';">' + 인
              + ' · 전문 보기 ↗</a>'
            : '<span style="color:#ffffff;font-size:12.5px;font-weight:bold;'
              + 'font-family:' + 폰트 + ';">' + 인 + '</span>')
        + '</div>'
      : '';

    var 상자 = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
      + ' style="background-color:' + 색.갈 + ';"><tr><td style="padding:17px 19px;">'
      + '<div style="font-size:12.5px;font-weight:bold;color:#e8ddd2;font-family:' + 폰트 + ';">'
      + esc(x.딱지 || '[판례]') + '</div>'
      + '<div style="height:7px;line-height:7px;font-size:1px;">&nbsp;</div>'
      + '<div style="font-size:14.5px;font-weight:bold;line-height:1.65;color:#ffffff;'
      + 'font-family:' + 폰트 + ';word-break:keep-all;">' + 제 + '</div>'
      + 인용칸
      + '</td></tr></table>';

    /* ══════════════════════════════════════════════════════════════════════
       판례는 «결과만» 싣는다 (대표 지시 2026-09-08)
       ══════════════════════════════════════════════════════════════════════
       「뉴스레터 너무 많이 아래로 내려온다 — 간단하게 결과만 나오게」

       ★ 재 보니 판례가 편지 글자의 «83%» 를 먹고 있었다 (2026-09-08 실측, 석 장):
           요지 770자 · 판시사항 464자 · 참조조문 223자 · 그 밖 265자 = 1,959자
         남기는 것은 «판시사항 두 줄 + 인용 + 전문 보기» — 약 360자로 줄어든다.
       ⚠⚠ 판결문은 저작물이 «아니다»(저작권법 제7조 — 판결·결정·명령).
         그래서 실어도 되는데, «빼는 까닭은 오직 길이»다. 저작권 걱정으로 뺀 것이라
         잘못 적어 두면 다음 사람이 엉뚱한 데까지 지운다.
       ★ 전문은 「전문 보기」 링크로 간다 — 필요한 분은 한 번 눌러 다 보신다.
       ⚠ 요지·참조조문·사건종류를 «되살리지 말 것». 되살리면 편지가 다시 다섯 배가 된다. */
    return '<tr><td style="padding:16px 28px 0 28px;">' + 상자 + '</td></tr>';
  }

  function 판례칸(항목들) {
    return (항목들 || [])
      .filter(function (x) { return x && x.갈래 === '판례'; })
      .map(판례한칸).join('');
  }

  /* ── 한 꼭지 그리기 — 칸마다 «제 갈래»로 ───────────────────────────────
     ⚠ 꼭지가 아니라 «칸»의 갈래를 본다. 지난 회차에는 옛 갈래(법령·기사)로
       담긴 것이 남아 있고, 새 회차에는 자료·판례가 담긴다. 한 꼭지 안에
       둘이 섞여도 각자 제 모양으로 그려져야 «지난 회차 다시 보기»가 안 깨진다. */
  function 꼭지그리기(항목들, 꼭지, 설정) {
    var 것 = 항목들 || [];
    var g = 꼭지 || {};
    var s = 설정 || {};
    var out = '';
    out += 자료칸(것.filter(function (x) { return x && x.갈래 === '자료'; }));
    out += 판례칸(것.filter(function (x) { return x && x.갈래 === '판례'; }));
    var 법 = 법령줄(것);
    if (법) {
      out += '<tr><td style="padding:14px 28px 0 28px;font-size:14px;line-height:1.85;'
        + 'color:' + 색.글 + ';font-family:' + 폰트 + ';">' + 법 + '</td></tr>';
    }
    var 기사 = 것.filter(function (x) {
      return x && x.갈래 !== '자료' && x.갈래 !== '판례' && x.갈래 !== '법령';
    });
    if (기사.length) out += 기사줄(기사, g.키 === 'news' ? s.뉴스그림 : '');
    return out;
  }

  /* ── 우리 글 꼭지 — 이 칸만 우리가 쓴다 ───────────────────────────── */
  function 우리글칸(글) {
    var t = String(글 == null ? '' : 글).trim();
    if (!t) return '';
    /* 줄바꿈만 살린다. 사람이 적은 글이라 태그를 그대로 믿지 않는다. */
    var 몸 = esc(t).replace(/\r?\n/g, '<br>');
    return '<tr><td style="padding:14px 28px 0 28px;">'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
      + ' style="background-color:' + 색.상자 + ';">'
      + '<tr><td style="padding:16px 18px;font-size:14px;line-height:1.85;color:' + 색.글 + ';'
      + 'font-family:' + 폰트 + ';">' + 몸 + '</td></tr></table></td></tr>';
  }

  /* ── 꼬리 ────────────────────────────────────────────────────────────
     ⚠ (광고) 표기와 수신거부 안내는 «명단 범위»가 정한다 —
       사람이 잊어도 기계가 켠다(Core.광고표기필요한가). */
  function 꼬리(설정, 범위) {
    var s = 설정 || {};
    var 거부주소 = String(s.수신거부주소 || s.회신주소 || '').trim();
    var 거부 = 거부주소
      ? '받지 않으시려면 이 메일에 <a href="mailto:' + esc(거부주소)
        + '?subject=' + encodeURIComponent('뉴스레터 수신거부')
        + '" style="color:#8a837a;">회신</a>해 주십시오.'
      : '받지 않으시려면 이 메일에 회신해 주십시오.';

    var 머리말 = Core.광고표기필요한가(범위)
      ? '이 메일은 <b>광고성 정보</b>가 포함될 수 있습니다. 수신에 동의하신 분께 보내 드립니다.'
      : '이 메일은 푸른노무법인과 자문 관계에 있는 곳에 보내 드립니다.';

    return '<tr><td style="padding:30px 28px 0 28px;">'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
      + ' style="border-top:2px solid ' + 색.갈 + ';">'
      + '<tr><td style="padding:18px 0 0 0;font-size:12px;line-height:1.9;color:#8a837a;'
      + 'font-family:' + 폰트 + ';">'
      + '기사는 <b>제목과 원문 링크</b>만 싣습니다. 본문은 각 언론사 홈페이지에서 보실 수 있습니다.<br><br>'
      + '<span style="color:' + 색.글 + ';font-weight:bold;font-size:13px;">'
      + esc(s.회사이름 || '푸른노무법인') + '</span><br>'
      + esc(s.꼬리한줄 || '대표노무사 권형하') + (s.회신주소 ? ' &nbsp;·&nbsp; ' + esc(s.회신주소) : '')
      /* ⚠ 주소·전화는 원본(2026-08-05주차 받은 것)의 꼬리에 있던 것이다.
           받는 쪽이 어디로 연락할지 알 수 있어야 한다. 사무실이 옮기면 설정만 고친다. */
      + '<br>' + esc(s.주소 || '충남 천안시 서북구 원두정8길 6, 두정빌딩 3층')
      + ' &nbsp;·&nbsp; T.' + esc(s.전화 || '041-556-0035')
      + '<br><br><span style="color:#b3aca3;">' + 머리말 + ' ' + 거부 + '</span>'
      + '</td></tr></table></td></tr>'
      + '<tr><td style="height:34px;line-height:34px;font-size:1px;">&nbsp;</td></tr>';
  }

  /* ══════════════════════════════════════════════════════════════════════
     편지 한 통 — 서식 몫
     ══════════════════════════════════════════════════════════════════════ */
  function 편지짓기(회차자료, 설정, 옵션) {
    var d = 회차자료 || {};
    var 회 = d.회차 || (Core.회차(d.날짜 || new Date().toISOString().slice(0, 10)));
    /* ⚠ ㅁ 를 끈 줄은 여기서 «한 번» 걸러 낸다 (대표 지시 2026-09-08).
         부르는 쪽마다 거르게 두면 미리보기·시험·진짜 셋 가운데 하나가 빠진다 —
         그러면 화면에서 뺀 줄이 진짜 편지에만 실려 나간다. */
    /* ⚠ 이미 보낸 회차는 «그때 나간 그대로» — 잣대를 회차 상태에서 정한다 */
    var 안 = Core.실릴것만(d.안 || {}, { 보낸것: d.상태 === '발송' });
    var 설 = 설정 || {};
    var 범위 = d.범위 || 설.범위 || '자문중';

    /* ★ 추적을 «여기서» 세운다. 밑주소가 없으면 아무것도 안 넣는다 —
         예전처럼 나간다(설정에 밑주소를 넣기 전까지). */
    var 밑 = String(설.추적밑주소 == null ? '' : 설.추적밑주소).trim().replace(/\/+$/, '');
    var 회열 = String(회 && 회.열쇠 ? 회.열쇠 : '').replace(/[.#$/[\]]/g, '_');
    /* ★★ 미리보기에는 «추적을 걸지 않는다» (2026-09-05 대표 화면에서 드러났다)
       ═══════════════════════════════════════════════════════════════════════
       미리보기에서 기사 제목을 눌렀더니 빈 포털 창이 떴다. 추적 링크를 타고
       우리 서버로 갔는데, 그 번호가 아직 대장에 없어(안 보낸 회차라 당연하다)
       기본 주소로 튕긴 것이다.
       ⚠ 게다가 «대표님이 제 편지를 눌러 본 것»이 열람·클릭 수로 쌓인다 —
         그 숫자를 보고 명단을 자르게 되므로 조용히 틀린 것보다 나쁘다.
       → 미리보기에서는 «원문 링크 그대로». 누르면 진짜 기사로 간다. */
    var 미리 = !!(옵션 && 옵션.미리보기);
    _추적 = (밑 && 회열 && !미리) ? { 밑주소: 밑, 회차: 회열, 링크들: [] } : null;

    var 속 = '';
    var 그린것 = 0;
    Core.꼭지들.forEach(function (g) {
      if (g.갈래 === '우리글') {
        /* ★ 우리 글 «그리고» 연구기관 자료 (대표 결정 2026-09-06 「우리 글 + 연구자료」).
             받으신 원본은 이 자리(Trend)에 경총·BOK 같은 연구 보고서를 실었다.
             우리는 그 위에 «대표님 한마디»를 두고, 그 아래 자료 카드를 붙인다.
           ⚠ 둘 다 없으면 «아예 안 그린다» — 제목만 덩그러니 남으면 흉하다.
           ⚠ 쓰실 글이 없는 주에는 자료만 나간다. 빈 상자를 그리지 않는다. */
        var 칸 = 우리글칸(d.우리글);
        var 것들 = 안[g.키] || [];
        var 자료칸그린것 = 꼭지그리기(것들, g, 설);
        if (!칸 && !자료칸그린것) return;
        if (그린것) 속 += 줄긋기(22);
        속 += 꼭지제목(g) + 칸 + 자료칸그린것; 그린것++;
        return;
      }
      var 것 = 안[g.키] || [];
      if (!것.length) return;                    /* 빈 꼭지는 «아예 안 그린다» */
      if (그린것) 속 += 줄긋기(22);
      속 += 꼭지제목(g) + 꼭지그리기(것, g, 설);
      그린것++;
    });

    /* ★ 실을 것이 하나도 없으면 «만들지 않는다». 빈 뉴스레터를 보내면
       그 주 한 통이 통째로 빈 껍데기가 된다 — 안 보내느니만 못하다. */
    if (!그린것) return null;

    var html =
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"'
      + ' style="background-color:' + 색.바탕 + ';"><tr><td align="center" style="padding:0;">'
      + '<table role="presentation" width="' + 넓이 + '" cellpadding="0" cellspacing="0" border="0"'
      + ' style="width:' + 넓이 + 'px;background-color:#ffffff;">'
      + 머리(설) + 배너(회, 설) + 차림표() + 속 + 꼬리(설, 범위)
      + '</table></td></tr></table>';

    /* ★ 열람 그림 — 보이지 않는 1×1. 받는 쪽이 편지를 열면 우리 서버가 그것을 내주고
         그때 「누가·언제 열었다」가 찍힌다.
       ⚠ {추적열쇠} 는 보낼 때 통마다 그 사람 주소로 바뀐다(mail-bulk fill).
         여기서 실제 주소를 박으면 «모두가 같은 사람»으로 찍힌다.
       ⚠ 아웃룩·회사 메일 서버는 그림을 기본으로 막는다 — 그래서 클릭도 함께 본다.
         이 그림만으로 「안 읽었다」고 정하면 잘 읽는 담당자가 빠진다.
       ⚠ 발송기가 그림을 씻는다 — mail-send.js 의 IMG_HOST_OK 에 이 주소를 넣어야 나간다. */
    var 추적그림 = _추적
      ? '<img src="' + esc(_추적.밑주소 + '/newsOpen?i='
          + encodeURIComponent(_추적.회차) + '&e={추적열쇠}')
        + '" width="1" height="1" alt=""'
        + ' style="display:block;width:1px;height:1px;border:0">'
      : '';
    var 링크들 = _추적 ? _추적.링크들.slice() : [];
    _추적 = null;                      /* ★ 끝나면 지운다 — 다음 편지에 새 나가지 않게 */

    return {
      제목: Core.제목짓기(회, 범위),
      서식: html + 추적그림,
      본문: 평문짓기(회차자료, 설정),
      회차: 회,
      꼭지수: 그린것,
      /* 서버가 «번호»로 찾을 목록. 보낼 때 회차에 함께 담아 두어야 클릭이 통한다. */
      링크들: 링크들
    };
  }

  /* ══════════════════════════════════════════════════════════════════════
     평문 몫 — 서식을 못 읽는 메일 프로그램에게
     ══════════════════════════════════════════════════════════════════════
     ⚠ 서버가 서식에서 «알아서» 뽑게 두면 표 뼈대가 글자로 쏟아진다.
       여기서 사람이 읽을 모양으로 따로 짓는다. */
  function 평문짓기(회차자료, 설정) {
    var d = 회차자료 || {};
    var 회 = d.회차 || (Core.회차(d.날짜 || new Date().toISOString().slice(0, 10)));
    /* ⚠ 서식을 못 읽는 프로그램이 보는 몫이다 — 여기서도 같이 걸러야 한다.
         한쪽만 거르면 「어떤 사람에게는 빠지고 어떤 사람에게는 실리는」 편지가 된다. */
    var 안 = Core.실릴것만(d.안 || {}, { 보낸것: d.상태 === '발송' });
    var 설 = 설정 || {};
    var 줄 = [];
    줄.push((설.회사이름 || '푸른노무법인') + ' 주간뉴스레터');
    if (회) 줄.push(회.이름 + '  (' + 회.기간 + ')');
    줄.push('');

    Core.꼭지들.forEach(function (g) {
      /* ⚠ 우리글 꼭지는 «글 다음에 자료»가 온다 (2026-09-06). 예전에는 글만 적고
           돌아서서, 서식 못 읽는 프로그램에서는 연구자료가 통째로 빠졌다.
           여기서 return 하지 않고 아래 자료 그리기로 «이어» 간다. */
      var 것 = 안[g.키] || [];
      if (g.갈래 === '우리글') {
        var t = String(d.우리글 || '').trim();
        if (!t && !것.length) return;
        줄.push('[' + g.이름 + ']');
        if (t) { 줄.push(t); 줄.push(''); }
        if (!것.length) return;
      } else {
        if (!것.length) return;
        줄.push('[' + g.이름 + ']');
      }
      것.forEach(function (x) {
        if (x.갈래 === '자료') {
          /* ★ 평문에서도 «내려받을 곳»이 보여야 한다. 서식을 못 읽는 프로그램에서
               자료 칸이 제목만 남으면 자료가 아니라 목록이 된다. */
          줄.push('· ' + (x.제목 || '')
            + (x.발행처 ? ' (' + x.발행처 + (x.발행일 ? ' ' + 날짜꼴(x.발행일) : '') + ')' : ''));
          (x.목차 || []).slice(0, 4).forEach(function (t, i) {
            줄.push('    ' + (i + 1) + '. ' + String(t).trim());
          });
          if (x.파일) 줄.push('  내려받기: ' + x.파일);
          else if (x.링크) 줄.push('  ' + x.링크);
        } else if (x.갈래 === '판례') {
          줄.push('· ' + (x.딱지 || '[판례]') + ' ' + (x.제목 || ''));
          if (x.인용) 줄.push('    ' + x.인용);
          if (x.요지) 줄.push('    ' + x.요지);
          if (x.링크) 줄.push('  ' + x.링크);
        } else if (x.갈래 === '법령') {
          줄.push('· ' + (x.제목 || '')
            + (x.시행일 ? ' (시행 ' + 날짜꼴(x.시행일) + ')' : ''));
          if (x.링크) 줄.push('  ' + x.링크);
        } else {
          줄.push('· ' + (x.제목 || '') + (x.언론사 ? ' · ' + x.언론사 : ''));
          if (x.링크) 줄.push('  ' + x.링크);
        }
      });
      줄.push('');
    });

    줄.push('---');
    줄.push('기사는 제목과 원문 링크만 싣습니다. 본문은 각 언론사 홈페이지에서 보실 수 있습니다.');
    줄.push(설.회사이름 || '푸른노무법인');
    if (설.회신주소) 줄.push(설.회신주소);
    return 줄.join('\n');
  }

  var API = { 편지짓기: 편지짓기, 평문짓기: 평문짓기, 색: 색, 넓이: 넓이 };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else global.PuNewsTpl = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
