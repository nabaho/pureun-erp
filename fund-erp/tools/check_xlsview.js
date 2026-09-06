/* 엑셀 서식 — «보이는 대로» 그리는가, 그리고 «남의 자료»를 안 남기는가.

   ① 화면 보기
      XLSX.utils.sheet_to_html 은 병합도 열폭도 버린다. 원본 설립인가신청서는
      폭 1.6자짜리 모눈 칸을 63군데 병합해 만든 별지 서식이라, 병합을 버리면
      「근로복지기금법인」이 한 글자씩 «세로로» 선다 — 실제로 화면이 그랬다.

   ② 채움
      원본 양식의 수식 칸에는 이 양식으로 앞서 만든 «남의 기금» 값이 캐시로 박혀 있다.
      ExcelJS 는 손대지 않은 수식 칸의 캐시를 그대로 다시 써 낸다 — 확인했다:
      우리 기금으로 채운 뒤에도 다른 기금의 이름·전화·주소·거래은행이 남았다.
      그게 내려받는 «제출 파일»에 들어간다.

   ⚠ 수식이 수식을 가리킨다(C3 → C13 → 사업계획서 → 정관). 한 번만 훑으면
     아직 안 고쳐진 칸을 읽어 앞 기금 값을 도로 퍼뜨린다 — 되풀이해야 한다.

   ⚠ 원본 엑셀(templates/)은 저장소에 없다. 그래서 여기서는 «같은 짜임»을 손으로
     세워 확인한다 — 흉내가 아니라 fund.html 의 그 함수들을 그대로 떼어다 돌린다.

   실행: node fund-erp/tools/check_xlsview.js */
const fs = require('fs'), path = require('path');
const W = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(W, 'fund.html'), 'utf8');
let JSDOM = null;
/* jsdom 이 없는 곳에서 이 한 줄이 저장소의 «모든 앱» 배포를 막지 않게 한다 */
try { JSDOM = require('jsdom').JSDOM; } catch (e) { JSDOM = null; }

let bad = 0;
const ok = (n, c, w) => { if (c) console.log('  · ' + n); else { bad++; console.log('  ✗ ' + n + (w ? '  — ' + w : '')); } };
function gF(n) { const i = src.indexOf('function ' + n + '('); if (i < 0) throw Error('없음 ' + n); let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } }

/* ══════════ 아주 작은 ExcelJS 흉내 ══════════
   여기서 보는 것은 «무엇을 읽고 무엇을 남기는가»다. 진짜 ExcelJS 는 저장소에 없다. */
