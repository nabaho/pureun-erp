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
    /* ⚠ 사람 이름이 들어갈 칸은 양식마다 부르는 말이 다르다 — 위원·강사·심사위원…
       못 알아보면 «이름부터» 비어 나가므로 여기가 가장 값이 크다. */
    { re: /^(성명|이름|신청자명?|신청인|성함|성명한글|한글성명|위촉대상자|추천인|대상자|위원명|강사명|자문위원|심사위원|평가위원|응시자|지원자|참여자|작성자|피추천인|본인성명|대표자명?)$/, key: 'name' },
    { re: /^(한자|한자성명|성명한자|한문성명|성명한문)$/, key: 'nameHanja' },
    { re: /^(영문|영문성명|영문이름|성명영문|영문명|성명영문여권상|영문성명여권상)$/, key: 'nameEng' },
    { re: /^(생년월일|생일|출생연월일|생년월일주민번호|출생일|생년월일만나이|생년월일연령|생년월일나이)$/, key: 'birth' },
    { re: /^(성별|성별구분)$/, key: 'gender' },
    { re: /^(연락처|전화번호?|휴대폰|핸드폰|휴대전화|이동전화|hp|연락처1|휴대전화번호|핸드폰번호|이동전화번호|개인연락처|본인연락처|연락처휴대폰|휴대폰번호)$/i, key: 'phone' },
    /* 번호를 갈라 담게 되면서(2026-08-30) 라벨도 갈라 본다 —
       전에는 번호 칸이 하나뿐이라 「자택」·「사무실」이 칸 안 라벨로만 있었다. */
    { re: /^(자택전화|자택전화번호|집전화)$/, key: 'phoneHome' },
    { re: /^(사무실전화|직장전화|회사전화|사무실전화번호|근무처전화|사무실번호|직장연락처|근무처연락처|사무소전화|회사연락처)$/, key: 'phoneWork' },
    { re: /^(팩스|팩스번호|fax)$/i, key: 'fax' },
    { re: /^(이메일|전자우편|e-?mail|메일주소|이메일주소|전자메일|e메일|메일)$/i, key: 'email' },
    { re: /^(주소|현주소|거주지|자택주소|주민등록주소|자택주소지|주소지|현거주지|우편물수령지|우편물수령주소|서류수령주소|송달주소)$/, key: 'addr' },
    { re: /^(회사주소|사무실주소|직장주소|근무지주소|근무처주소|사무소주소|근무처소재지|사업장주소|사무실소재지)$/, key: 'addrWork' },
    /* ⚠ 「자격증명」은 넣지 말 것 — 자격증 «목록 표»의 머리칸 이름이다.
       넣으면 그 머리칸 옆(첫 줄 첫 칸)에 자격 한 줄이 박혀 남의 표를 어지럽힌다. */
    { re: /^(자격증?|보유자격|자격사항|자격면허|자격\/면허|자격·면허|보유자격증|전문자격|자격종류|자격및면허)$/, key: 'license' },
    { re: /^(소속|소속기관|근무처|현근무처|회사명|직장명?|기관명|근무기관|소속기관명|소속단체|소속회사|소속법인|사업장명|현소속|기관단체명|근무처명|사무소명|소속처)$/, key: 'org' },
    { re: /^(부서|부서명|소속부서|소속팀|팀명|담당부서)$/, key: 'dept' },
    { re: /^(직위|직책|현직위|담당직위|직급|현직|담당직책|직위직급|직위\/직급|현재직위)$/, key: 'title' },
    /* 주민등록번호는 «알아보되 채우지 않는다» — 자동으로 나가면 안 되는 정보다.
       열쇠를 rrn 으로 따로 두어, 칸 지도가 「무슨 칸인지는 알려 주고 값은 비워」 둘 수 있게 한다.
       ⚠ 여기에 값을 담는 자리(fields.rrn)를 만들지 말 것 — 담으면 언젠가 자동으로 나간다. */
    { re: /^(주민등록번호|주민번호|생년월일주민등록번호)$/, key: 'rrn' }
  ];
  /* 칸 안에 「자택:______ 직장:______」처럼 라벨과 빈자리가 함께 있는 양식이 많다.
     이런 자리는 라벨 바로 뒤(밑줄·공백)를 값으로 바꾼다. */
  var INCELL_LABELS = [
    { re: /자택/, key: 'phoneHome' }, { re: /직장|사무실/, key: 'phoneWork' },
    { re: /휴대폰|핸드폰|휴대전화/, key: 'phone' }, { re: /팩스|FAX/i, key: 'fax' },
    { re: /영문/, key: 'nameEng' },
    { re: /기관명/, key: 'org' }, { re: /부서명/, key: 'dept' }, { re: /직위/, key: 'title' },
    /* ⚠ 짧은 말은 «긴 말 뒤»에 둔다 — 같은 열쇠는 먼저 걸린 것만 쓰므로,
       「부서명 :」이 있는 칸에서 짧은 「부서」가 먼저 걸리면 라벨 뒤를 못 찾는다. */
    { re: /소속/, key: 'org' }, { re: /부서/, key: 'dept' }, { re: /직급/, key: 'title' },
    { re: /연락처/, key: 'phone' }, { re: /자격/, key: 'license' },
    { re: /한글/, key: 'name' }, { re: /한자/, key: 'nameHanja' },
    { re: /성명|이름/, key: 'name' }, { re: /생년월일/, key: 'birth' },
    { re: /이메일|E-?mail/i, key: 'email' }, { re: /주소/, key: 'addr' }
  ];
  /* 목록 표 머리행 열쇠 — 학력·경력 표의 열을 알아본다 */
  var COL_LABELS = [
    { re: /^(기간|연도|년도|재직기간|재학기간|활동기간|기간근무년수|근무기간|수행기간|위촉기간|참여기간|교육기간|근무연월|활동연도|기간년월)$/, key: 'period' },
    { re: /^(학교명?|출신학교|출신교|졸업학교|학교소재지|학교명소재지)$/, key: 'school' },
    { re: /^(전공|학위|전공\/학위|졸업여부|전공·학위|학과명?|단과대학|전공학과|전공분야|학위명|학위전공|전공및학위|졸업구분)$/, key: 'major' },
    { re: /^(기관명?|근무처|소속|발급기관|기관\/단체|위촉기관|직장명?|회사명|단체명|위촉처|발주처|주관기관|시행기관|소속기관)$/, key: 'org' },
    { re: /^(직위|직책|내용|담당업무|활동내용|직책\/내용|주요활동|업무내용|담당업무구체적|담당역할|수행업무|수행내용|담당분야|경력내용|세부내용|활동사항|직무)$/, key: 'role' },
    /* ⚠ 아래 셋은 «채우지 않는다» — 머리행인 줄 알아보아 «경계»로 삼기 위한 것뿐이다.
       열 이름을 못 알아보면 머리행인 줄 몰라 남의 표에 값이 박힌다
       (실측 2026-08-29: 자격증 표에 경력이 죽 박혔다). */
    { re: /^(자격증명|자격명|면허명|자격사항|자격증|면허|자격종류|종목|자격종목)$/, key: 'certName' },
    { re: /^(취득년도|취득일자?|발급일자?|취득연월일|취득연월|발행일자?|수여일자?|발급연월일)$/, key: 'gotAt' },
    { re: /^(비고|참고|기타|비고사항|참고사항)$/, key: 'note' }
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

  /* ── 칸의 글자를 «통째로 바꾼다» (대표 지시 2026-09-05 「화면에서 바로 수정」) ──
     ⚠ fillCell 과 다른 일이다. fillCell 은 «빈 칸»에 넣는 것이고, 글자가 있는 칸에 부르면
       run 앞에 새 <hp:t> 를 끼워 「권형하충남 천안시…」처럼 앞에 덧붙는다.
     ⚠ 이것은 «사람이 그 칸을 직접 고쳐 쳤을 때만» 부른다.
       자동 채우기(autoFill)는 여전히 글자가 있는 칸을 절대 건드리지 않는다 — 그 규칙은 그대로다.
     첫 <hp:t> 에 새 글자를 넣고 나머지는 비운다. 빈 글자('')를 주면 그 칸을 지운다. */
  function setCellText(tc, value) {
    var v = esc(value == null ? '' : value), n = 0, hit = false;
    /* ⚠★ 여는 태그를 «<hp:t[^>]*>» 로 쓰지 말 것 — 그 꼴은 칸 태그 «<hp:tc …>» 까지 잡아먹는다.
       실측 2026-09-05: 795자짜리 칸이 500자로 줄고 <hp:tc> 여는 태그가 통째로 사라져
       문서가 못 그려졌다(글자 조각 12개 → 0개). 태그 이름이 «거기서 끝나야» 한다. */
    var out = String(tc).replace(/(<hp:t(?:\s[^>]*)?>)([\s\S]*?)(<\/hp:t>)/g, function (m, a, inner, b) {
      hit = true; n++;
      return a + (n === 1 ? v : '') + b;
    });
    /* 글자 조각이 하나도 없으면(빈 칸 모양) 넣는 일꾼에게 맡긴다 */
    if (!hit) return fillCell(tc, value);
    return out;
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
  /* colMap: 머리행 이름표 → 열쇠 배열. AI에게 물어 얻은 짝짓기를 여기로 건넨다
     (js/kcareer-colmap-ai.js). 사전이 못 알아본 서식을 사람 손 없이 채우기 위한 것이다.
     ⚠ 사전보다 «앞선다» — 사전은 서식마다 새로 빗나가지만 AI는 그 표를 보고 답한다.
     ⚠ 없으면 지금까지처럼 사전으로 간다. AI가 없어도 앱은 그대로 돌아야 한다. */
  function detectHeader(cells, colMap) {
    var map = [], hit = 0, i;
    if (colMap) {
      var key = cells.map(function (c) { return cellText(c).replace(/[\s　]+/g, ''); }).join('|');
      var given = colMap[key];
      if (given && given.length === cells.length) {
        map = given.map(function (k) { return k === 'none' ? '' : k; });
        hit = map.filter(Boolean).length;
      }
    }
    if (!hit) {
      /* ⚠★ 머리행에는 «빈 칸이 없다» — 열 이름이 죽 적혀 있는 줄이기 때문이다.
         이 빗장이 없으면 「소속기관 | (빈칸) | 직위 | (빈칸)」 같은 «보통 라벨 표»가
         경력 목록으로 오인되어 그 표의 빈 칸을 통째로 놓친다
         (실측 2026-09-05: 사전에 「소속기관」을 더했더니 채울 자리 4개가 0개가 됐다).
         ⚠ 사전을 넓힐수록 이 오인이 잦아진다 — 낱말을 더할 때 이 빗장을 풀지 말 것.
         ⚠ 사람·AI 가 짚어 준 짝짓기(colMap)는 위에서 이미 hit 를 잡아 여기까지 오지 않는다. */
      for (i = 0; i < cells.length; i++) if (isEmptyCell(cells[i])) return null;
      for (i = 0; i < cells.length; i++) {
        var k = colKeyOf(cellText(cells[i]));
        map.push(k); if (k) hit++;
      }
    }
    if (hit < 2) return null;
    var kind = map.indexOf('school') >= 0 ? 'edu'
      : (map.indexOf('org') >= 0 && (map.indexOf('role') >= 0 || map.indexOf('period') >= 0)) ? 'career' : '';
    return kind ? { kind: kind, map: map } : null;
  }
  /* ── 여기서부터는 «남의 자리» ──
     ① 다음 머리행 — 열 이름이 둘 이상 잡히면 새 목록 표가 시작된 것이다
     ② 소제목 행 — 한 칸에만 글자가 있고 나머지가 빈 행(「5. 관련 분야 자격증 보유 사항」)
     둘 중 하나를 만나면 «멈춘다». 넘어가면 자격증 표에 경력이 박힌다. */
  function isBoundary(cells) {
    if (!cells.length) return false;
    /* ⚠ detectHeader 로만 보면 안 된다 — 그건 «채울 수 있는» 목록 표(학력·경력)만 참이다.
       자격증 머리행은 채울 대상이 아니라 detectHeader 가 거짓이고, 그래서 그냥 지나쳐
       그 아래에 경력이 박혔다. 여기서는 «열 이름이 둘 이상 잡히면» 머리행으로 본다. */
    var keys = 0;
    for (var k = 0; k < cells.length; k++) if (colKeyOf(cellText(cells[k]))) keys++;
    if (keys >= 2) return true;
    var filled = 0, first = -1;
    for (var i = 0; i < cells.length; i++) {
      if (!isEmptyCell(cells[i])) { filled++; if (first < 0) first = i; }
    }
    /* 첫 칸에만 글자가 있고 다른 칸이 여럿 비어 있으면 소제목 줄로 본다 */
    return filled === 1 && first === 0 && cells.length >= 3;
  }

  function rowIsEmpty(cells) {
    for (var i = 0; i < cells.length; i++) if (!isEmptyCell(cells[i])) return false;
    return true;
  }
  /* ── 목록 표 채우기 ──
     ⚠ 표 하나에 «구역이 여럿» 있을 수 있다. 대표 서식(2026-08-29)은 큰 표 하나 안에
       「3. 최종학력」「4. 경력사항」「5. 자격증」이 소제목으로 이어져 있었다.
     전에는 ①머리행을 «하나만» 찾고 ②그 아래를 «표 끝까지» 채웠다. 그래서
       · 첫 머리행이 학력인데 학력이 비면 표 전체를 포기해 경력이 안 들어갔고
       · 경력이 잡히면 자격증 표까지 죽 채워 «잘못 낸 서류»가 됐다.
     이제 구역마다 머리행을 찾고, 그 구역의 «연속된 빈 행»만 채운다. */
  function fillList(tbl, data, report, opts) {
    var rows = splitRows(tbl);
    var newTbl = tbl;
    for (var r = 0; r < rows.length; r++) {
      var head = detectHeader(splitCells(rows[r]), opts && opts.colMap);
      if (!head) continue;
      var items = data[head.kind] || [];
      var put = 0;
      /* 이 구역의 끝까지만 — 다음 머리행이나 소제목을 만나면 남의 자리다 */
      var q = r + 1;
      for (; q < rows.length; q++) {
        var cells = splitCells(rows[q]);
        if (isBoundary(cells)) break;
        if (put >= items.length) continue;              /* 넣을 것이 없어도 구역 끝까지는 지나간다 */
        if (!rowIsEmpty(cells)) continue;               /* 값이 이미 있는 행은 건너뛴다 */
        var item = items[put], newTr = rows[q], ok = false, used = {};
        for (var c = 0; c < cells.length && c < head.map.length; c++) {
          var k = head.map[c];
          if (!k || item[k] == null || item[k] === '') continue;
          /* ⚠ 같은 열쇠가 두 열에 잡히면 «첫 열에만» 넣는다.
             「학과명」과 「학 위」가 둘 다 major 로 잡혀 「인문계」가 두 칸에 들어갔다
             (실측 2026-08-29). 「담당업무(구체적)」와 「직 위」도 같은 일이 났다. */
          if (used[k]) continue;
          used[k] = true;
          var filled = fillCell(cells[c], item[k]);
          if (!filled) continue;
          newTr = replaceOnce(newTr, cells[c], filled);
          cells[c] = filled; ok = true;
        }
        if (ok) { newTbl = replaceOnce(newTbl, rows[q], newTr); put++; }
      }
      if (items.length) report.lists.push({ kind: head.kind, put: put, total: items.length });
      r = q - 1;                                        /* 이 구역은 다 봤다 — 다음 구역부터 */
    }
    return newTbl;
  }

  /* ===== 입구 =====
     data = { fields:{name,birth,gender,phone,email,addr,license,org},
              edu:[{period,school,major}], career:[{period,org,role}] } */
  function autoFill(sectionXml, data, opts) {
    data = data || {};
    var report = { fields: [], lists: [], kept: [], usedKeys: {} };
    var xml = eachTable(sectionXml, function (tbl) {
      var t = fillFields(tbl, data.fields || {}, report);
      t = fillList(t, data, report, opts);
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
    cellText: cellText, isEmptyCell: isEmptyCell, fillCell: fillCell, setCellText: setCellText,
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
