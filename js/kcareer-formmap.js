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
     ''       : 그냥 본문 → 자리가 아니다. 절대 덮지 않는다.
     ⚠ 여기서 «글자칸»을 돌려주지 말 것 — 라벨 칸(「성 명」)까지 채울 자리가 되어
       입력판(kcareer-formhtml.js)이 라벨 위에 입력칸을 얹는다(실측: 검사 6개가 깨졌다).
       글자칸 판정은 «왼쪽 칸까지 볼 수 있는» scan 에서 한다. */
  /* 자리표인가 — 판독 층의 «같은 자»를 쓴다.
     ⚠ 여기서 새로 쓰면 두 길이 서로 다른 것을 자리표로 보게 되어
       「저기선 채워지는데 여기선 안 채워진다」가 된다. */
  function 자리표(s) {
    return !!(X && typeof X.isPlaceholder === 'function' && X.isPlaceholder(s));
  }
  /* 칸에 값을 넣는다.
     ⚠ 빈 칸이면 «끼워» 넣고, 자리표가 박혀 있으면 «통째로 바꾼다».
       자리표에 끼워 넣으면 「권형하[한글]」처럼 앞에 덧붙는다(실측 2026-09-06). */
  function putValue(tc, v) {
    var 있던 = X.cellText(tc);
    return 있던 ? X.setCellText(tc, v) : X.fillCell(tc, v);
  }
  function classify(text) {
    var s = String(text == null ? '' : text).trim();
    if (s === '') return '빈칸';
    /* ⚠★ 「(한글)」「(한자)」「(인)」이 «먼저»다 — 이것들은 지우지 않고 뒤에 이어 쓰는
       자리이고, 그 규칙이 이 모듈의 오래된 약속이다. 아래 자리표 판정이 이것들을
       먼저 삼키면 안내글이 지워진다(실측 2026-09-06: 검사 다섯이 한꺼번에 깨졌다). */
    if (/^[（(][^)）]{1,6}[)）]$/.test(s)) return '안내글뒤';
    if (/_{2,}/.test(s) || /[:：]\s*$/.test(s) || /[:：]\s{2,}/.test(s)) return '칸안라벨';
    /* ★★ 「[한글] [한자] [영문]」·「[자택](  )  -[직장](  )  -」처럼 «싼 라벨이 둘 이상»이면
       한 칸에 여러 값을 적는 자리다(대표 제보 2026-09-07 — 여태 한 글자도 안 채워졌다).
       ⚠ «둘 이상»일 때만이다. 하나뿐인 「[한글]」은 위 자리표 판정이 «빈칸»으로 잡고,
         「(한자)」는 그 위 안내글뒤가 잡는다 — 그 두 약속을 건드리면 검사 다섯이 깨진다. */
    if ((s.match(/[\[\uFF3B\u3010][^\]\uFF3D\u3011]{1,8}[\]\uFF3D\u3011]/g) || []).length >= 2)
      return '칸안라벨';
    /* ★ [한글]·1900.00.00·년 월 ~ 년 월 은 «빈 칸 표시»다 — 값이 아니다.
       전에는 「글자가 있다」고 보아 자동으로 안 채웠고, 그래서 이력서 2쪽이
       통째로 비어 나갔다(대표 제보 2026-09-06 「이부분은 왜 안채워지나」).
       ⚠ 위 둘에 안 걸린 것만 본다 — 차례를 바꾸지 말 것. */
    if (자리표(s)) return '빈칸';
    return '';
  }

  /* ── 목록 표 알아보기 ──
     머리행에서 목록 열쇠가 «둘 이상» 맞으면 목록 표다.
     하나만 맞으면 보통 표로 둔다 — 「기간 | 비고」 같은 표를 삼키면 안 된다.
     ⚠ 목록 표를 낱개 칸으로 두면 학력·경력 표 하나가 칸 지도 아홉 줄이 되어 못 쓴다. */
  /* 「채울 수 있는 줄」 — 아예 빈 줄과, 자리표·급 이름만 박힌 줄.
     ⚠ 이력서 학력·경력 표는 「년  월 ~  년  월」이 미리 박혀 있고, 학력은
       「고등학교」처럼 급이 박혀 있다. 그것을 값으로 보면 채울 줄이 0 이 된다
       (실측 2026-09-05: 학력·경력이 한 줄도 안 들어갔다). */
  /* ⚠ 목록 줄 판정은 X.isRowBlank «하나»를 쓴다 — 여기에 자를 새로 만들지 말 것.
     낱개 칸의 「-」(해당없음)와 목록 줄의 「-」(빈 자리)는 뜻이 다르고,
     그 갈림을 X.isRowBlank 가 들고 있다(kcareer-hwpxfill.js 주석 참고). */
  function 채울수있나(cells) {
    return cells.every(function (t) {
      var v = String(t || '').trim();
      var 빔 = X.isRowBlank ? X.isRowBlank(v) : (!v || 자리표(v));
      return 빔 || (X.levelOf && X.levelOf(v));
    });
  }

  /* 한 표 안의 목록 구역을 «모두» 찾는다.
     ⚠★ 표 하나에 목록이 여럿 있다 — 대표 이력서 2쪽은 인적사항·학력·자격·경력이
       «한 표»다. 예전에는 머리줄을 하나만 찾고 그 표를 통째로 목록으로 보아
       낱개 칸을 전부 버렸다(실측 2026-09-06: 채울 자리 0개). */
  function detectLists(grid, ti) {
    var out = [], r = 0, seq = 0;
    while (r < grid.length) {
      var L = detectListAt(grid, ti, r, seq);
      if (!L) break;
      out.push(L);
      seq++;
      r = L.end;                       /* 이 구역 다음부터 다시 본다 */
    }
    return out;
  }
  function detectList(grid, ti) { return detectLists(grid, ti)[0] || null; }

  function detectListAt(grid, ti, from, seq) {
    for (var r = from; r < grid.length; r++) {
      /* ⚠★ 머리행에는 «빈 칸이 없다» — 열 이름이 죽 적혀 있는 줄이기 때문이다.
         이 빗장이 없으면 「소속기관 | (빈칸) | 직위 | (빈칸)」 같은 «보통 라벨 표»가
         경력 목록으로 오인되어 그 표의 빈 칸을 통째로 놓친다
         (실측 2026-09-05: 사전에 「소속기관」을 더했더니 채울 자리 4개가 0개가 됐다).
         ⚠ 같은 빗장이 kcareer-hwpxfill.js 의 detectHeader 에도 있다 — 한쪽만 풀면 둘이 어긋난다. */
      if (grid[r].some(function (t) { return !String(t || '').trim(); })) continue;
      var keys = grid[r].map(function (t) { return X.colKeyOf(t); });
      var hit = keys.filter(Boolean).length;
      if (hit < 2) continue;
      var kind = keys.indexOf('school') >= 0 ? 'edu'
        : (keys.indexOf('org') >= 0 && (keys.indexOf('role') >= 0 || keys.indexOf('period') >= 0)) ? 'career' : '';
      if (!kind) continue;
      /* ★★ 구역은 머리줄 + «이어지는 채울 수 있는 줄»까지다 — 표 끝까지가 아니다.
         표 끝까지 세면 학력 4줄이 「빈 10줄」이 되고(대표 화면 실측 2026-09-06),
         그 아래 자격·상벌 칸까지 목록으로 삼켜 사람이 손으로도 못 친다. */
      var q = r + 1;
      while (q < grid.length && 채울수있나(grid[q])) q++;
      return { id: 'L' + ti + (seq ? '_' + seq : ''), tbl: ti, kind: kind,
               cols: keys, head: r, end: q, blank: q - r - 1 };
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
      /* 원문 칸도 들고 있는다 — 「진짜 열 번호」를 읽으려면 글자만으로는 안 된다 */
      var rawRows = rows.map(function (tr) { return X.splitCells(tr); });
      var grid = rawRows.map(function (cs) { return cs.map(X.cellText); });
      /* ★★ 목록 구역에 «든 줄만» 낱개에서 뺀다 (대표 제보 2026-09-06).
         예전에는 목록이 하나라도 있으면 표를 통째로 건너뛰어, 인적사항과 학력이
         «한 표»인 서식에서 성명·생년월일·주소가 아예 안 잡혔다. */
      var Ls = detectLists(grid, ti);
      var 목록줄 = {};
      Ls.forEach(function (L) {
        lists.push(L);
        for (var q = L.head; q < L.end; q++) 목록줄[q] = true;
      });
      grid.forEach(function (cells, ri) {
        if (목록줄[ri]) return;   /* 이 줄은 목록이 채운다 */
        cells.forEach(function (txt, ci) {
          var kind = classify(txt);
          var 왼 = ci > 0 ? String(cells[ci - 1] || '').trim() : '';
          /* ★★ 라벨이 «위»에 있는 서식 (대표 지시 2026-09-06 「라벨위 찾기」)
             ■ 왜
               지금까지 값 칸의 «바로 왼쪽»만 보고 무슨 칸인지 판단했다. 그래서
                   성명 | 생년월일 | 연락처 | 이메일     ← 라벨 줄
                     · |    ·     |   ·    |   ·        ← 값 줄
               같은 «머리행형» 서식은 «한 칸도» 못 알아봤다(실측 2026-09-06: 8칸 중 0칸).
               기관 양식에 흔한 모양이고, 사전을 아무리 넓혀도 안 고쳐지는 «구조» 문제였다.
             ⚠ 왼쪽에서 못 찾았을 때만 위를 본다 — 왼쪽이 먼저다.
               둘 다 있으면 「성명 | (값) 」 처럼 왼쪽이 그 칸을 가리키는 것이 보통이다.
             ⚠ 윗칸이 «사전이 아는 라벨»일 때만 인정한다. 아무 글자나 받으면
               윗줄의 «값»을 라벨로 착각해 엉뚱한 값이 박힌다.
             ⚠ 바로 윗줄만 본다. 두세 줄 위까지 올라가면 목록 표의 머리줄이
               그 아래 모든 줄의 라벨이 되어 같은 값이 줄줄이 박힌다. */
          var 위 = '';
          if (!X.fieldKeyOf(왼) && ri > 0 && grid[ri - 1]) {
            /* ★★ «같은 열»의 윗칸이어야 한다 (대표 제보 2026-09-07).
               칸 «순서»로 위를 보면 세로 합친 칸 때문에 남의 열이 라벨이 된다.
               실측: 「전 화」 줄(칸 여섯) 아래의 «한 칸짜리 간격 줄»이 그 순서로는
               전화 칸으로 잡혀, 빈 줄에 휴대폰 번호가 박혔다.
               ⚠ 열 번호를 모르는 서식에서는 지금까지처럼 칸 순서로 본다(뒷걸음질 금지). */
            var u = '', myCol = (typeof X.colAddrOf === 'function' && rawRows[ri])
              ? X.colAddrOf(rawRows[ri][ci]) : -1;
            if (myCol >= 0 && rawRows[ri - 1]) {
              for (var uj = 0; uj < rawRows[ri - 1].length; uj++) {
                if (X.colAddrOf(rawRows[ri - 1][uj]) === myCol) {
                  u = String(grid[ri - 1][uj] || '').trim(); break;
                }
              }
            } else {
              u = String(grid[ri - 1][ci] || '').trim();
            }
            /* ★ 세로로 합친 «구역 이름» — 「자격및면허」처럼 여러 줄을 덮는 앞 칸이다.
               그 칸은 «내 줄에 없다»(합쳐져 있으니). 그래서 같은 열로는 못 찾는다.
               ⚠ «내 줄의 첫 칸»에만, 그리고 «내 줄이 갖지 않은 더 앞선 열»일 때만 본다.
                 이 두 빗장이 없으면 「전 화」 줄 아래의 간격 줄까지 전화 칸이 된다
                 (실측 2026-09-07: 빈 줄에 휴대폰 번호가 박혔다). */
            if (!X.fieldKeyOf(u) && ci === 0 && myCol >= 0 && rawRows[ri - 1]) {
              var 내열 = {};
              for (var mj = 0; mj < rawRows[ri].length; mj++) 내열[X.colAddrOf(rawRows[ri][mj])] = true;
              for (var vj = 0; vj < rawRows[ri - 1].length; vj++) {
                var vc = X.colAddrOf(rawRows[ri - 1][vj]);
                if (vc < 0 || vc >= myCol || 내열[vc]) continue;
                var vt = String(grid[ri - 1][vj] || '').trim();
                if (X.fieldKeyOf(vt)) { u = vt; break; }
              }
            }
            if (X.fieldKeyOf(u)) 위 = u;
          }
          /* ★★ 이미 글자가 든 «값 칸»도 자리로 잡는다 (대표 지시 2026-09-05
             「왜 화면에서 바로 수정이 안 되나」).
             ■ 예전에는 글자가 있으면 아예 자리로 세지 않았다. 그래서 「내 정보로 채우기」가
               한 번 값을 넣고 나면 그 칸은 화면에서 고칠 길이 없었다
               (실측: 대표 화면에 노란 칸이 「(한자)」·「자택:」 두 곳만 남았다).
             ⚠ «왼쪽이 라벨인 칸»만 잡는다 — 라벨 칸이나 안내문까지 잡으면
               입력판이 서식 문구 위에 입력칸을 얹는다.
             ⚠ 자동 채우기는 글자칸을 건드리지 않는다(guess 가 늘 빈 열쇠를 준다).
               사람이 눌러 고쳐 쳤을 때만 바뀐다. */
          /* ⚠ 그 칸 «자신»이 라벨이면 고칠 자리가 아니다 — 서식 문구를 덮으면 안 된다.
             머리행형에서는 라벨끼리 옆에 붙어 있어(성명|생년월일) 이 빗장이 없으면
             라벨 줄이 통째로 «고칠 수 있는 칸»이 된다. */
          if (!kind && String(txt || '').trim() && !X.fieldKeyOf(txt) && (X.fieldKeyOf(왼) || 위)) {
            kind = '글자칸';
          }
          if (!kind) return;
          slots.push({ id: 't' + ti + 'r' + ri + 'c' + ci, tbl: ti, row: ri, col: ci,
                       /* 표에 적힌 «진짜 열 번호» — 숫자 칸 판정이 이것을 본다 */
                       colAddr: (typeof X.colAddrOf === 'function'
                                 ? X.colAddrOf(rawRows[ri] && rawRows[ri][ci]) : -1),
                       kind: kind, text: String(txt || '').trim(),
                       left: 왼, up: 위, guess: '' });
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
    if (/^한글$/.test(t)) {
      /* 왼쪽이든 위든 «성명»이 가리키는 자리여야 이름이다 */
      return (X.fieldKeyOf(slot.left) === 'name' || X.fieldKeyOf(slot.up) === 'name') ? 'name' : '';
    }
    if (/^(인|서명|서명또는인|印)$/.test(t)) return '__stamp';
    return X.fieldKeyOf(slot.text);
  }

  /* ── 짝 맞추기 ──
     모르면 «모른다»고 남긴다. 지어내면 엉뚱한 자리에 값이 박히고,
     그건 안 채운 것보다 나쁘다 — 잘못 낸 서류는 되돌릴 수 없다.
     rrn(주민등록번호)은 알아보되 채우지 않는다. hint 로만 알린다. */
  function guess(map, data) {
    map.slots.forEach(function (s) {
      /* ★ 글자칸은 «자동으로는 절대» 안 채운다 — 사람이 눌러 고칠 때만 바뀐다.
         여기서 열쇠를 주면 기관이 적어 둔 안내문까지 덮어쓴다. */
      if (s.kind === '글자칸') { s.guess = ''; return; }
      /* ★ 자리표가 스스로 이름을 말하면 그것이 가장 확실하다 — [한자]·[영문]·(자택)( ) -
         왼쪽 칸만 보면 「[한자]의 왼쪽은 [한글]」이라 아무것도 못 알아본다
         (실측 2026-09-06: 성명 행에서 한자·영문이 통째로 빠졌다). */
      var 스스로 = (s.kind === '빈칸' && X.placeholderKey) ? X.placeholderKey(s.text) : '';
      var k = 스스로 ? 스스로
            : s.kind === '안내글뒤' ? hintKey(s)
            : s.kind === '칸안라벨' ? '__incell'
            : (X.fieldKeyOf(s.left) || X.fieldKeyOf(s.up));
      if (k === 'rrn') { s.guess = ''; s.hint = 'rrn'; return; }
      s.guess = k || '';
    });
    map.lists.forEach(function (l) { l.guess = l.kind; });
    return map;
  }

  /* 표·행·열로 칸 하나를 찾아 바꾼다 */
  /* 표에서 n번째 «줄»을 바꾼다 — 줄도 빈 것끼리는 XML 이 똑같다.
     ⚠ t.replace(rows[row], …) 로 바꾸면 앞의 같은 모양 줄이 바뀐다. */
  function replaceRowOnce(tbl, rows, idx, newRow) {
    var re = /<hp:tr\b[\s\S]*?<\/hp:tr>/g, m, n = 0;
    while ((m = re.exec(tbl))) {
      if (n === idx) return tbl.slice(0, m.index) + newRow + tbl.slice(m.index + m[0].length);
      n++;
    }
    return tbl;
  }
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
      /* ⚠ 칸을 «글자로» 찾아 바꾸면 안 된다 — 빈 칸끼리는 XML 이 글자 하나까지
         똑같아서 「3번째 칸」에 넣으라고 해도 맨 앞의 빈 칸이 바뀐다.
         실측 2026-09-06: 주소·전화가 세로 병합 라벨 자리(0번 칸)에 들어갔다.
         판독 층의 replaceCellAt 이 «자리»를 세어 바꾼다 — 그것만 쓴다. */
      var newRow = (X.replaceCellAt ? X.replaceCellAt(rows[row], col, next)
                                    : rows[row].replace(cells[col], next));
      return replaceRowOnce(t, rows, row, newRow);
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
    var m = tc.match(/(<hp:t(?:\s[^>]*)?>)([\s\S]*?)(<\/hp:t>)/);
    if (!m) return null;
    return tc.replace(m[0], m[1] + m[2] + ' ' + esc(value) + m[3]);
  }

  /* ── 한 글자씩 쪼개진 칸 ──
     「생 년 월 일 | 7 | 5 | 0 | 1 | 0 | 7」처럼 날짜를 «한 자리씩» 나눠 적는 서식이 흔하다
     (대표 서식 실물 2026-08-29). 한 칸에 통째로 넣으면 첫 칸만 차고 나머지가 빈 채로 나간다.
     라벨 뒤로 «빈 칸이 여럿 이어지면» 그 줄을 한 벌로 본다. */
  function digitRun(map, tbl, row, col) {
    var run = [];
    for (var c = col; ; c++) {
      var s = map.slots.filter(function (x) {
        return x.tbl === tbl && x.row === row && x.col === c && x.kind === '빈칸';
      })[0];
      if (!s) break;
      run.push(s);
    }
    if (run.length < 4) return null;       /* 넷 미만은 그냥 옆 칸이다(날짜가 아니다) */
    /* ★★ 칸이 «붙어» 있어야 숫자 칸이다 (대표 제보 2026-09-07).
       자격 및 면허 표의 「종 류|취득년월일|상벌사항|상벌기관」은 빈 칸 넷이 이어지지만
       열 번호가 1·5·10·15 로 «떨어져» 있다 — 숫자 칸이 아니라 그냥 넓은 칸이다.
       그것을 숫자 칸으로 보아 자격번호가 「3|0|1|6」으로 흩어져 들어갔다.
       ⚠ 열 번호를 모르는 서식에서는 이 잣대를 쓰지 않는다(옛 서식이 뒷걸음질하지 않게). */
    for (var i = 1; i < run.length; i++) {
      var a = run[i - 1].colAddr, b = run[i].colAddr;
      if (a == null || b == null || a < 0 || b < 0) break;   /* 모르면 옛길로 */
      if (b !== a + 1) return null;
    }
    return run;
  }

  /* 값에서 숫자만 뽑아 칸 수에 맞춘다. 안 맞으면 «넣지 않는다» —
     어긋나게 적는 것이 비워 두는 것보다 나쁘다. */
  function digitsFor(value, n) {
    /* ★★ «숫자로만 된 값»일 때만 나눈다 (대표 제보 2026-09-07).
       「공인노무사 제3016호」에서 숫자만 뽑으면 3016 — 마침 네 칸이라 3|0|1|6 으로 흩어졌다.
       ⚠ 숫자 사이의 마침표·붙임표·빗금·빈칸은 «구분 기호»이므로 괜찮다(1975.01.07). */
    var s = String(value == null ? '' : value).trim();
    if (!/^[0-9][0-9.\-\/\s]*$/.test(s)) return '';
    var d = s.replace(/\D/g, '');
    if (!d) return '';
    if (d.length === n) return d;
    /* 1975.01.07(8자리) → 여섯 칸이면 앞 두 자리(19)를 뗀다 */
    if (d.length === 8 && n === 6) return d.slice(2);
    if (d.length === 6 && n === 8) return '';   /* 세기를 지어내지 않는다 */
    return '';
  }

  /* 이 자리에 «직접 친 글자»가 있나— 없으면 null(고른 열쇠로 간다), 있으면 {단일} 또는 {라벨별} */
  function typedFor(id, values) {
    if (Object.prototype.hasOwnProperty.call(values, id)) return { one: String(values[id] == null ? '' : values[id]) };
    var byKey = null;
    Object.keys(values).forEach(function (k) {
      var p = String(k).split(':');
      if (p[0] !== id || p.length < 2) return;
      byKey = byKey || {};
      byKey[p[1]] = String(values[k] == null ? '' : values[k]);
    });
    return byKey ? { parts: byKey } : null;
  }

  /* 직접 친 글자를 칸에 넣는다. 빈 글자면 «비워 둔다»(지우개로도 쓴다). */
  function putTyped(xml, s, typed) {
    if (typed.parts) {
      /* 칸 안 라벨 — 라벨마다 따로 넣는다. 기존 채움 일꾼에 «그 값만» 담아 부른다 */
      var any = Object.keys(typed.parts).some(function (k) { return typed.parts[k] !== ''; });
      if (!any) return { ok: false, empty: true };
      var r = eachCellAt(xml, s.tbl, s.row, s.col, function (tc) {
        var one = X.autoFill('<hp:tbl><hp:tr>' + tc + '</hp:tr></hp:tbl>', { fields: typed.parts });
        if (!one.changed) return null;
        var m = one.xml.match(/<hp:tc\b[\s\S]*<\/hp:tc>/);
        return m ? m[0] : null;
      });
      return { ok: r.ok, xml: r.xml, shown: Object.keys(typed.parts).join('·') };
    }
    var v = typed.one;
    /* ⚠ 글자칸은 «빈 글자»도 뜻이 있다 — 사람이 지운 것이다. 그대로 지워 준다.
       다른 자리에서 빈 글자는 「비워 두기」라 손대지 않는다. */
    if (v === '' && s.kind !== '글자칸') return { ok: false, empty: true };
    var r2 = eachCellAt(xml, s.tbl, s.row, s.col, function (tc) {
      if (s.kind === '글자칸') return X.setCellText(tc, v);   /* 있던 글자를 바꾼다 */
      return s.kind === '안내글뒤' ? appendAfter(tc, v) : X.fillCell(tc, v);
    });
    return { ok: r2.ok, xml: r2.xml, shown: v };
  }

  /* ── 되돌려 넣기 ──
     화면이 만든 plan 만 보고 넣는다. 화면은 XML 을 모르고, 여기는 화면을 모른다.
     plan = { picks:{자리이름표: 열쇠}, lists:{목록이름표: 갈래}, data:{fields,edu,career} }
     열쇠가 '' 면 «비워 둔다». '__stamp' 는 도장 자리라 글자를 안 넣는다. */
  function apply(sectionXml, plan) {
    plan = plan || {};
    var picks = plan.picks || {}, data = plan.data || {}, fields = data.fields || {};
    /* 입력판에서 «직접 친 글자». 자리 이름표(t0r0c1) 또는 라벨까지 붙인 이름표(t0r0c1:phoneHome).
       ⚠ 고른 열쇠보다 «앞선다» — 사람이 고쳐 쓴 것이 최종이다. */
    var values = plan.values || {};
    var xml = String(sectionXml || ''), filled = [], failed = [];
    var map = scan(xml);

    /* 직접 친 자리도 채울 목록에 넣는다(고르지 않았어도) */
    var todo = {};
    Object.keys(picks).forEach(function (id) { todo[id] = true; });
    Object.keys(values).forEach(function (k) { todo[String(k).split(':')[0]] = true; });

    Object.keys(todo).forEach(function (id) {
      var key = picks[id];
      var typed = typedFor(id, values);
      if (typed !== null) {
        var s0 = map.slots.filter(function (x) { return x.id === id; })[0];
        if (!s0) { failed.push({ id: id, why: '그런 자리가 없습니다' }); return; }
        var r0 = putTyped(xml, s0, typed);
        if (r0.ok) { xml = r0.xml; filled.push({ id: id, key: '(직접)', value: r0.shown }); }
        else if (r0.empty) { /* 비워 두기로 한 자리 — 실패가 아니다 */ }
        else failed.push({ id: id, why: '이 칸에는 넣을 수 없습니다' });
        return;
      }
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
      /* ★ 가려 둔 값(주민등록번호)은 fields 가 아니라 secrets 에 있다 —
         자동 채우기(autoFill)는 secrets 를 아예 못 보므로 «저절로는 절대 안 나가고»,
         사람이 이 자리에 그 열쇠를 «직접 고른» 지금만 꺼내 온다.
         ⚠ secrets 를 fields 에 합치지 말 것. 합치는 순간 자동으로 나간다. */
      if ((val == null || val === '') && plan.secrets) val = plan.secrets[key];
      if (val == null || val === '') { failed.push({ id: id, why: '넣을 값이 없습니다' }); return; }
      /* 라벨 뒤로 빈 칸이 여럿 이어지면 한 글자씩 나눠 넣는다(생년월일 7|5|0|1|0|7) */
      var run = (s.kind === '빈칸') ? digitRun(map, s.tbl, s.row, s.col) : null;
      var ds = run ? digitsFor(val, run.length) : '';
      if (run && ds) {
        var okN = 0;
        run.forEach(function (cell, i) {
          var rr = eachCellAt(xml, cell.tbl, cell.row, cell.col, function (tc) { return putValue(tc, ds[i]); });
          if (rr.ok) { xml = rr.xml; okN++; }
        });
        if (okN) { filled.push({ id: id, key: key, value: ds }); return; }
      }
      r = eachCellAt(xml, s.tbl, s.row, s.col, function (tc) {
        return s.kind === '안내글뒤' ? appendAfter(tc, val) : putValue(tc, val);
      });
      if (r.ok) { xml = r.xml; filled.push({ id: id, key: key, value: val }); }
      else failed.push({ id: id, why: '이 칸에는 넣을 수 없습니다' });
    });

    /* 목록 표는 기존 fillList(autoFill 안)가 이미 잘 한다 — 다시 만들지 않는다 */
    var wantLists = plan.lists || {};
    /* ⚠ colMap(AI 짝짓기)이 있으면 «목록 표가 없다고 적혀 있어도» 시도한다.
       칸 지도는 AI에게 묻기 «전»에 훑으므로, 사전이 못 알아본 표는 lists 가 비어 있다.
       그대로 두면 AI에게 물어 놓고도 채우기가 시작조차 안 된다(실측 2026-08-30). */
    if (Object.keys(wantLists).length || plan.colMap) {
      var before = xml;
      /* colMap: AI에게 물어 얻은 «열 짝짓기». 사전이 못 알아본 서식을 위해 흘려보낸다.
         ⚠ 없으면 사전으로 간다 — AI가 없어도 앱은 그대로 돌아야 한다. */
      var r2 = X.autoFill(xml, { fields: {}, edu: data.edu || [], career: data.career || [] },
                          { colMap: plan.colMap });
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

  var api = { scan: scan, classify: classify, detectList: detectList, detectLists: detectLists,
              guess: guess, hintKey: hintKey, apply: apply, fingerprint: fingerprint,
              digitRun: digitRun, digitsFor: digitsFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KcareerFormMap = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
