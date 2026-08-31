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

  /* ── 메인 화면의 «흐르는 로고 띠» ────────────────────────────────────────
     ★ 메인에도 자문사 로고가 실려 있다 — 그것도 «네 벌»이 이어 붙어 흐른다.
       자문사 쪽만 고치고 메인을 그대로 두면, 뺀 로고가 메인에서는 계속 돈다.
       원래 홈페이지는 한 자료를 두 쪽이 끌어다 썼는데, 굳히면서 그 연결이 끊겼다.
     ★ 메인에는 로고가 «아닌» 칸도 섞여 있다(인사말 등). 그림으로 가려낸다 —
       칸 자리(몇 번째)로 세면 홈페이지 반죽이 바뀔 때 엉뚱한 칸을 갈아 끼운다.
     ★ 띠는 «벌 수»를 그대로 지킨다. 네 벌이 세 벌이 되면 흐르다가 끊겨 보인다. */

  function 파일이름(p) { return String(p == null ? '' : p).split('/').pop(); }

  /* 로고 칸이 «이어져 있는 묶음»들을 찾는다 (한 묶음이 띠 한 벌이다) */
  function 로고묶음(html, 아는로고) {
    var 아는것 = {};
    (아는로고 || []).forEach(function (g) { 아는것[파일이름(g.그림 || g)] = 1; });
    var 칸 = 칸들(html);
    var 묶음 = [], 지금 = null;
    칸.forEach(function (c) {
      var 그림 = (/<img[^>]+src="([^"]+)"/.exec(c.html) || [, ""])[1];
      var 로고칸 = 그림 && 아는것[파일이름(그림)];
      /* ★ 칸과 칸 «사이»에 태그가 있으면 묶음을 끊는다.
         메인의 로고 띠는 위젯 네 개로 나뉘어 있고, 그 사이에 감싸개 태그가 있다.
         끊지 않고 첫 칸부터 끝 칸까지 통째로 갈아 끼우면 «그 감싸개가 통째로 사라져»
         띠가 무너진다(실제로 그렇게 한 번 무너뜨렸다). */
      if (로고칸 && 지금 && String(html.slice(지금.끝, c.at)).indexOf('<') >= 0) 지금 = null;
      if (로고칸) {
        if (!지금) { 지금 = { 처음: c.at, 끝: 0, 본: c.html, 수: 0 }; 묶음.push(지금); }
        지금.끝 = c.at + c.html.length;
        지금.수++;
      } else {
        지금 = null;                     // 로고가 아닌 칸을 만나면 묶음이 끊긴다
      }
    });
    return 묶음;
  }

  /* 메인의 로고 띠를 다시 그린다. 로고가 아닌 칸은 손도 대지 않는다. */
  function 메인그리기(html, 보일것, 아는로고) {
    if (!보일것 || !보일것.length) throw new Error('보일 로고가 하나도 없습니다');
    var 묶음 = 로고묶음(html, 아는로고);
    /* 띠가 없으면 아래 되풀이가 한 번도 안 돌아 그대로 돌아간다 — 따로 막을 것이 없다 */
    /* ★ 띠는 «같은 로고를 여러 벌» 이어 붙여 흐르게 한 것이다(14장 × 4벌 = 56칸).
       한 벌만 그려 넣으면 띠가 짧아져 «흐르다 끊겨» 보인다. 몇 벌인지 세어 그대로 지킨다. */
    var 한벌 = (아는로고 && 아는로고.length) || 보일것.length;
    /* 뒤에서부터 갈아 끼운다 — 앞에서부터 하면 뒤 묶음의 자리 번호가 어긋난다 */
    for (var i = 묶음.length - 1; i >= 0; i--) {
      var g = 묶음[i];
      var 벌수 = Math.max(1, Math.round(g.수 / 한벌));
      var 칸글 = [];
      for (var v = 0; v < 벌수; v++) {
        보일것.forEach(function (x, j) {
          /* 메인은 쪽 뿌리에 있어 «../» 가 없다 */
          칸글.push(칸그리기(g.본, { srl: x.srl, 그림: String(x.그림).replace(/^\.\.\//, '') },
            v * 보일것.length + j));
        });
      }
      html = html.slice(0, g.처음) + 칸글.join('\n\t\t\t\t\t') + html.slice(g.끝);
    }
    return html;
  }

  global.PuSitePartner = {
    로고읽기: 로고읽기,
    쪽그리기: 쪽그리기,
    올릴로고: 올릴로고,
    메인그리기: 메인그리기,
    로고묶음: 로고묶음,
    칸들: 칸들
  };
})(typeof window !== 'undefined' ? window : globalThis);
