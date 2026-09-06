'use strict';
/* 푸른노무법인 경력관리 — 서식 「입력판」
   (브라우저 window.KcareerFormHtml / Node module.exports 겸용, DOM 미사용 — 글자만 만든다)

   무엇을 하나: 받은 한글 서식의 표를 «그대로» HTML 표로 그려, 빈 칸에 바로 칠 수 있게 한다.
   대표 제안(2026-08-29): 「한글 파일을 똑같은 형태로 html 로 변환해서 데이터를 넣으면 어떤가」.

   ★ 내는 파일은 여전히 «원본 한글»이다. 여기서 그리는 HTML 은 치는 화면일 뿐이고,
     저장은 KcareerFormMap.apply 가 원본 XML 의 그 칸에 값만 넣는다.
     HTML 을 그대로 내면 글꼴·여백·표 너비가 미세하게 달라져 「서식을 고친」 것이 된다.

   ⚠ 자리 이름표(slotId)는 KcareerFormMap.scan 과 «같은 규칙»이어야 한다(t{표}r{행}c{칸}).
     다르면 화면에 친 값이 엉뚱한 칸으로 들어간다. 검사가 이 둘을 맞대 본다. */
(function (root) {

  var X = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./kcareer-hwpxfill.js') : root.KcareerHwpxFill;
  var MAP = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./kcareer-formmap.js') : root.KcareerFormMap;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function num(v, d) { var n = parseInt(v, 10); return isFinite(n) ? n : d; }
  /* XML 에서 읽은 글자는 이미 «감싸인» 상태다(&lt;). 한 번 풀어야 두 번 감싸지 않는다 —
     안 풀면 화면에 「&lt;b&gt;」가 그대로 보인다. */
  function unesc(s) {
    return String(s == null ? '' : s)
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }

  /* 칸 하나에서 행·열·병합을 읽는다. 없으면 «자리 순서»로 미룬다(옛 서식). */
  function cellGeom(tc, fallbackCol) {
    var a = /<hp:cellAddr[^>]*colAddr="(\d+)"[^>]*rowAddr="(\d+)"/.exec(tc)
         || /<hp:cellAddr[^>]*rowAddr="(\d+)"[^>]*colAddr="(\d+)"/.exec(tc);
    var s = /<hp:cellSpan[^>]*colSpan="(\d+)"[^>]*rowSpan="(\d+)"/.exec(tc);
    var w = /<hp:cellSz[^>]*width="(\d+)"/.exec(tc);
    return {
      col: a ? num(a[1], fallbackCol) : fallbackCol,
      colSpan: s ? Math.max(1, num(s[1], 1)) : 1,
      rowSpan: s ? Math.max(1, num(s[2], 1)) : 1,
      width: w ? num(w[1], 0) : 0
    };
  }

  /* ── 칸 안 라벨을 조각으로 가른다 ──
     「자택:____  직장:____」 → [글 '자택:', 입력 phoneHome, 글 '직장:', 입력 phoneWork]
     사전은 kcareer-hwpxfill 것을 그대로 쓴다 — 두 곳에 두면 한쪽만 늘어난다. */
  function incellParts(text) {
    var labels = (X.incellLabels && X.incellLabels()) || [];
    var hits = [];
    labels.forEach(function (L) {
      var re = new RegExp('(?:' + L.re.source + ')\\s*[:：]', 'g'), m;
      while ((m = re.exec(text))) {
        if (hits.some(function (h) { return h.key === L.key || (m.index < h.end && m.index + m[0].length > h.at); })) continue;
        hits.push({ at: m.index, end: m.index + m[0].length, key: L.key });
      }
    });
    if (!hits.length) return null;
    hits.sort(function (a, b) { return a.at - b.at; });
    var parts = [], pos = 0;
    hits.forEach(function (h) {
      if (h.at > pos) parts.push({ t: 'txt', s: text.slice(pos, h.at) });
      parts.push({ t: 'txt', s: text.slice(h.at, h.end) });
      parts.push({ t: 'in', key: h.key });
      /* 라벨 뒤의 빈자리(밑줄·넓은 공백)는 입력칸이 대신하므로 건너뛴다 */
      var rest = text.slice(h.end);
      var blank = /^(_{2,}|　{2,}|[ \t]{2,})/.exec(rest);
      pos = h.end + (blank ? blank[0].length : 0);
    });
    if (pos < text.length) parts.push({ t: 'txt', s: text.slice(pos) });
    return parts;
  }

  /* ── 서식 한 쪽을 «덩어리»로 읽는다 ── 본문 글과 표가 나온 순서 그대로 */
  function build(sectionXml) {
    var xml = String(sectionXml || '');
    var blocks = [], ti = -1, pos = 0;

    function paras(seg) {
      var re = /<hp:p\b[^>]*>([\s\S]*?)<\/hp:p>/g, m;
      while ((m = re.exec(seg))) {
        var t = (m[1].match(/<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>/g) || [])
          .map(function (x) { return x.replace(/<[^>]*>/g, ''); }).join('').trim();
        if (t) blocks.push({ kind: 'para', text: unesc(t) });
      }
    }

    for (;;) {
      var s = xml.indexOf('<hp:tbl', pos);
      if (s < 0) { paras(xml.slice(pos)); break; }
      var e = xml.indexOf('</hp:tbl>', s);
      if (e < 0) { paras(xml.slice(pos)); break; }
      e += '</hp:tbl>'.length;
      paras(xml.slice(pos, s));
      var t = xml.slice(s, e);
      ti++;
      if (t.indexOf('<hp:tbl', 7) < 0) blocks.push(table(t, ti));
      pos = e;
    }

    return { blocks: blocks, warn: {
      textBoxes: (xml.match(/<hp:drawText\b/g) || []).length,
      nested: (function () { var n = 0, p = 0; for (;;) {
        var a = xml.indexOf('<hp:tbl', p); if (a < 0) break;
        var b = xml.indexOf('</hp:tbl>', a); if (b < 0) break; b += 9;
        if (xml.slice(a, b).indexOf('<hp:tbl', 7) >= 0) n++; p = b; } return n; })()
    } };
  }

  function table(tblXml, ti) {
    var rows = [], widths = [];
    /* 표가 몇 칸짜리인지는 «표가 말해 준다». 행마다 칸 수가 다르므로(병합) 세어서는 안 된다. */
    var cc = /<hp:tbl[^>]*\bcolCnt="(\d+)"/.exec(tblXml);
    var colCnt = cc ? num(cc[1], 0) : 0;
    X.splitRows(tblXml).forEach(function (tr, ri) {
      var out = [];
      X.splitCells(tr).forEach(function (tc, ci) {
        var raw = X.cellText(tc);
        var text = unesc(raw);
        var g = cellGeom(tc, ci);
        /* 가르는 것은 «칸 지도와 같은 글자»(raw)로 — 그래야 이름표가 어긋나지 않는다 */
        var kind = MAP.classify(raw);
        /* ⚠ 열 너비는 «가로»로만 갈린다. 세로 병합된 칸도 자기 열의 너비를 안다.
           rowSpan 까지 따지면 「성 명」·「생년월일」처럼 세로로 합친 열이 너비를 못 받아
           그 열이 0 이 되고, 옆 칸들이 표 밖으로 밀려난다(대표 제보 2026-08-29). */
        if (g.colSpan === 1 && g.width && !widths[g.col]) widths[g.col] = g.width;
        out.push({
          /* ⚠ 이름표는 «자리 순서»로 짓는다 — 칸 지도(scan)와 같아야 한다 */
          slotId: kind ? ('t' + ti + 'r' + ri + 'c' + ci) : null,
          kind: kind || '', text: text,
          row: ri, col: g.col, rowSpan: g.rowSpan, colSpan: g.colSpan,
          parts: kind === '칸안라벨' ? incellParts(text) : null
        });
      });
      rows.push(out);
    });
    /* 성긴 자리를 메워 «촘촘한» 배열로 만든다 — 구멍이 있으면 <col> 이 모자라 표가 깨진다.
       한 열도 못 잰 경우(옛 서식)는 너비를 아예 안 쓰고 브라우저에 맡긴다. */
    var n = colCnt || widths.length;
    var known = [], i;
    for (i = 0; i < n; i++) if (widths[i]) known.push(widths[i]);
    var avg = known.length ? Math.round(known.reduce(function (a, b) { return a + b; }, 0) / known.length) : 0;
    var dense = [];
    for (i = 0; i < n; i++) dense.push(widths[i] || avg);
    return { kind: 'table', tbl: ti, cols: n, widths: known.length ? dense : [], rows: rows };
  }

  /* ── HTML 로 뽑기 ──
     values = { 자리이름표: '친 글자' }. 채운 자리는 kf-done 으로 갈라 보인다. */
  function toHtml(built, opts) {
    opts = opts || {};
    var vals = opts.values || {};
    var out = [];
    (built.blocks || []).forEach(function (b) {
      if (b.kind === 'para') { out.push('<p class="kf-p">' + esc(b.text) + '</p>'); return; }
      var total = b.widths.reduce(function (a, c) { return a + c; }, 0);
      /* 너비를 다 알 때만 «칸 폭 고정»으로 그린다 — 반만 알고 고정하면 표가 밖으로 밀린다 */
      out.push('<table class="kf-t' + (total ? ' kf-fixed' : '') + '">');
      if (total) {
        out.push('<colgroup>' + b.widths.map(function (w) {
          return '<col style="width:' + (Math.round(w / total * 1000) / 10) + '%">';
        }).join('') + '</colgroup>');
      }
      b.rows.forEach(function (r) {
        out.push('<tr>');
        r.forEach(function (c) {
          var at = (c.rowSpan > 1 ? ' rowspan="' + c.rowSpan + '"' : '')
                 + (c.colSpan > 1 ? ' colspan="' + c.colSpan + '"' : '');
          out.push('<td' + at + (c.slotId ? '' : ' class="kf-lock"') + '>' + cellHtml(c, vals) + '</td>');
        });
        out.push('</tr>');
      });
      out.push('</table>');
    });
    return out.join('');
  }

  function input(slotId, key, vals, ph) {
    var v = vals[slotId + (key ? ':' + key : '')];
    if (v == null) v = vals[slotId] || '';
    return '<input class="kf-in' + (v ? ' kf-done' : '') + '" data-slot="' + esc(slotId) + '"'
      + (key ? ' data-key="' + esc(key) + '"' : '')
      + ' value="' + esc(v) + '" placeholder="' + esc(ph || '') + '">';
  }

  function cellHtml(c, vals) {
    if (!c.slotId) return esc(c.text).replace(/\n/g, '<br>');
    if (c.kind === '안내글뒤') {
      /* 안내글은 «남기고» 그 뒤에 칠 자리 — 지우면 서식이 뜻하는 바가 사라진다 */
      return '<span class="kf-hint">' + esc(c.text) + '</span> ' + input(c.slotId, '', vals, '');
    }
    if (c.kind === '칸안라벨' && c.parts) {
      return c.parts.map(function (p) {
        return p.t === 'txt' ? '<span class="kf-hint">' + esc(p.s) + '</span>'
                             : input(c.slotId, p.key, vals, '');
      }).join('');
    }
    return input(c.slotId, '', vals, '');
  }

  var api = { build: build, toHtml: toHtml, incellParts: incellParts, cellGeom: cellGeom };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KcareerFormHtml = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