const VT = { Null: 0, Merge: 1, Number: 2, String: 3, Date: 4, Hyperlink: 5, Formula: 6 };
global.ExcelJS = { ValueType: VT };
function colN(a) { let n = 0; for (const ch of a.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
function colA(c) { let s = ''; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = (c - m - 1) / 26; } return s; }
function Sheet(name) {
  const cells = {};
  const self = {
    name,
    getCell(a, b) {
      const addr = (b == null) ? String(a) : (colA(b) + a);
      if (!cells[addr]) cells[addr] = { address: addr, _v: null,
        get type() { const v = this._v; if (v == null) return VT.Null;
          if (typeof v === 'object' && v.formula) return VT.Formula;
          if (typeof v === 'number') return VT.Number; return VT.String; },
        get value() { return this._v; }, set value(x) { this._v = x; },
        get formula() { const v = this._v; return (v && v.formula) || null; },
        get result() { const v = this._v; return (v && typeof v === 'object' && 'result' in v) ? v.result : undefined; } };
      return cells[addr];
    },
    eachRow(o, fn) { const rows = {};
      Object.keys(cells).forEach((a) => { const r = +a.replace(/^[A-Z]+/, ''); (rows[r] = rows[r] || []).push(cells[a]); });
      Object.keys(rows).sort((x, y) => x - y).forEach((r) => fn({ eachCell: (oo, f2) => rows[r].forEach(f2) }, +r)); },
    /* fillSubsidy 는 «열»로도 훑는다 — 신청서 시트의 열쇠 칸을 찾을 때 쓴다 */
    getColumn(n) { const letter = colA(n);
      return { eachCell(oo, f2) { Object.keys(cells)
        .filter((a) => a.replace(/\d+$/, '') === letter)
        .sort((x, y) => (+x.replace(/^[A-Z]+/, '')) - (+y.replace(/^[A-Z]+/, '')))
        .forEach((a) => f2(cells[a], +a.replace(/^[A-Z]+/, ''))); } }; },
    rowCount: 60, columnCount: 40,
  };
  return self;
}
function Book(names) {
  const sh = names.map(Sheet);
  return { calcProperties: null,
    getWorksheet: (n) => sh.filter((s) => s.name === n)[0] || null,
    eachSheet: (fn) => sh.forEach(fn) };
}

/* ══════════ fund.html 의 그 함수들 ══════════ */
global.num = (v) => (v == null || v === '' ? '' : Math.round(Number(String(v).replace(/[^0-9.-]/g, '')) || 0));
global.S = { year: 2026 };
['setC', 'clearRange', '_splitPeople', 'fillSetup',
 '_xlsColN', '_xlsPlain', '_xlsRef', '_xlsVlookup', '_xlsJoin', '_xlsRecalc',
 '_xlsPx', '_xlsHTML'].forEach((n) => (0, eval)(gF(n)));

/* ══════════ 원본 양식과 «같은 짜임»을 세운다 ══════════
   첫째 표 A3:N9 (신청서) · 둘째 표 A13:H19 (사업계획서) · 셋째 표 A22:E29 (정관·합의서·회의록·확인서)
   둘째·셋째 표는 대부분 첫째 표를 가리키는 «수식»이고, 수식은 수식을 가리킨다. */
const OLD = { name: '앞기금근로복지기금', ceo: '앞대표', addr: '앞시 앞구 1', tel: '02-475-7065', bank: '하나은행', date: '2023-05-04', amt: '2,000,000원' };
function build() {
  const wb = Book(['1.설립인가신청서', '2.사업계획서', '3. 정관', '5.회의록', '기금법인정보']);
  const info = wb.getWorksheet('기금법인정보');
  info.getCell('A3').value = 1;
  [['B3', '앞사업장'], ['C3', OLD.name], ['D3', OLD.ceo], ['E3', OLD.addr], ['F3', OLD.date], ['J3', OLD.tel]]
    .forEach(([a, v]) => { info.getCell(a).value = v; });
  info.getCell('B4').value = '남은샘플줄';          // 지워져야 한다
  info.getCell('A13').value = 1;
  info.getCell('B13').value = { formula: 'B23', result: OLD.date };
  info.getCell('C13').value = { formula: 'C3', result: OLD.name };
  info.getCell('D13').value = { formula: 'D3', result: OLD.ceo };
  info.getCell('E13').value = { formula: 'E3', result: OLD.addr };
  info.getCell('F13').value = OLD.amt;               // 값이 박힌 칸
  info.getCell('G13').value = OLD.bank;              // 값이 박힌 칸
  info.getCell('H13').value = { formula: 'F3', result: OLD.date };
  info.getCell('B14').value = '남은샘플줄';
  info.getCell('A23').value = 1;
  /* 넷 다 앞 기금 날짜가 박혀 있다 — «있을 때만» 넣으면 그대로 남는다 */
  info.getCell('B23').value = OLD.date;              // 정관 작성 날짜
  info.getCell('D23').value = OLD.date;              // 회의록 작성 날짜
  info.getCell('C23').value = OLD.date;              // 설립합의서 작성 날짜 — 우리 자료 아님
  info.getCell('E23').value = OLD.date;              // 기금출연확인서 작성 날짜 — 우리 자료 아님
  info.getCell('B24').value = '남은샘플줄';
  const apply = wb.getWorksheet('1.설립인가신청서');
  apply.getCell('AK4').value = 1;
  apply.getCell('J9').value = { formula: 'VLOOKUP(AK4,기금법인정보!$A$3:$M$9,3)', result: OLD.name };
  apply.getCell('AC9').value = { formula: 'VLOOKUP(AK4,기금법인정보!$A$3:$M$9,10)', result: OLD.tel };
  const biz = wb.getWorksheet('2.사업계획서');
  biz.getCell('B11').value = '2023년도 사업계획 및 예산(안)';
  biz.getCell('CY3').value = 1;
  biz.getCell('B27').value = { formula: 'VLOOKUP(CY3,기금법인정보!$A$13:$H$19,3,FALSE)', result: OLD.name };
  biz.getCell('D177').value = { formula: 'VLOOKUP(CY3,기금법인정보!$A$13:$H$19,7,FALSE)', result: OLD.bank };
  const chr = wb.getWorksheet('3. 정관');
  chr.getCell('B8').value = { formula: 'MID(B27,3,2)', result: '사내' };
  chr.getCell('B27').value = { formula: 'VLOOKUP(CY3,기금법인정보!$A$13:$H$19,3,FALSE)', result: OLD.name };
  chr.getCell('CY3').value = 1;
  const mnt = wb.getWorksheet('5.회의록');
  mnt.getCell('F7').value = '사내근로복지기금';       // 값이 박힌 칸 — 사내/공동 갈래
  mnt.getCell('G54').value = { formula: '"○ "&LEFT(F7,2)&"근로복지기금 설립 경과"', result: '○ 사내근로복지기금 설립 경과' };
  return wb;
}
const F = { name: '가나공동근로복지기금', chairman: '홍길동', address: '어느시 어느구 1', fund_type: '공동',
  inka_date: '2026-01-02', phone: '02-000-0000', worker_rep: '김노측', worker_committee: '김노측',
  emp_committee: '박사측', rep_org: '가나기업', contribution_total: 10000000,
  estab_date: '2026-01-01', meeting_date: '2026-01-05' };
const FOREIGN = new RegExp(['앞기금', '앞대표', '앞시', '02-475', '하나은행', '2023-05-04', '2,000,000', '사내', '남은샘플줄'].join('|'));

function fillAll(f) { const wb = build(); fillSetup(wb, f, [{ name: '가나기업' }]); _xlsRecalc(wb); return wb; }
function scan(wb) { const out = []; wb.eachSheet((ws) => ws.eachRow({}, (row) => row.eachCell({}, (c) => {
  const v = (c.type === VT.Formula) ? c.result : c.value;
  if (typeof v === 'string' && FOREIGN.test(v)) out.push(ws.name + '!' + c.address + '=' + v);
}))); return out; }

console.log('■ 채운 뒤 «남의 자료»가 남지 않는가');
const wb1 = fillAll(F);
const left = scan(wb1);
ok('어디에도 앞 기금 값이 안 남는다', left.length === 0, left.slice(0, 4).join(' | '));
ok('엑셀이 열 때 다시 셈하게 표시한다', !!(wb1.calcProperties && wb1.calcProperties.fullCalcOnLoad));

console.log('\n■ 값이 «박힌» 칸 — 채워도 안 바뀌던 자리');
const i1 = wb1.getWorksheet('기금법인정보');
ok('출연금액은 없어도 «비운다» (앞 기금 금액이 안 남게)',
   (function () { const w = fillAll(Object.assign({}, F, { contribution_total: '' })); return String(w.getWorksheet('기금법인정보').getCell('F13').value || '') === ''; })(),
   '출연금이 없을 때 F13');
ok('금융기관명은 비운다 (우리가 가진 자료가 아니다)', String(i1.getCell('G13').value || '') === '', i1.getCell('G13').value);
ok('설립합의서 작성 날짜를 비운다', String(i1.getCell('C23').value || '') === '', i1.getCell('C23').value);
ok('회의록 작성 날짜는 «없어도» 넣는다(빈 값으로 덮는다)',
   (function () { const w = fillAll(Object.assign({}, F, { meeting_date: '' })); return String(w.getWorksheet('기금법인정보').getCell('D23').value || '') === ''; })());
ok('회의록의 사내/공동을 기금 유형으로 맞춘다',
   /^공동근로복지기금/.test(String(wb1.getWorksheet('5.회의록').getCell('F7').value || '')),
   wb1.getWorksheet('5.회의록').getCell('F7').value);
ok('사업계획서 제목의 해를 한글본과 맞춘다 (S.year)',
   /^2026년도/.test(String(wb1.getWorksheet('2.사업계획서').getCell('B11').value || '')),
   wb1.getWorksheet('2.사업계획서').getCell('B11').value);
ok('제목 문구는 원본 그대로 둔다 (해만 바꾼다)',
   /사업계획 및 예산\(안\)$/.test(String(wb1.getWorksheet('2.사업계획서').getCell('B11').value || '')));

console.log('\n■ 수식이 수식을 가리킨다 — 한 번만 훑으면 안 된다');
ok('둘째 표를 거친 값도 우리 것이 된다 (C3→C13→사업계획서)',
   wb1.getWorksheet('2.사업계획서').getCell('B27').result === F.name,
   wb1.getWorksheet('2.사업계획서').getCell('B27').result);
ok('그 위에 또 얹힌 값도 따라온다 (→정관 MID)',
   wb1.getWorksheet('3. 정관').getCell('B8').result === '공동',
   wb1.getWorksheet('3. 정관').getCell('B8').result);
ok('되풀이 횟수가 넉넉하다', /pass<[3-9]|pass<\d\d/.test(gF('_xlsRecalc')), '한 번만 훑으면 앞 기금 값이 퍼진다');
ok('못 셈한 식은 «비운다» (남의 값을 그냥 두지 않는다)', /val==null\) val=''/.test(gF('_xlsRecalc')));
ok('찾지 못한 VLOOKUP 은 null 을 준다', /return null;\s*\/\* 못 찾으면 비운다 \*\/|return null;\s+\}/.test(gF('_xlsVlookup')));

