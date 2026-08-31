/* 공지사항 쪽을 «자료로» 그린다 — 목록 한 장과 글 한 쪽.
   ★ 이 부품은 «서버에서만» 쓴다. 공지는 완전 자동이라 화면에서 그릴 일이 없고,
     함수는 배포할 때 functions/ 안만 싣기 때문이다(js/ 에 두면 서버가 못 읽는다).
 ═══════════════════════════════════════════════════════════════════════════
 대표 결정 2026-08-31: 「노동뉴스 + 법령 완전자동」 — 매일 아침 저절로 올라간다.

 ★ 구성원·자문사와 같은 얼개다: 지금 쪽의 «첫 줄»을 본으로 삼아 찍어 낸다.
   마크업을 새로 쓰지 않으므로 화면이 달라질 자리가 없다.

 ★ 있던 글은 «건드리지 않는다». 새 글을 맨 위에 얹을 뿐이다 —
   대표 결정으로 지금 글 셋은 그대로 두기로 했다. */
"use strict";

function 감싸기(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── 목록 쪽 ── */

/* 글 한 줄(<tr>)들을 찾는다. 목록의 <tbody> 안에 있다. */
function 줄들(html) {
  const s = String(html == null ? '' : html);
  const b = s.indexOf('<tbody');
  if (b < 0) return [];
  const e = s.indexOf('</tbody>', b);
  if (e < 0) return [];
  const 안 = s.slice(b, e);
  const out = [];
  const re = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
  let m;
  while ((m = re.exec(안))) out.push({ at: b + m.index, html: m[0] });
  return out;
}

function 글읽기(html) {
  return 줄들(html).map(function (r) {
    const a = /<td class="title">[\s\S]*?<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(r.html);
    return {
      번호: (/notice\/(\d+)\//.exec(a ? a[1] : '') || [, ''])[1],
      제목: a ? String(a[2]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '',
      날짜: (/<td class="time[^"]*">([^<]*)<\/td>/i.exec(r.html) || [, ''])[1].trim(),
      차례: (/<td class="number">\s*([^<\s]*)/i.exec(r.html) || [, ''])[1].trim()
    };
  }).filter(function (x) { return x.번호 && x.제목; });
}

/* 한 줄을 자료대로 갈아 끼운다 */
function 줄그리기(본, 글, 차례) {
  let h = 본;
  h = h.replace(/(<td class="number">)[\s\S]*?(<\/td>)/i, '$1 ' + 감싸기(String(차례)) + '\t\t\t$2');
  h = h.replace(/(<td class="title">[\s\S]*?<a href=")[^"]*("[^>]*>)[\s\S]*?(<\/a>)/i,
    '$1../notice/' + 감싸기(글.번호) + '/$2' + 감싸기(글.제목) + '$3');
  h = h.replace(/(<td class="time[^"]*">)[^<]*(<\/td>)/i, '$1' + 감싸기(글.날짜) + '$2');
  /* ★ 새 글의 조회수는 0 에서 시작한다. 본으로 삼은 줄의 숫자를 그대로 두면
     올린 첫날부터 「31번 읽음」이 되어, 작은 거짓말이 화면에 박힌다. */
  h = h.replace(/(<td class="readNum">)[\s\S]*?(<\/td>)/i, '$1' + '0' + '$2');
  return h;
}

/* 목록을 다시 그린다. 글이 하나도 없으면 «아무것도 하지 않는다».
   ★ 있던 글의 줄은 «그대로» 쓴다 — 새로 찍으면 조회수처럼 우리가 모르는 것이 지워진다.
     바꾸는 것은 차례 번호 하나뿐이다(새 글이 위에 얹히면 아래가 밀리므로). */
function 목록그리기(html, 글들) {
  const 줄 = 줄들(html);
  if (!줄.length) throw new Error('본으로 삼을 줄을 찾지 못했습니다');
  if (!글들 || !글들.length) throw new Error('실을 글이 하나도 없습니다');
  const 있던것 = {};
  줄.forEach(function (r) {
    const no = (/notice\/(\d+)\//.exec(r.html) || [, ''])[1];
    if (no) 있던것[no] = r.html;
  });
  /* ★ 번호는 «위에서부터 큰 수» — 지금 홈페이지가 그렇게 센다(3,2,1) */
  const 새것 = 글들.map(function (g, i) {
    const 차례 = 글들.length - i;
    const 옛줄 = 있던것[g.번호];
    if (옛줄) {
      return 옛줄.replace(/(<td class="number">)[\s\S]*?(<\/td>)/i,
        '$1 ' + 감싸기(String(차례)) + '\t\t\t$2');
    }
    return 줄그리기(줄[0].html, g, 차례);
  }).join('\n\t\t\t\t\t\t\t\t\t\t\t');
  const 처음 = 줄[0].at;
  const 끝 = 줄[줄.length - 1].at + 줄[줄.length - 1].html.length;
  return html.slice(0, 처음) + 새것 + html.slice(끝);
}

/* ── 글 쪽 ── */

/* 본으로 쓴 글 쪽의 «번호»를 알아낸다 (본문 표시가 그 번호를 달고 있다) */
function 본번호(html) {
  return (/<!--BeforeDocument\((\d+),/.exec(String(html == null ? '' : html)) || [, ''])[1];
}

/* 글 한 쪽을 만든다. 본(다른 글 쪽)의 «틀»을 그대로 쓰고 알맹이만 갈아 끼운다. */
function 글쪽만들기(본, 글) {
  const 옛번호 = 본번호(본);
  if (!옛번호) throw new Error('본으로 삼을 글 쪽이 아닙니다');
  let h = 본;

  /* 글 번호 — 본문 표시·글 상자 이름·가는 길에 다 박혀 있다 */
  h = h.split('BeforeDocument(' + 옛번호 + ',').join('BeforeDocument(' + 글.번호 + ',');
  h = h.split('AfterDocument(' + 옛번호 + ',').join('AfterDocument(' + 글.번호 + ',');
  h = h.replace(new RegExp('document_' + 옛번호 + '_(\\d+)', 'g'), 'document_' + 글.번호 + '_$1');
  h = h.split('notice/' + 옛번호 + '/').join('notice/' + 글.번호 + '/');
  h = h.split('notice/' + 옛번호 + '"').join('notice/' + 글.번호 + '"');

  /* 제목 — 쪽 제목·머리 제목·공유 제목 */
  h = h.replace(/<title>[^<]*<\/title>/i, '<title>푸른노무법인 - ' + 감싸기(글.제목) + '</title>');
  h = h.replace(/(<h1>\s*<a[^>]*>)[\s\S]*?(<\/a>\s*<\/h1>)/i,
    '$1' + 감싸기(글.제목) + '$2');
  h = h.replace(/(<meta[^>]+(?:name="twitter:title"|property="og:title")[^>]*content=")[^"]*(")/gi,
    '$1푸른노무법인 - ' + 감싸기(글.제목) + '$2');
  h = h.replace(/(<meta[^>]+(?:name="description"|name="twitter:description"|property="og:description")[^>]*content=")[^"]*(")/gi,
    '$1' + 감싸기(글.요약 || 글.제목) + '$2');

  /* 날짜 */
  h = h.replace(/(<i class="xi-time"><\/i>날짜 : <\/span><span class="detail_content">)[^<]*(<\/span>)/i,
    '$1' + 감싸기(글.날짜) + '$2');

  /* ★ 본문 — 표시와 표시 «사이»만 갈아 끼운다. 짝을 세지 않고 통째로 자르면
     그 아래 글꼬리·목록으로 가는 단추까지 함께 날아간다. */
  const 앞표 = '<!--BeforeDocument(' + 글.번호 + ',';
  const 뒤표 = '<!--AfterDocument(' + 글.번호 + ',';
  const a = h.indexOf(앞표);
  const b = h.indexOf(뒤표);
  if (a >= 0 && b > a) {
    const a끝 = h.indexOf('-->', a) + 3;
    h = h.slice(0, a끝)
      + '<div class="document_' + 글.번호 + '_5 rhymix_content xe_content">'
      + (글.본문 || '') + '</div>'
      + h.slice(b);
  }
  return h;
}

module.exports = { 글읽기, 목록그리기, 글쪽만들기, 줄들, 본번호, 줄그리기 };
