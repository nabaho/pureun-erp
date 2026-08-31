/* 자문사현황 쪽을 «자료로» 그린다 — 로고를 보이고, 숨기고, 차례를 바꾼다.
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-08-31: 「나머지도 순서대로」

   ★ 이 쪽에는 «글자가 없다». 자문사 로고 그림만 늘어서 있다.
     그래서 여기서 우리가 정할 수 있는 것은 «어느 로고를, 어떤 차례로» 보이느냐뿐이다.
     (홈페이지에서도 로고를 눌러 봐야 아무 데도 가지 않는다 — 링크가 주석 처리돼 있다.)

   ★ 새 로고 «올리기»는 아직 없다. 그림을 어디에 두느냐를 정해야 하는데,
     그건 이 부품이 정할 일이 아니다. 지금 있는 로고를 다루는 것까지가 여기 몫이다.

   ★ 구성원과 같은 얼개다: «첫 칸»을 본으로 삼아 찍어 낸다. 마크업을 새로 쓰지 않는다. */
(function (global) {
  'use strict';

  /* 여는 태그 자리에서 «짝이 맞는» 닫는 태그까지 (구성원 부품과 같은 셈법) */
  function 덩어리(html, 시작, 태그) {
    var 열기 = new RegExp('<' + 태그 + '\\b', 'gi');
    var 닫기 = new RegExp('</' + 태그 + '\\s*>', 'gi');
    var i = 시작, 깊이 = 0;
    while (i < html.length) {
      열기.lastIndex = i; 닫기.lastIndex = i;
      var a = 열기.exec(html);
      var b = 닫기.exec(html);
      if (!b) return null;
      if (a && a.index < b.index) { 깊이++; i = a.index + 1; continue; }
      깊이--;
      i = b.index + b[0].length;
      if (깊이 === 0) return html.slice(시작, i);
    }
    return null;
  }

  var 칸시작 = /<div class="bh bh_item item item\d+/g;

  function 칸들(html) {
    var out = [];
    칸시작.lastIndex = 0;
    var m;
    while ((m = 칸시작.exec(html))) {
      var blk = 덩어리(html, m.index, 'div');
      if (!blk) break;
      out.push({ at: m.index, html: blk });
      칸시작.lastIndex = m.index + blk.length;
    }
    return out;
  }

  /* 지금 쪽 → 로고 목록 */
  function 로고읽기(html) {
    return 칸들(html).map(function (c) {
      var srl = (/data-srl="(\d+)"/.exec(c.html) || [, ''])[1];
      var 그림 = (/<img[^>]+src="([^"]+)"/.exec(c.html) || [, ''])[1];
      return { srl: srl, 그림: 그림 };
    }).filter(function (x) { return x.그림; });
  }

  function 칸그리기(본, 로고, 자리) {
    var h = 본;
    h = h.replace(/(<div class="bh bh_item item item)\d+/, '$1' + (자리 + 1));
    h = h.replace(/(<img[^>]+src=")[^"]*(")/, '$1' + 로고.그림 + '$2');
    /* 로고를 누를 자리는 지금도 «주석»으로 막혀 있다 — 그 모양을 그대로 지킨다 */
    h = h.replace(/data-srl="\d*"/g, 'data-srl="' + (로고.srl || '') + '"');
    return h;
  }

  /* 자료 → 쪽. 목록이 비면 «아무것도 하지 않는다» — 로고를 통째로 지우는 사고를 막는다. */
  function 쪽그리기(html, 로고들) {
    var 칸 = 칸들(html);
    if (!칸.length) throw new Error('본으로 삼을 칸을 찾지 못했습니다');
    if (!로고들 || !로고들.length) throw new Error('보일 로고가 하나도 없습니다');
    var 새것 = 로고들.map(function (p, i) { return 칸그리기(칸[0].html, p, i); }).join('\n\t\t\t\t\t');
    var 처음 = 칸[0].at;
    var 끝 = 칸[칸.length - 1].at + 칸[칸.length - 1].html.length;
    return html.slice(0, 처음) + 새것 + html.slice(끝);
  }

  /* 화면이 정해 둔 것(숨긴 것·차례) + 지금 쪽 → 올릴 목록.
     ★ 차례에 없는 로고는 «뒤에» 그대로 붙인다 — 새로 생긴 로고가 조용히 사라지지 않게. */
  function 올릴로고(html, 정한것) {
    var 있는것 = 로고읽기(html);
    var 숨김 = (정한것 && 정한것.숨김) || {};
    var 차례 = (정한것 && 정한것.차례) || [];
    var 자리 = {};
    있는것.forEach(function (x, i) { 자리[x.srl] = i; });

    var 앞 = [];
    차례.forEach(function (srl) {
      if (자리[srl] === undefined) return;          // 없어진 로고는 건너뛴다
      앞.push(있는것[자리[srl]]);
    });
    var 담긴것 = {};
    앞.forEach(function (x) { 담긴것[x.srl] = 1; });
    var 뒤 = 있는것.filter(function (x) { return !담긴것[x.srl]; });

    var 다 = 앞.concat(뒤);
    return {
      갈것: 다.filter(function (x) { return !숨김[x.srl]; }),
      숨긴것: 다.filter(function (x) { return !!숨김[x.srl]; })
    };
  }

  global.PuSitePartner = {
    로고읽기: 로고읽기,
    쪽그리기: 쪽그리기,
    올릴로고: 올릴로고,
    칸들: 칸들
  };
})(typeof window !== 'undefined' ? window : globalThis);
