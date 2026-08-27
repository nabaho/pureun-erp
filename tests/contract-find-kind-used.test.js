/* 계약서 찾기 — 갈래로 나눠 찾기 · 이미 쓴 것은 감추기 (2026-08-27 대표 지시)
 *
 * 대표: 「업체관리에 자문계약서·급여계약서 등에 대해서는 자동으로 분류해서 거기서 찾을 수 있게」
 *       「이미 사용된 계약서는 더 이상 추가로 검토할 필요가 없다」
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
function cutRange(src, from, to) {
  const a = src.indexOf(from);
  assert.ok(a >= 0, '못 찾음: ' + from);
  const b = src.indexOf(to, a);
  assert.ok(b >= 0, '못 찾음: ' + to);
  return src.slice(a, b + to.length);
}

const ctx = { console, String, Object, Array, window: {}, fmtDate: (t) => String(t || '') };
vm.createContext(ctx);
vm.runInContext(cutBlock(SRC, 'function erpPhotoFilter(items, q){'), ctx);
vm.runInContext(cutRange(SRC, "var ERP_DOC_KINDS =", '\n'), ctx);
vm.runInContext(cutBlock(SRC, 'function erpContractDocKind(fields){'), ctx);
vm.runInContext(cutBlock(SRC, 'function erpPhotoPick(items, q, kind, showUsed){'), ctx);
vm.runInContext(cutBlock(SRC, 'function erpPhotoKindCounts(items, q, showUsed){'), ctx);
const { erpContractDocKind: kindOf, erpPhotoPick: pick, erpPhotoKindCounts: counts } = ctx;

const IT = (id, docName, extra) =>
  Object.assign({ id: id, fields: { company: '회사' + id, docName: docName } }, extra || {});

/* ── 갈래 ── */
test('★★ 문서 이름으로 갈래를 가른다', () => {
  assert.strictEqual(kindOf({ docName: '노무자문 위탁계약서' }), '자문');
  assert.strictEqual(kindOf({ docName: '용역계약서' }), '용역');
  assert.strictEqual(kindOf({ docName: '위임계약서' }), '위임');
  assert.strictEqual(kindOf({ docName: '위임약정서' }), '위임');
});

test('★★ 「급여관리업무 위임계약서」는 «급여»다 (순서가 곧 규칙이다)', () => {
  assert.strictEqual(kindOf({ docName: '급여관리업무 위임계약서' }), '급여',
    '급여를 위임보다 먼저 보지 않으면 급여계약서가 위임으로 샌다');
  assert.strictEqual(kindOf({ docName: '임금관리 위탁계약서' }), '급여');
});

test('★ 모르면 «기타»다 — 억지로 어느 갈래에 넣지 않는다', () => {
  assert.strictEqual(kindOf({ docName: '확인서' }), '기타');
  assert.strictEqual(kindOf({}), '기타');
  assert.strictEqual(kindOf(null), '기타');
});

test('업무 요약도 함께 본다 (문서 이름이 밋밋할 때)', () => {
  assert.strictEqual(kindOf({ docName: '계약서', scope: '급여 계산 및 신고' }), '급여');
});

/* ── 거르기 ── */
test('★★ 갈래를 고르면 그 갈래만 나온다', () => {
  const all = [IT('1', '노무자문 위탁계약서'), IT('2', '급여관리업무 위임계약서'), IT('3', '용역계약서')];
  assert.deepStrictEqual(pick(all, '', '자문', true).map((x) => x.id), ['1']);
  assert.deepStrictEqual(pick(all, '', '급여', true).map((x) => x.id), ['2']);
  assert.strictEqual(pick(all, '', '전체', true).length, 3);
});

test('★★ 이미 쓴 계약서는 «기본으로» 안 나온다', () => {
  const all = [IT('1', '위임계약서'), IT('2', '위임계약서', { used: { at: 1, where: '푸른이알피 계약 — 가나상사' } })];
  assert.deepStrictEqual(pick(all, '', '전체', false).map((x) => x.id), ['1'], '이미 쓴 것이 아직 나온다');
});

test('★★ 그래도 «도로 볼 수» 있다 (잘못 붙였거나 계약이 깨진 것도 있다)', () => {
  const all = [IT('1', '위임계약서'), IT('2', '위임계약서', { used: { at: 1 } })];
  assert.strictEqual(pick(all, '', '전체', true).length, 2, '감추기만 해야 하는데 아예 없앤다');
});

