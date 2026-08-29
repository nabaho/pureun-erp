'use strict';
/* 푸른노무법인 경력관리 — 서식 「칸 지도」
   (브라우저 window.KcareerFormMap / Node module.exports 겸용, DOM 미사용 — XML 문자열만 다룬다)
   설계서: docs/superpowers/specs/2026-08-29-kcareer-칸지도-서식채움-design.md

   왜 만드나: 지금 자동채움은 «라벨을 알아본 자리만» 채우고 모르는 자리는 조용히 지나간다.
   그래서 서식이 바뀔 때마다 몇 칸씩 빈다 — 실측(2026-08-29) 모양이 다른 서식 여섯에서
   채울 자리 37군데 중 이름까지 알아본 것은 12군데뿐이었다. 대표가 올린 지원서에서는
   「(한글)」 칸에 글자가 있다는 이유로 이름이 통째로 빠졌다.

   여기서 뒤집는다 — «이름은 짐작이지만 자리는 사실이다».
   먼저 채울 자리를 빠짐없이 찾아 두고, 이름은 나중에 짐작하거나 «사람에게 묻는다».
   모르는 자리를 목록에 올려 물어보는 것이 이 모듈이 있는 까닭이다. */
(function (root) {

  var X = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./kcareer-hwpxfill.js')
    : root.KcareerHwpxFill;

  /* ── 칸 하나가 «어떤 자리»인가 ──
     빈칸     : 글자가 하나도 없다 → 그 칸에 넣는다
     안내글뒤 : 괄호만 있는 짧은 안내 「(한글)」「(한자)」「(인)」 → 글자 «뒤에 이어» 쓴다
     칸안라벨 : 「자택:____」「기관명 : 부서명 :」 → 라벨 뒤 빈자리에 넣는다
     ''       : 그냥 본문 → 자리가 아니다. 절대 덮지 않는다. */
  function classify(text) {
    var s = String(text == null ? '' : text).trim();
    if (s === '') return '빈칸';
    if (/^[（(][^)）]{1,6}[)）]$/.test(s)) return '안내글뒤';
    if (/_{2,}/.test(s) || /[:：]\s*$/.test(s) || /[:：]\s{2,}/.test(s)) return '칸안라벨';
    return '';
  }

  function scan(sectionXml) {
    var slots = [], lists = [], warn = { textBoxes: 0, nested: 0 };
    var ti = -1;
    X.eachTable(String(sectionXml || ''), function (tbl) {
      ti++;
      var rows = X.splitRows(tbl);
      var grid = rows.map(function (tr) { return X.splitCells(tr).map(X.cellText); });
      grid.forEach(function (cells, ri) {
        cells.forEach(function (txt, ci) {
          var kind = classify(txt);
          if (!kind) return;
          slots.push({ id: 't' + ti + 'r' + ri + 'c' + ci, tbl: ti, row: ri, col: ci,
                       kind: kind, text: String(txt || '').trim(),
                       left: ci > 0 ? String(cells[ci - 1] || '').trim() : '', guess: '' });
        });
      });
      return tbl;   /* 훑기만 한다 — 여기서는 아무것도 안 바꾼다 */
    });
    return { slots: slots, lists: lists, warn: warn };
  }

  var api = { scan: scan, classify: classify };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KcareerFormMap = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