console.log('\n■ 지원신청서 — 앞 기금의 «참여사업장 명부»가 안 남는가');
/* 이 양식에는 어느 기금의 참여사업장 명부가 통째로 들어 있다 —
   상호·대표자·사업자등록번호·주소, 그리고 «옆 칸»의 메모까지.
   ⚠ 예전에는 「우리가 채운 줄 다음」부터만 지웠다. 우리가 덮어쓰는 칸은 바뀌어도
     우리가 «안 건드리는 옆 칸»은 그대로 남아 다른 기금 신청서에 딸려 나갔다. */
(0, eval)(gF('fillSubsidy'));
global._siteContacts = () => ({ name: '', phone: '', mobile: '', email: '' });
function buildSub() {
  const wb = Book(['신청서', '기금법인정보', '참여사업장정보']);
  const info = wb.getWorksheet('기금법인정보');
  info.getCell('A2').value = 1; info.getCell('B2').value = '앞기금공동근로복지기금';
  info.getCell('B3').value = '앞기금 샘플줄';           /* 다음 줄들도 지워져야 한다 */
  const parts = wb.getWorksheet('참여사업장정보');
  parts.getCell('A3').value = '1-1';
  parts.getCell('C3').value = '앞참여사(주)';
  parts.getCell('I3').value = '111-11-11111';
  parts.getCell('N3').value = '010-1111-1111';
  parts.getCell('AE3').value = '앞기금 메모(탈퇴)';      /* ⚠ 우리가 «안 쓰는» 옆 칸 */
  parts.getCell('C9').value = '앞참여사2(주)';           /* 우리 사업장 수보다 뒤의 줄 */
  const doc = wb.getWorksheet('신청서');
  doc.getCell('I10').value = '1-1'; doc.getCell('I11').value = '1-2';
  return wb;
}
const SF = { name: '가나공동근로복지기금', chairman: '홍길동', address: '어느시 1', fund_type: '공동',
  phone: '041-000-0000', inka_no: '0000-0000-0', corp_reg_no: '000000-0000000', tax_id_no: '000-00-00000',
  contribution_total: 10000000, years: { 2026: { subsidy: { request_amount: 9000000 } } } };
