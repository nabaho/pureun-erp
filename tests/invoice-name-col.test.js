/* 김보람 제보 (2026-08-26)
 * ① 전자세금계산서 272건이 «모두» 「푸른노무법인」으로 묶여 정기 자문업체로 걸러졌다.
 *    화면은 「✅ 완료: 0건」이라고 했다.
 *    → 「상호」 칸이 둘인데(공급자·공급받는자) 우리 쪽 칸을 골랐다.
 * ② 1/29 입금인데 자문료 후보가 6·7·8월뿐 — 1월을 고를 수 없었다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
function cutBlock(src, header) {
  const i = src.indexOf(header);
  assert.ok(i >= 0, '못 찾음: ' + header);
  let j = src.indexOf('{', i), d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('닫는 괄호 없음: ' + header);
}

const ctx = { console, String, Object, Array, Math, window: {} };
vm.createContext(ctx);
['function erpInvFillGroup(', 'function erpInvMergeHeader(rows, i){', 'function erpInvColOf(hdr, res){',
 'var ERP_INV_COL = {', 'function erpInvNameCols(hdr){', 'function erpInvDistinct(rows, from, col, max){',
 'function erpInvCols(hdr){', 'function erpInvPickHeader(rows){'].forEach((h) => {
  vm.runInContext(cutBlock(SRC, h), ctx);
});
const pick = ctx.erpInvPickHeader;

/* ── 홈택스 «매출» 목록: 머리줄 두 칸(공급자 / 공급받는자) ── */
function salesSheet(n) {
  const rows = [
    ['전자세금계산서 목록조회', '', '', '', '', '', '', '', ''],
    ['', '', '공급자', '', '', '공급받는자', '', '', ''],
    ['작성일자', '승인번호', '등록번호', '상호', '성명', '등록번호', '상호', '성명', '공급가액'],
  ];
  for (let i = 0; i < n; i++) {
    rows.push(['2026-01-' + String((i % 28) + 1).padStart(2, '0'), 'A' + i,
      '312-81-03893', '푸른노무법인', '권형하',
      '111-11-' + String(10000 + i), '거래처' + i + '주식회사', '대표' + i, 330000]);
  }
  return rows;
}

test('★★ 대표가 겪은 그 파일 — 「상호」가 둘일 때 «거래처» 칸을 고른다', () => {
  const rows = salesSheet(30);
  const p = pick(rows);
  assert.ok(p.idx >= 0, '머리줄을 못 찾았다');
  const nameCol = p.cols.name;
  const v = String(rows[p.idx + 3][nameCol] || '');
  assert.ok(v.indexOf('거래처') >= 0,
    '우리 법인 칸을 골랐다 (' + v + ') — 272건이 전부 걸러지던 그 원인이다');
  assert.notStrictEqual(v, '푸른노무법인');
});

test('★★ 값이 한 가지뿐인 칸은 «거래처 칸이 아니다»', () => {
  const rows = salesSheet(20);
  const hdr = ctx.erpInvMergeHeader(rows, 2);
  const cols = ctx.erpInvNameCols(hdr);
  assert.strictEqual(cols.length, 2, '상호 칸이 둘이어야 한다');
  const d0 = ctx.erpInvDistinct(rows, 3, cols[0], 60);
  const d1 = ctx.erpInvDistinct(rows, 3, cols[1], 60);
  assert.strictEqual(d0, 1, '공급자 칸은 값이 한 가지다');
  assert.ok(d1 > 5, '공급받는자 칸은 값이 여러 가지다');
});

test('★★ 매입 목록이면 «거꾸로»여도 같은 규칙이 맞는다 (우리 이름을 못 박지 않는다)', () => {
  /* 매입: 공급자 = 거래처(여러 가지), 공급받는자 = 우리(한 가지) */
  const rows = [
    ['', '', '공급자', '', '', '공급받는자', '', '', ''],
    ['작성일자', '승인번호', '등록번호', '상호', '성명', '등록번호', '상호', '성명', '공급가액'],
  ];
  for (let i = 0; i < 20; i++) {
    rows.push(['2026-02-' + String((i % 28) + 1).padStart(2, '0'), 'B' + i,
      '222-22-' + String(10000 + i), '매입처' + i + '유한회사', '대표' + i,
      '312-81-03893', '푸른노무법인', '권형하', 110000]);
  }
  const p = pick(rows);
  const v = String(rows[p.idx + 2][p.cols.name] || '');
  assert.ok(v.indexOf('매입처') >= 0, '매입 목록에서 우리 법인 칸을 골랐다 (' + v + ')');
});

