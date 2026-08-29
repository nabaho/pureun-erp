'use strict';
// 푸른노무법인 경력관리 — 기관 양식(HWPX) 자동 채움 모듈
// (브라우저 window.KcareerHwpxFill / Node module.exports 겸용, DOM 미사용 — XML 문자열만 다룬다)
// 설계서: docs/superpowers/specs/2026-08-27-kcareer-양식자동채움-design.md
//
// 무엇을 하나: 표에서 「성명」「연락처」 같은 라벨 칸을 알아보고 바로 옆 빈 칸에 값을 넣는다.
// 학력·경력처럼 머리행이 있는 목록 표는 아래 빈 행에 한 줄씩 채운다.
// ⚠ 글자가 한 자라도 있는 칸은 절대 덮지 않는다. 행을 새로 만들지도 않는다(v1).
(function (root) {

  /* ===== 라벨 사전 =====
     양식마다 칸 이름이 다르다(성명/이름/신청자). 공백·괄호·별표는 떼고 본다. */
  var FIELD_LABELS = [
    { re: /^(성명|이름|신청자명?|신청인|성함|성명한글|한글성명|위촉대상자|추천인|대상자)$/, key: 'name' },
    { re: /^(한자|한자성명|성명한자)$/, key: 'nameHanja' },
    { re: /^(생년월일|생일|출생연월일|생년월일주민번호)$/, key: 'birth' },
    { re: /^성별$/, key: 'gender' },
    { re: /^(연락처|전화번호?|휴대폰|핸드폰|휴대전화|이동전화|hp)$/i, key: 'phone' },
    { re: /^(이메일|전자우편|e-?mail|메일주소)$/i, key: 'email' },
    { re: /^(주소|현주소|거주지|자택주소|주민등록주소)$/, key: 'addr' },
    { re: /^(자격증?|보유자격|자격사항|자격면허)$/, key: 'license' },
    { re: /^(소속|소속기관|근무처|현근무처|회사명|직장명?|기관명|근무기관)$/, key: 'org' },
    { re: /^(부서|부서명|소속부서)$/, key: 'dept' },
    { re: /^(직위|직책|현직위|담당직위)$/, key: 'title' },
    /* 주민등록번호는 «알아보되 채우지 않는다» — 자동으로 나가면 안 되는 정보다.
       열쇠를 rrn 으로 따로 두어, 칸 지도가 「무슨 칸인지는 알려 주고 값은 비워」 둘 수 있게 한다.
       ⚠ 여기에 값을 담는 자리(fields.rrn)를 만들지 말 것 — 담으면 언젠가 자동으로 나간다. */
    { re: /^(주민등록번호|주민번호|생년월일주민등록번호)$/, key: 'rrn' }
  ];
  /* 칸 안에 「자택:______ 직장:______」처럼 라벨과 빈자리가 함께 있는 양식이 많다.
     이런 자리는 라벨 바로 뒤(밑줄·공백)를 값으로 바꾼다. */
  var INCELL_LABELS = [
    { re: /자택/, key: 'phoneHome' }, { re: /직장|사무실/, key: 'phoneWork' },
    { re: /휴대폰|핸드폰|휴대전화/, key: 'phone' },
    { re: /기관명/, key: 'org' }, { re: /부서명/, key: 'dept' }, { re: /직위/, key: 'title' },
    { re: /한글/, key: 'name' }, { re: /한자/, key: 'nameHanja' },
    { re: /성명|이름/, key: 'name' }, { re: /생년월일/, key: 'birth' },
    { re: /이메일|E-?mail/i, key: 'email' }, { re: /주소/, key: 'addr' }
  ];
  /* 목록 표 머리행 열쇠 — 학력·경력 표의 열을 알아본다 */
  var COL_LABELS = [
    { re: /^(기간|연도|년도|재직기간|재학기간|활동기간)$/, key: 'period' },
    { re: /^(학교명?|출신학교)$/, key: 'school' },
    { re: /^(전공|학위|전공\/학위|졸업여부|전공·학위)$/, key: 'major' },
    { re: /^(기관명?|근무처|소속|발급기관|기관\/단체|위촉기관)$/, key: 'org' },
    { re: /^(직위|직책|내용|담당업무|활동내용|직책\/내용|주요활동|업무내용)$/, key: 'role' }
  ];

  function normLabel(s) {
    return String(s == null ? '' : s)
      .replace(/[\s ]+/g, '')      // 공백(성 명 → 성명)
      .replace(/[*※()（）:：]/g, '')    // 별표·괄호·콜론 장식
      .trim();
  }
  function fieldKeyOf(text) {
    var t = normLabel(text);
    if (!t || t.length > 12) return '';
    for (var i = 0; i < FIELD_LABELS.length; i++) if (FIELD_LABELS[i].re.test(t)) return FIELD_LABELS[i].key;
    return '';
  }
  function colKeyOf(text) {
    var t = normLabel(text);
    if (!t || t.length > 12) return '';
    for (var i = 0; i < COL_LABELS.length; i++) if (COL_LABELS[i].re.test(t)) return COL_LABELS[i].key;
    return '';
  }

  /* ===== XML 조각 다루기 ===== */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function cellText(tc) {
    var out = '', re = /<hp:t[^>]*>([\s\S]*?)<\/hp:t>/g, m;
    while ((m = re.exec(tc))) out += m[1];
    return out.replace(/<[^>]*>/g, '').trim();
  }
  function isEmptyCell(tc) { return cellText(tc) === ''; }

  /* 빈 칸에 값을 넣는다. 실제 한글 파일의 네 가지 빈 칸 모양을 다 받는다:
     <hp:t></hp:t> · <hp:t/> · run에 t 없음 · 문단에 run 없음.
     못 넣으면 null — 조용히 망가뜨리지 않는다. */
  function fillCell(tc, value) {
    var v = esc(value);
    if (/<hp:t[^>]*><\/hp:t>/.test(tc)) return tc.replace(/(<hp:t[^>]*>)(<\/hp:t>)/, '$1' + v + '$2');
    if (/<hp:t[^>]*\/>/.test(tc)) return tc.replace(/<hp:t([^>]*)\/>/, '<hp:t$1>' + v + '</hp:t>');
    var mRun = tc.match(/<hp:run\b[^>]*>/);
    if (mRun) return tc.replace(mRun[0], mRun[0] + '<hp:t>' + v + '</hp:t>');
    var mP = tc.match(/<hp:p\b[^>]*>/);
    if (mP) return tc.replace(mP[0], mP[0] + '<hp:run charPrIDRef="0"><hp:t>' + v + '</hp:t></hp:run>');
    return null;
  }

  /* 표를 통째로 하나씩 — ⚠ 셀 안에 표가 또 있으면(중첩) 정규식이 경계를 잘못 짚으므로 건너뛴다 */
  function eachTable(xml, fn) {
    var out = '', pos = 0;
    for (;;) {
      var s = xml.indexOf('<hp:tbl', pos);
      if (s < 0) { out += xml.slice(pos); break; }
      var e = xml.indexOf('</hp:tbl>', s);
      if (e < 0) { out += xml.slice(pos); break; }
      e += '</hp:tbl>'.length;
      var tbl = xml.slice(s, e);
      var nested = tbl.indexOf('<hp:tbl', 7) >= 0;
      out += xml.slice(pos, s) + (nested ? tbl : (fn(tbl) || tbl));
      pos = e;
    }
    return out;
  }
  function splitRows(tbl) { return tbl.match(/<hp:tr\b[\s\S]*?<\/hp:tr>/g) || []; }
  function splitCells(tr) { return tr.match(/<hp:tc\b[\s\S]*?<\/hp:tc>/g) || []; }
  /* 조각을 원문 안에서 딱 한 번만 바꾼다 — 같은 모양의 다른 칸을 건드리지 않게 */
  function replaceOnce(hay, oldStr, newStr) {
    var i = hay.indexOf(oldStr);
    return i < 0 ? hay : hay.slice(0, i) + newStr + hay.slice(i + oldStr.length);
  }

  /* ===== ①-B 칸 안 라벨: 「자택:______ 직장:______」처럼 한 칸에 라벨과 빈자리가 함께 =====
     라벨 뒤의 밑줄(___)이나 콜론 뒤 빈자리를 값으로 바꾼다.
     ⚠ 라벨 뒤에 이미 글자가 있으면 건드리지 않는다. */
  function fillInCell(tc, fields, report) {
    var txt = cellText(tc);
    if (!txt) return tc;
    var hits = [];
    INCELL_LABELS.forEach(function (L) {
      if (!L.re.test(txt)) return;
      if (fields[L.key] == null || fields[L.key] === '') return;
      if (hits.some(function (h) { return h.key === L.key; })) return;
      hits.push(L);
    });
    if (!hits.length) return tc;
    var out = tc, did = 0;
    hits.forEach(function (L) {
      /* <hp:t> 안의 글자만 바꾼다 — 태그를 건드리면 문서가 깨진다 */
      out = out.replace(/(<hp:t[^>]*>)([\s\S]*?)(<\/hp:t>)/g, function (m, a, inner, b) {
        if (did >= hits.length) return m;
        /* 라벨 + 콜론 + «값 자리»
           ⚠ 값 자리는 밑줄만이 아니다. 실측(2026-08-29) 「기관명 : 부서명 : 직위 :」에서
             끝에 붙은 「직위」가 늘 빠졌다 — 뒤에 밑줄도 넉넉한 공백도 없이 문장이 끝난다.
             사이 공백이 좁으면 셋 다 빠졌다. 그래서 «끝» 과 «바로 다음 라벨» 도 값 자리로 본다.
           ⚠ 그렇다고 아무 데나 넣으면 안 된다 — 뒤에 이미 «글자»가 오면 건드리지 않는다.
             앞을 내다보기(?=…)로만 판단하고, 실제로 바꾸는 자리는 라벨+콜론까지다.
           ⚠ L.re.source 를 (?:…) 로 감싸야 한다 — 「직장|사무실」처럼 교대가 들어 있으면
             괄호 없이는 '직장' 또는 '사무실\s*[:：]?\s*' 로 갈라져 뒤가 통째로 사라진다. */
        var ANY = INCELL_LABELS.map(function (x) { return x.re.source; }).join('|');
        var BLANK = '_{2,}|\\u3000{2,}|[ \\t]{4,}';
        /* 밑줄·넓은 공백은 «값 자리»이므로 삼켜서 값으로 바꾼다(안 삼키면
           「직장:041-556-0035_______」처럼 밑줄이 남아 줄이 넘친다).
           삼킬 것이 없으면(끝이거나 바로 다음 라벨이면) 자리만 잡고 끼워 넣는다. */
        var re = new RegExp('((?:' + L.re.source + ')\\s*[:：]\\s*)(' + BLANK + ')?'
          + '(?=$|' + BLANK + '|\\s*(?:' + ANY + ')\\s*[:：])');
        if (!re.test(inner)) return m;
        var next = inner.replace(re, function (mm, head, blank, off, whole) {
          /* 뒤에 다른 라벨이 이어지면 사이를 벌린다 — 「푸른노무법인부서명」이 되지 않게 */
          var rest = whole.slice(off + mm.length);
          /* 밑줄 자리가 있으면 «그 자리에 딱» 넣는다(서식이 정한 간격을 따른다).
             빈자리가 아예 없을 때만 한 칸 띄운다 — 안 그러면 「직위 :대표노무사」로 붙는다. */
          var pre = (blank || /\s$/.test(head)) ? '' : ' ';
          return head + pre + esc(fields[L.key]) + (rest.replace(/^[\s_　]+/, '') ? '  ' : '');
        });
        if (next === inner) return m;
        did++; report.fields.push({ key: L.key, value: fields[L.key] });
        report.usedKeys[L.key] = true;
        return a + next + b;
      });
    });
    return out;
  }

  /* ===== ① 단일 값: 라벨 칸 → 같은 행의 바로 다음 빈 칸 ===== */
  function fillFields(tbl, fields, report) {
    var rows = splitRows(tbl), newTbl = tbl;
    rows.forEach(function (tr) {
      var cells = splitCells(tr), newTr = tr;
      for (var i = 0; i < cells.length; i++) {
        /* 칸 안에 라벨과 빈자리가 함께 있는 모양(자택:___ 직장:___)을 먼저 처리한다 */
        var inFilled = fillInCell(cells[i], fields, report);
        if (inFilled !== cells[i]) { newTr = replaceOnce(newTr, cells[i], inFilled); cells[i] = inFilled; }
        if (i >= cells.length - 1) break;
        var key = fieldKeyOf(cellText(cells[i]));
        if (!key || fields[key] == null || fields[key] === '') continue;
        if (report.usedKeys[key]) continue;               // 같은 값은 한 번만(첫 등장 우선)
        if (!isEmptyCell(cells[i + 1])) { report.kept.push(key); continue; }  // 이미 값이 있으면 절대 안 덮음
        var filled = fillCell(cells[i + 1], fields[key]);
        if (!filled) continue;
        newTr = replaceOnce(newTr, cells[i + 1], filled);
        cells[i + 1] = filled;
        report.usedKeys[key] = true;
        report.fields.push({ key: key, value: fields[key] });
      }
      if (newTr !== tr) newTbl = replaceOnce(newTbl, tr, newTr);
    });
    return newTbl;
  }

  /* ===== ② 목록 표: 머리행을 알아보고 아래 빈 행에 한 줄씩 ===== */
  function detectHeader(cells) {
    var map = [], hit = 0;
    for (var i = 0; i < cells.length; i++) {
      var k = colKeyOf(cellText(cells[i]));
      map.push(k); if (k) hit++;
    }
    if (hit < 2) return null;
    var kind = map.indexOf('school') >= 0 ? 'edu'
      : (map.indexOf('org') >= 0 && (map.indexOf('role') >= 0 || map.indexOf('period') >= 0)) ? 'career' : '';
    return kind ? { kind: kind, map: map } : null;
  }
  function rowIsEmpty(cells) {
    for (var i = 0; i < cells.length; i++) if (!isEmptyCell(cells[i])) return false;
    return true;
  }
  function fillList(tbl, data, report) {
    var rows = splitRows(tbl);
    var head = null, headIdx = -1;
    for (var r = 0; r < rows.length; r++) {
      head = detectHeader(splitCells(rows[r]));
      if (head) { headIdx = r; break; }
    }
    if (!head) return tbl;
    var items = data[head.kind] || [];
    if (!items.length) return tbl;
    var newTbl = tbl, put = 0;
    for (var q = headIdx + 1; q < rows.length && put < items.length; q++) {
      var cells = splitCells(rows[q]);
      if (!rowIsEmpty(cells)) continue;                    // 이미 쓴 행은 건너뛴다
      var item = items[put], newTr = rows[q], ok = false;
      for (var c = 0; c < cells.length && c < head.map.length; c++) {
        var k = head.map[c];
        if (!k || item[k] == null || item[k] === '') continue;
        var filled = fillCell(cells[c], item[k]);
        if (!filled) continue;
        newTr = replaceOnce(newTr, cells[c], filled);
        cells[c] = filled; ok = true;
      }
      if (ok) { newTbl = replaceOnce(newTbl, rows[q], newTr); put++; }
    }
    report.lists.push({ kind: head.kind, put: put, total: items.length });
    return newTbl;
  }

  /* ===== 입구 =====
     data = { fields:{name,birth,gender,phone,email,addr,license,org},
              edu:[{period,school,major}], career:[{period,org,role}] } */
  function autoFill(sectionXml, data) {
    data = data || {};
    var report = { fields: [], lists: [], kept: [], usedKeys: {} };
    var xml = eachTable(sectionXml, function (tbl) {
      var t = fillFields(tbl, data.fields || {}, report);
      t = fillList(t, data, report);
      return t;
    });
    delete report.usedKeys;
    return { xml: xml, report: report, changed: xml !== sectionXml };
  }

  /* 사람이 읽을 한 줄 요약 — 「인적 4칸 · 학력 2줄 · 경력 8/12줄(칸 부족)」 */
  function summarize(report) {
    var parts = [];
    if (report.fields.length) parts.push('인적 ' + report.fields.length + '칸');
    (report.lists || []).forEach(function (l) {
      var name = l.kind === 'edu' ? '학력' : '경력';
      parts.push(name + ' ' + (l.put < l.total ? (l.put + '/' + l.total + '줄(칸 부족)') : (l.put + '줄')));
    });
    return parts.length ? parts.join(' · ') : '알아본 칸이 없습니다';
  }

  var api = {
    autoFill: autoFill, summarize: summarize,
    fieldKeyOf: fieldKeyOf, colKeyOf: colKeyOf,
    cellText: cellText, isEmptyCell: isEmptyCell, fillCell: fillCell,
    /* 칸 지도(kcareer-formmap.js)가 «같은 자»를 쓰도록 내보낸다 —
       따로 만들면 두 곳의 셈이 어긋나 「지도에는 있는데 안 채워지는 칸」이 생긴다 */
    splitRows: splitRows, splitCells: splitCells, eachTable: eachTable, normLabel: normLabel,
    /* 「자택:____ 직장:____」 같은 칸 안 라벨 목록 — 입력판(kcareer-formhtml.js)이 같은 자를 쓴다.
       사전을 두 곳에 두면 한쪽만 늘어나 「화면엔 칸이 있는데 안 채워지는」 자리가 생긴다. */
    incellLabels: function () { return INCELL_LABELS.slice(); }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KcareerHwpxFill = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
