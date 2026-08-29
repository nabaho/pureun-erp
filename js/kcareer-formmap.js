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

  /* ── 목록 표 알아보기 ──
     머리행에서 목록 열쇠가 «둘 이상» 맞으면 목록 표다.
     하나만 맞으면 보통 표로 둔다 — 「기간 | 비고」 같은 표를 삼키면 안 된다.
     ⚠ 목록 표를 낱개 칸으로 두면 학력·경력 표 하나가 칸 지도 아홉 줄이 되어 못 쓴다. */
  function detectList(grid, ti) {
    for (var r = 0; r < grid.length; r++) {
      var keys = grid[r].map(function (t) { return X.colKeyOf(t); });
      var hit = keys.filter(Boolean).length;
      if (hit < 2) continue;
      var kind = keys.indexOf('school') >= 0 ? 'edu'
        : (keys.indexOf('org') >= 0 && (keys.indexOf('role') >= 0 || keys.indexOf('period') >= 0)) ? 'career' : '';
      if (!kind) continue;
      var blank = 0;
      for (var q = r + 1; q < grid.length; q++) {
        var empty = grid[q].every(function (t) { return !String(t || '').trim(); });
        if (empty) blank++;
      }
      return { id: 'L' + ti, tbl: ti, kind: kind, cols: keys, head: r, blank: blank };
    }
    return null;
  }

  /* 칸 안에 표가 또 있는 자리를 센다 — 건드리지는 않되 «있다»고는 말해야 한다.
     ⚠ X.eachTable 은 중첩 표를 만나면 콜백을 아예 안 부르므로 여기서 따로 센다. */
  function countNested(xml) {
    var n = 0, pos = 0;
    for (;;) {
      var s = xml.indexOf('<hp:tbl', pos);
      if (s < 0) break;
      var e = xml.indexOf('</hp:tbl>', s);
      if (e < 0) break;
      e += '</hp:tbl>'.length;
      if (xml.slice(s, e).indexOf('<hp:tbl', 7) >= 0) n++;
      pos = e;
    }
    return n;
  }

  function scan(sectionXml) {
    var xmlAll = String(sectionXml || '');
    var slots = [], lists = [], warn = { textBoxes: 0, nested: 0 };
    var ti = -1;
    X.eachTable(xmlAll, function (tbl) {
      ti++;
      var rows = X.splitRows(tbl);
      var grid = rows.map(function (tr) { return X.splitCells(tr).map(X.cellText); });
      var L = detectList(grid, ti);
      if (L) { lists.push(L); return tbl; }   /* 목록 표는 낱개로 세지 않는다 */
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
    /* 못 읽는 것은 «반드시» 세어서 알린다 — 조용히 빠지면 「채웠다는데 비어 있다」가 된다.
       글상자(도형 안의 글)는 엔진이 아직 못 읽고, 중첩 표는 경계를 잘못 짚어 건드리지 않는다. */
    warn.textBoxes = (xmlAll.match(/<hp:drawText\b/g) || []).length;
    warn.nested = countNested(xmlAll);
    return { slots: slots, lists: lists, warn: warn };
  }

  /* 안내글 「(한글)」「(한자)」「(인)」이 무엇을 뜻하는지 —
     ⚠ 「(한글)」은 그 자체로는 아무 뜻이 없다. «왼쪽 칸이 성명일 때만» 이름이다.
       성명 행이 아닌 곳의 「(한글)」에 이름을 넣으면 엉뚱한 자리에 이름이 박힌다. */
  function hintKey(slot) {
    var t = X.normLabel(slot.text);
    if (/^한자$/.test(t)) return 'nameHanja';
    if (/^한글$/.test(t)) return X.fieldKeyOf(slot.left) === 'name' ? 'name' : '';
    if (/^(인|서명|서명또는인|印)$/.test(t)) return '__stamp';
    return X.fieldKeyOf(slot.text);
  }

  /* ── 짝 맞추기 ──
     모르면 «모른다»고 남긴다. 지어내면 엉뚱한 자리에 값이 박히고,
     그건 안 채운 것보다 나쁘다 — 잘못 낸 서류는 되돌릴 수 없다.
     rrn(주민등록번호)은 알아보되 채우지 않는다. hint 로만 알린다. */
  function guess(map, data) {
    map.slots.forEach(function (s) {
      var k = s.kind === '안내글뒤' ? hintKey(s)
            : s.kind === '칸안라벨' ? '__incell'
            : X.fieldKeyOf(s.left);
      if (k === 'rrn') { s.guess = ''; s.hint = 'rrn'; return; }
      s.guess = k || '';
    });
    map.lists.forEach(function (l) { l.guess = l.kind; });
    return map;
  }

  /* 표·행·열로 칸 하나를 찾아 바꾼다 */
  function eachCellAt(xml, tbl, row, col, fn) {
    var ti = -1, done = false;
    var out = X.eachTable(xml, function (t) {
      ti++;
      if (ti !== tbl || done) return t;
      var rows = X.splitRows(t);
      if (!rows[row]) return t;
      var cells = X.splitCells(rows[row]);
      if (!cells[col]) return t;
      var next = fn(cells[col]);
      if (next == null || next === cells[col]) return t;
      done = true;
      return t.replace(rows[row], rows[row].replace(cells[col], next));
    });
    return { xml: out, ok: done };
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* 안내글 「(한글)」 뒤에 이어 쓴다 — 지우지 않는다.
     ⚠ 안내글을 지우면 서식이 뜻하는 「여기에 한글로 쓰세요」가 사라진다.
       종이로 낼 때 다음 사람이 무슨 칸인지 알 수 없게 된다. */
  function appendAfter(tc, value) {
    var m = tc.match(/(<hp:t[^>]*>)([\s\S]*?)(<\/hp:t>)/);
    if (!m) return null;
    return tc.replace(m[0], m[1] + m[2] + ' ' + esc(value) + m[3]);
  }

  /* ── 되돌려 넣기 ──
     화면이 만든 plan 만 보고 넣는다. 화면은 XML 을 모르고, 여기는 화면을 모른다.
     plan = { picks:{자리이름표: 열쇠}, lists:{목록이름표: 갈래}, data:{fields,edu,career} }
     열쇠가 '' 면 «비워 둔다». '__stamp' 는 도장 자리라 글자를 안 넣는다. */
  function apply(sectionXml, plan) {
    plan = plan || {};
    var picks = plan.picks || {}, data = plan.data || {}, fields = data.fields || {};
    var xml = String(sectionXml || ''), filled = [], failed = [];
    var map = scan(xml);

    Object.keys(picks).forEach(function (id) {
      var key = picks[id];
      if (!key || key === '__stamp') return;      /* 비워 둠 · 도장은 여기서 안 다룬다 */
      var found = map.slots.filter(function (x) { return x.id === id; });
      if (!found.length) { failed.push({ id: id, why: '그런 자리가 없습니다' }); return; }
      var s = found[0], r;
      if (key === '__incell') {
        /* 칸 안에 라벨이 여럿인 자리는 통째로 기존 일꾼(autoFill)에게 맡긴다 */
        r = eachCellAt(xml, s.tbl, s.row, s.col, function (tc) {
          var one = X.autoFill('<hp:tbl><hp:tr>' + tc + '</hp:tr></hp:tbl>', { fields: fields });
          if (!one.changed) return null;
          var m2 = one.xml.match(/<hp:tc\b[\s\S]*<\/hp:tc>/);
          return m2 ? m2[0] : null;
        });
        if (r.ok) { xml = r.xml; filled.push({ id: id, key: key, value: '(칸 안 라벨)' }); }
        else failed.push({ id: id, why: '칸 안 라벨을 못 채웠습니다' });
        return;
      }
      var val = fields[key];
      if (val == null || val === '') { failed.push({ id: id, why: '넣을 값이 없습니다' }); return; }
      r = eachCellAt(xml, s.tbl, s.row, s.col, function (tc) {
        return s.kind === '안내글뒤' ? appendAfter(tc, val) : X.fillCell(tc, val);
      });
      if (r.ok) { xml = r.xml; filled.push({ id: id, key: key, value: val }); }
      else failed.push({ id: id, why: '이 칸에는 넣을 수 없습니다' });
    });

    /* 목록 표는 기존 fillList(autoFill 안)가 이미 잘 한다 — 다시 만들지 않는다 */
    var wantLists = plan.lists || {};
    if (Object.keys(wantLists).length) {
      var before = xml;
      var r2 = X.autoFill(xml, { fields: {}, edu: data.edu || [], career: data.career || [] });
      if (r2.changed) {
        xml = r2.xml;
        (r2.report.lists || []).forEach(function (l) {
          filled.push({ id: 'L', key: l.kind, value: l.put + '줄' });
        });
      }
      if (xml === before) failed.push({ id: 'L', why: '목록 표에 빈 줄이 없습니다' });
    }

    return { xml: xml, changed: xml !== String(sectionXml || ''), filled: filled, failed: failed };
  }

  /* ── 서식 지문 ──
     «칸의 짜임»만 본다 — 표 개수 · 행 수 · 각 행의 칸 수 · «알아본 라벨».

     ⚠ 칸의 글자를 그대로 담으면 안 된다. 한 번 채우고 나면 빈 칸에 값이 들어가
       지문이 달라지고, 그러면 방금 정한 기억을 다음번에 못 쓴다(실측에서 걸렸다).
     ⚠ 그래서 «사전이 알아본 라벨만» 담는다 — 라벨 칸은 절대 덮지 않으므로 안 변한다.
       채워 넣은 값(권형하·푸른노무법인)은 라벨이 아니라 담기지 않는다.
     ⚠ 알아본 라벨이 하나도 없어도 짜임만으로 지문이 선다 — 그때는 서로 다른 서식이
       같은 지문을 가질 수 있다. 그건 «기억을 못 쓰는» 쪽이 아니라 «잘못 쓰는» 쪽이므로,
       행·칸 수까지 모두 같아야만 같은 지문이 되게 촘촘히 적는다. */
  function fingerprint(sectionXml) {
    var parts = [], ti = -1;
    X.eachTable(String(sectionXml || ''), function (t) {
      ti++;
      var rows = X.splitRows(t);
      parts.push('T' + ti + ':' + rows.length);
      rows.forEach(function (tr, ri) {
        var cells = X.splitCells(tr).map(X.cellText);
        var labels = cells.map(function (c) {
          return X.fieldKeyOf(c) || X.colKeyOf(c) || '';
        }).join(',');
        parts.push(ri + '/' + cells.length + '|' + labels);
      });
      return t;
    });
    var s = parts.join(';'), h = 5381;
    for (var i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) | 0; }
    return 'F' + (h >>> 0).toString(36) + '.' + s.length;
  }

  var api = { scan: scan, classify: classify, detectList: detectList,
              guess: guess, hintKey: hintKey, apply: apply, fingerprint: fingerprint };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KcareerFormMap = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