test('상호 칸이 «하나»뿐이면 그것을 쓴다 (있는 파일을 깨면 안 된다)', () => {
  const rows = [['작성일자', '상호', '사업자등록번호', '공급가액']];
  for (let i = 0; i < 10; i++) rows.push(['2026-03-0' + ((i % 9) + 1), '한칸회사' + i, '333-33-3333' + i, 220000]);
  const p = pick(rows);
  assert.ok(p.idx >= 0, '머리줄을 못 찾았다');
  assert.strictEqual(String(rows[p.idx + 1][p.cols.name]).indexOf('한칸회사'), 0);
});

test('날짜나 상호가 없으면 머리줄로 안 본다', () => {
  const p = pick([['안내문입니다'], ['공급가액', '세액']]);
  assert.strictEqual(p.idx, -1, '아무 줄이나 머리줄로 삼고 있다');
});

/* ── 전부 걸러졌으면 «완료»라고 하지 않는다 ── */
test('★★ 읽은 줄이 «모두» 빠졌으면 완료가 아니라 «까닭»을 말한다', () => {
  const fn = bare(cutBlock(SRC, 'async function handleInvoiceUpload(e){'));
  assert.ok(/if\(allRows\.length > 0 && filteredRows\.length === 0\)\{/.test(fn),
    '다 빠졌는데도 완료라고 말한다 — 0건과 구별이 안 된다');
  const raw2 = cutBlock(SRC, 'async function handleInvoiceUpload(e){');
  assert.ok(raw2.indexOf('공급자 칸을 읽은 것입니다') >= 0, '무엇이 잘못됐는지 안 알려 준다');
  assert.ok(raw2.indexOf('정말 모두 정기 자문업체라면') >= 0,
    '정말 다 정기 자문업체일 수도 있다 — 그 경우를 틀렸다고 몰면 안 된다');
});

test('★ 다 빠진 경우 «담는 일을 멈춘다» (빈 것을 저장하지 않는다)', () => {
  const fn = bare(cutBlock(SRC, 'async function handleInvoiceUpload(e){'));
  const i = fn.indexOf('filteredRows.length === 0');
  const r = fn.indexOf('return;', i);
  const put = fn.indexOf("idbBulkPut('invoice_history'");
  assert.ok(i >= 0 && r > i && put > r, '멈추지 않고 그대로 저장까지 간다');
});

/* ── 자문료 후보 달 ── */
test('★★ 자문료 후보 달은 «명세서에 있는 달»을 모두 본다', () => {
  const fn = bare(cutBlock(SRC, 'function addAdvisoryPending(){'));
  assert.ok(/ds\.forEach\(function\(s\)\{ ymSeen\[s\] = 1; \}\)/.test(fn),
    '명세서에 있는 달을 다 안 본다 — 1월 입금인데 후보가 6·7·8월뿐이던 그 원인이다');
  assert.ok(/var ymList = Object\.keys\(ymSeen\)\.sort\(\)\.reverse\(\)/.test(fn),
    '후보 달 목록을 ymSeen 에서 만들지 않는다');
  assert.ok(fn.indexOf('_ymBack(lastYm, _bi)') < 0,
    '아직 «가장 늦은 달»에서만 거슬러 세고 있다');
});

test('★ 가장 «이른» 달 앞으로도 3달 더 본다 (그 전부터 밀린 자문료)', () => {
  const fn = bare(cutBlock(SRC, 'function addAdvisoryPending(){'));
  assert.ok(/_earliest = ds\.length \? ds\[0\] : lastYm/.test(fn), '가장 이른 달을 안 찾는다');
  assert.ok(/for\(var _bi=1; _bi<=ADV_BACK; _bi\+\+\) ymSeen\[_ymBack\(_earliest, _bi\)\] = 1;/.test(fn),
    '이른 달 앞으로 더 보지 않는다');
});

test('★ 밀림 표시는 여전히 «가장 늦은 달»을 기준으로 한다', () => {
  const fn = bare(cutBlock(SRC, 'function addAdvisoryPending(){'));
  assert.ok(/var late = \(ym !== lastYm\)/.test(fn), '밀림 기준이 바뀌었다');
});

test('선납·건별·분기별은 여전히 뺀다 (매달 걷는 것이 아니다)', () => {
  const fn = cutBlock(SRC, 'function addAdvisoryPending(){');
  assert.ok(fn.indexOf("pd === '선납' || pd === '건별' || pd === '분기별'") >= 0, '매달 후보로 올리고 있다');
});