const SSITES = [{ name: '가나기계', ceo: '김가나', address: '어느시 1', company_size: 65, biz_no: '000-00-00001' }];
const subWb = buildSub();
fillSubsidy(subWb, SF, SSITES);
_xlsRecalc(subWb);
const SUB_OLD = /앞기금|앞참여사|111-11|010-1111/;
const subLeft = [];
subWb.eachSheet((ws) => ws.eachRow({}, (row) => row.eachCell({}, (c) => {
  const v = (c.type === VT.Formula) ? c.result : c.value;
  if (typeof v === 'string' && SUB_OLD.test(v)) subLeft.push(ws.name + '!' + c.address + '=' + v);
})));
ok('앞 기금의 명부가 한 칸도 안 남는다', subLeft.length === 0, subLeft.join(' | '));
ok('우리 사업장이 들어간다', subWb.getWorksheet('참여사업장정보').getCell('C3').value === '가나기계',
   subWb.getWorksheet('참여사업장정보').getCell('C3').value);
ok('먼저 비우고 쓴다 (덮어쓰는 칸만 고치지 않는다)',
   /clearRange\(parts,3,/.test(gF('fillSubsidy')), gF('fillSubsidy').slice(0, 400));
/* ⚠ 위의 확인들은 함수를 «직접» 부른다. 그런데 앱은 _fillWbBuffer 를 지나간다 —
   거기서 다시 셈하는 한 줄이 빠지면, 검사는 다 통과하는데 실제로는
   앞 기금 값이 그대로 파일에 들어간다. 배선도 함께 본다. */
ok('채운 뒤 «반드시» 다시 셈한다 (내려받기·미리보기가 함께 쓰는 길)',
   /_xlsRecalc\(wb\);/.test(gF('_fillWbBuffer')), gF('_fillWbBuffer'));

console.log('\n■ 화면 보기 — 병합·열폭·넘침');
ok('cellStyles 로 읽는다 (안 켜면 열폭이 다 같아진다)', /XLSX\.read\([\s\S]{0,90}cellStyles:true/.test(src));
/* 주석에서 «왜 안 쓰는지» 적어 두었으므로, 글자가 아니라 «부르는지»를 본다 */
ok('sheet_to_html 을 안 부른다', !/XLSX\.utils\.sheet_to_html\s*\(/.test(src));
ok('한글본과 «이름으로» 짝을 짓는다 (번호로 지으면 다른 서식끼리 놓인다)', /var XLS_PAIR=/.test(src) && /_xlsPairKind/.test(src));
if (!JSDOM) {
  console.log('SKIP: jsdom 이 없어 «격자» 확인만 건너뜁니다 — 채움 쪽은 그대로 봤습니다');
} else {
  /* 모눈 칸 + 병합 + 옆이 빈 긴 글 — 원본 별지 서식과 같은 짜임 */
  const ws = { '!ref': 'A1:H4', '!cols': [], '!merges': [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, { s: { r: 2, c: 1 }, e: { r: 3, c: 2 } }] };
  for (let c = 0; c < 8; c++) ws['!cols'][c] = { wch: c === 0 ? 7 : 1.625 };
  ws.A1 = { t: 's', v: '병합된 긴 이름입니다' };
  ws.B2 = { t: 's', v: '옆이 비어 넘쳐 흐르는 긴 글' };
  ws.B3 = { t: 's', v: '세로병합' };
  ws.H4 = { t: 'n', v: 12 };
  global.esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  global.XLSX = { utils: {
    decode_range: (r) => { const [a, b] = r.split(':');
      const d = (x) => { const m = x.match(/^([A-Z]+)(\d+)$/); return { c: colN(m[1]) - 1, r: +m[2] - 1 }; };
      return { s: d(a), e: d(b) }; },
    encode_cell: (o) => colA(o.c + 1) + (o.r + 1) } };
  const doc = new JSDOM('<body><div id=x></div>').window.document;
  doc.getElementById('x').innerHTML = _xlsHTML(ws);
  const trs = [].slice.call(doc.querySelectorAll('tr'));
  ok('열 수만큼 <col> 이 있다', doc.querySelectorAll('colgroup col').length === 8);
  ok('열폭이 제각각이다', new Set([].map.call(doc.querySelectorAll('colgroup col'), (c) => c.getAttribute('style'))).size > 1);
  const carry = [0, 0, 0, 0, 0, 0];
  let off = 0;
  trs.forEach((tr, i) => { let w = carry[i];
    [].slice.call(tr.children).forEach((td) => { const cs = +(td.getAttribute('colspan') || 1), rs = +(td.getAttribute('rowspan') || 1);
      w += cs; for (let k = 1; k < rs; k++) carry[i + k] += cs; });
    if (w !== 8) off++; });
  ok('줄마다 칸 폭 합이 열 수와 같다 (덮인 칸·먹은 칸을 건너뛴다)', off === 0, off + '줄 어긋남');
  const long = [].slice.call(doc.querySelectorAll('td')).filter((td) => (td.textContent || '').trim().length >= 6);
  ok('긴 글이 좁은 한 칸에 갇히지 않는다 (세로로 서지 않는다)',
     long.length > 0 && long.every((td) => +(td.getAttribute('colspan') || 1) > 1),
     long.map((t) => t.textContent.slice(0, 10) + '/' + (t.getAttribute('colspan') || 1)).join(' '));
  ok('세로 병합이 살아 있다', !!doc.querySelector('td[rowspan]'));
}

console.log(bad ? '\nFAILURES ' + bad : '\nALL PASS (엑셀이 제대로 보이고, 남의 자료가 안 남는다)');
process.exit(bad ? 1 : 0);
