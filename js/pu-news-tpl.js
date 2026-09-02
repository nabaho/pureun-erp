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
    줄: '#e0dcd6', 가는줄: '#eceae6', 바탕: '#e9e7e3', 상자: '#f7f5f2'
  };
  var 폰트 = "'Malgun Gothic',sans-serif";
  var 넓이 = 600;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  /* 누를 수 있는 주소만. 발송기도 같은 잣대로 한 번 더 씻는다(문이 둘이다). */
  function href(s) {
    var u = String(s == null ? '' : s).trim();
    return /^(https?:\/\/|mailto:)/i.test(u) ? esc(u) : '';
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
    var 표시 = href(s.로고그림)
      ? '<img src="' + href(s.로고그림) + '" width="34" height="34" alt="">'
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
      + esc(회.짧은이름 ? (회.연 + '년 ' + 회.짧은이름) : '주간뉴스레터') + '</span>'
      + '</td></tr></table>';

    /* 사진을 넣으신 경우 — 글자를 사진 «위»에 얹지 않는다.
       메일에서 겹쳐 놓기(background-image·position)는 절반의 프로그램에서 깨진다.
       사진을 위에, 회차 띠를 아래에 «쌓는다» — 어디서든 같게 보인다. */
    var 사진 = href(s.배너그림)
      ? '<tr><td style="padding:0;font-size:0;line-height:0;">'
        + '<img src="' + href(s.배너그림) + '" width="' + (넓이 - 56) + '" alt=""'
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
    if (!g.best) {
      return '<tr><td style="padding:22px 28px 0 28px;">' + 이름 + '</td></tr>';
    }
    return '<tr><td style="padding:26px 28px 0 28px;">'
      + '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
      + '<td style="background-color:' + 색.딱지 + ';padding:5px 13px;">'
      + '<span style="font-size:12px;font-weight:bold;color:#ffffff;font-family:' + 폰트 + ';">Best</span>'
      + '</td><td style="padding-left:11px;">' + 이름 + '</td>'
      + '</tr></table></td></tr>';
  }

  /* ── 기사 목록 — 제목·언론사·원문 링크«까지»
     ⚠ 본문은 옮기지 않는다. 남의 글이다. (functions/news-brief.js 와 같은 규칙) */
  function 기사줄(항목들) {
    var 줄 = (항목들 || []).map(function (x) {
      var u = href(x.링크);
      var 제 = esc(x.제목 || '');
      var 글 = u
        ? '<a href="' + u + '" style="color:' + 색.글 + ';text-decoration:none;">' + 제 + '</a>'
        : 제;
      return '<div style="padding-bottom:2px;">·&nbsp;' + 글
        + (x.언론사 ? ' <span style="color:' + 색.흐린글 + ';font-size:12px;">· '
            + esc(x.언론사) + '</span>' : '') + '</div>';
    }).join('');
    return '<tr><td style="padding:16px 28px 0 28px;font-size:14px;line-height:1.95;'
      + 'color:' + 색.글 + ';font-family:' + 폰트 + ';">' + 줄 + '</td></tr>';
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

  /* 정책 꼭지는 법령과 기사가 섞인다 — 법령을 위에 둔다(원문까지 실을 수 있는 쪽이 값어치다) */
  function 섞인줄(항목들) {
    var 법 = 법령줄(항목들);
    var 기사 = (항목들 || []).filter(function (x) { return x.갈래 !== '법령'; });
    var out = '';
    if (법) {
      out += '<tr><td style="padding:14px 28px 0 28px;font-size:14px;line-height:1.85;'
        + 'color:' + 색.글 + ';font-family:' + 폰트 + ';">' + 법 + '</td></tr>';
    }
    if (기사.length) out += 기사줄(기사);
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
      + '<br><br><span style="color:#b3aca3;">' + 머리말 + ' ' + 거부 + '</span>'
      + '</td></tr></table></td></tr>'
      + '<tr><td style="height:34px;line-height:34px;font-size:1px;">&nbsp;</td></tr>';
  }

  /* ══════════════════════════════════════════════════════════════════════
     편지 한 통 — 서식 몫
     ══════════════════════════════════════════════════════════════════════ */
  function 편지짓기(회차자료, 설정) {
    var d = 회차자료 || {};
    var 회 = d.회차 || (Core.회차(d.날짜 || new Date().toISOString().slice(0, 10)));
    var 안 = d.안 || {};
    var 설 = 설정 || {};
    var 범위 = d.범위 || 설.범위 || '자문중';

    var 속 = '';
    var 그린것 = 0;
    Core.꼭지들.forEach(function (g) {
      if (g.갈래 === '우리글') {
        var 칸 = 우리글칸(d.우리글);
        if (!칸) return;
        if (그린것) 속 += 줄긋기(22);
        속 += 꼭지제목(g) + 칸; 그린것++;
        return;
      }
      var 것 = 안[g.키] || [];
      if (!것.length) return;                    /* 빈 꼭지는 «아예 안 그린다» */
      if (그린것) 속 += 줄긋기(22);
      속 += 꼭지제목(g) + (g.갈래 === '법령' ? 섞인줄(것) : 기사줄(것));
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

    return {
      제목: Core.제목짓기(회, 범위),
      서식: html,
      본문: 평문짓기(회차자료, 설정),
      회차: 회,
      꼭지수: 그린것
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
    var 안 = d.안 || {};
    var 설 = 설정 || {};
    var 줄 = [];
    줄.push((설.회사이름 || '푸른노무법인') + ' 주간뉴스레터');
    if (회) 줄.push(회.이름 + '  (' + 회.기간 + ')');
    줄.push('');

    Core.꼭지들.forEach(function (g) {
      if (g.갈래 === '우리글') {
        var t = String(d.우리글 || '').trim();
        if (!t) return;
        줄.push('[' + g.이름 + ']'); 줄.push(t); 줄.push('');
        return;
      }
      var 것 = 안[g.키] || [];
      if (!것.length) return;
      줄.push('[' + g.이름 + ']');
      것.forEach(function (x) {
        if (x.갈래 === '법령') {
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