test('★ 표만 있고 «언제»가 없으면 쓴 것으로 안 본다', () => {
  const all = [IT('1', '위임계약서', { used: {} })];
  assert.strictEqual(pick(all, '', '전체', false).length, 1, '빈 표를 「썼다」로 읽는다');
});

test('★ 찾기 칸과 갈래가 «함께» 걸린다', () => {
  const all = [IT('1', '노무자문 위탁계약서'), IT('2', '노무자문 위탁계약서')];
  all[0].fields.company = '가나상사'; all[1].fields.company = '다라상사';
  assert.deepStrictEqual(pick(all, '가나', '자문', true).map((x) => x.id), ['1']);
  assert.strictEqual(pick(all, '가나', '급여', true).length, 0);
});

test('★★ 갈래마다 «몇 장»인지 센다 — 0장이면 눌러 보지 않아도 된다', () => {
  const all = [IT('1', '노무자문 위탁계약서'), IT('2', '급여관리업무 위임계약서'),
    IT('3', '위임계약서', { used: { at: 1 } })];
  const c = counts(all, '', false);
  assert.strictEqual(c['전체'], 2, '감춘 것을 세고 있다');
  assert.strictEqual(c['자문'], 1);
  assert.strictEqual(c['급여'], 1);
  assert.strictEqual(c['위임'], 0);
  const c2 = counts(all, '', true);
  assert.strictEqual(c2['위임'], 1, '도로 보면 세어야 한다');
});

test('빠진 값에도 죽지 않는다', () => {
  assert.deepStrictEqual(Array.from(pick(null, '', '전체', true)), []);
  assert.strictEqual(counts([], '', false)['전체'], 0);
});

/* ── 화면 ── */
test('★★ 「이미 썼다」 표를 목록까지 «들고 온다» (안 들고 오면 늘 다 보인다)', () => {
  const B = bare(SRC);
  assert.ok(/used: \(meta\.used && meta\.used\.at\) \? meta\.used : null/.test(B),
    '사진에서 used 를 안 가져온다');
});

test('★ 창이 갈래·감추기 규칙을 «쓴다»', () => {
  const fn = bare(cutBlock(SRC, 'function PhotoContractPickerModal(props){'));
  assert.ok(fn.indexOf('erpPhotoPick(all, q, kind, showUsed)') >= 0, '창이 새 규칙을 안 쓴다');
  assert.ok(fn.indexOf('erpPhotoKindCounts(all, q, showUsed)') >= 0, '갈래 수를 안 센다');
  assert.ok(fn.indexOf('erpPhotoFilter(all, q);') < 0, '옛 거르개가 남아 있다');
});

test('★★ 처음 열 때는 «감춘 채»로 연다', () => {
  const fn = bare(cutBlock(SRC, 'function PhotoContractPickerModal(props){'));
  assert.ok(/var us = useState\(false\); var showUsed = us\[0\]/.test(fn),
    '이미 쓴 것이 처음부터 다 보인다');
  assert.ok(/var ks = useState\('전체'\); var kind = ks\[0\]/.test(fn), '갈래가 「전체」로 안 시작한다');
});

test('★★ 몇 장을 «감췄는지» 적는다 (없다와 감췄다가 같아 보이면 안 된다)', () => {
  const B = bare(SRC);
  assert.ok(B.indexOf("'이미 쓴 것도 보기'") >= 0, '도로 보는 스위치가 없다');
  assert.ok(B.indexOf("'장 감춤)'") >= 0 || B.indexOf("장 감춤") >= 0, '몇 장 감췄는지 안 적는다');
});

test('★★ 이미 쓴 줄에 «어디에 썼는지»를 적는다', () => {
  const B = bare(SRC);
  /* ⚠ 「그 글자가 어딘가 있다」로 겨누면 앞에 false 를 붙여 꺼도, 글자를 title 에만 남겨도 통과한다.
     그리는 «조건»과 «붙는 글»을 함께 본다. */
  assert.ok(B.indexOf("(it.used && it.used.at) ? h('div', {") >= 0, '이미 썼다는 표가 꺼져 있다');
  assert.ok(B.indexOf("'📌 이미 씀' + (it.used.where") >= 0,
    '어디에 썼는지 안 적는다 — 잘못 붙인 것을 찾아갈 수 없다');
});
