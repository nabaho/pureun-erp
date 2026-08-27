/* 카드 「취소」의 짝 자동으로 찾기 + 휴대폰 연결은 권형하만 (2026-08-26 대표 지시)
 *
 * ⚠ 이 검사의 핵심: «찾기만 하고 스스로 지우지 않는다», 그리고 «모르면 안 고른다».
 *   엉뚱한 승인에 붙으면 지우면 안 될 지출이 지워진다 — 되돌리는 것은 되돌릴 수 없다.
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

const ctx = { console, String, Object, Array, Date, parseInt, window: {} };
vm.createContext(ctx);
vm.runInContext(cutRange(SRC, 'var PC_CORP_TOKENS =', '\n'), ctx);
vm.runInContext(cutBlock(SRC, 'function pcNormCo('), ctx);
vm.runInContext(cutBlock(SRC, 'function erpCoKey(s){'), ctx);
vm.runInContext(cutBlock(SRC, 'function erpCardCancelKey(memo){'), ctx);
vm.runInContext('var ERP_CANCEL_DAYS = 90;', ctx);
vm.runInContext(cutBlock(SRC, 'function erpCardCancelMatch(cancelRow, rows){'), ctx);
const match = ctx.erpCardCancelMatch;

const OK = (k, date, amount, memo, extra) =>
  Object.assign({ _k: k, src: 'card', cancel: false, date: date, amount: amount, memo: memo }, extra || {});
const CX = (k, date, amount, memo, extra) =>
  Object.assign({ _k: k, src: 'card', cancel: true, date: date, amount: amount, memo: memo }, extra || {});

test('★★ 앞선 승인 하나를 찾아 준다', () => {
  const rows = [OK('a1', '2026-08-25', 71700, '(주)루나'), CX('c1', '2026-08-26', 71700, '[취소] (주)루나')];
  const r = match(rows[1], rows);
  assert.strictEqual(r.state, 'one');
  assert.strictEqual(r.row._k, 'a1');
});

test('★★ 후보가 «여럿»이면 고르지 않는다 (찍으면 지우면 안 될 지출이 지워진다)', () => {
  const rows = [OK('a1', '2026-08-20', 71700, '(주)루나'), OK('a2', '2026-08-25', 71700, '(주)루나'),
    CX('c1', '2026-08-26', 71700, '[취소] (주)루나')];
  const r = match(rows[2], rows);
  assert.strictEqual(r.state, 'many', '하나를 찍어 골랐다');
  assert.strictEqual(r.row, null);
  assert.strictEqual(r.all.length, 2);
});

test('★★ 금액이 다르면 짝이 아니다', () => {
  const rows = [OK('a1', '2026-08-25', 71000, '(주)루나'), CX('c1', '2026-08-26', 71700, '[취소] (주)루나')];
  assert.strictEqual(match(rows[1], rows).state, 'none');
});

test('★★ 가게 이름이 다르면 짝이 아니다', () => {
  const rows = [OK('a1', '2026-08-25', 71700, '스타벅스'), CX('c1', '2026-08-26', 71700, '[취소] (주)루나')];
  assert.strictEqual(match(rows[1], rows).state, 'none');
});

test('★★ 취소보다 «뒤»에 있는 승인은 짝이 아니다', () => {
  const rows = [OK('a1', '2026-08-27', 71700, '(주)루나'), CX('c1', '2026-08-26', 71700, '[취소] (주)루나')];
  assert.strictEqual(match(rows[1], rows).state, 'none', '나중 승인을 되돌릴 수는 없다');
});

test('★ 같은 날 승인·취소는 짝이 된다 (같은 날 취소가 흔하다)', () => {
  const rows = [OK('a1', '2026-08-26', 71700, '(주)루나'), CX('c1', '2026-08-26', 71700, '[취소] (주)루나')];
  assert.strictEqual(match(rows[1], rows).state, 'one');
});

test('★★ 90일보다 오래된 승인은 짝이 아니다', () => {
  const rows = [OK('a1', '2026-05-01', 71700, '(주)루나'), CX('c1', '2026-08-26', 71700, '[취소] (주)루나')];
  assert.strictEqual(match(rows[1], rows).state, 'none');
  const near = [OK('a2', '2026-06-01', 71700, '(주)루나'), CX('c2', '2026-08-26', 71700, '[취소] (주)루나')];
  assert.strictEqual(match(near[1], near).state, 'one', '90일 안은 짝이어야 한다');
});

test('★★ 한 승인이 두 취소를 갚을 수는 없다', () => {
  const rows = [OK('a1', '2026-08-25', 71700, '(주)루나'),
    CX('c1', '2026-08-26', 71700, '[취소] (주)루나', { pairedWith: 'a1' }),
    CX('c2', '2026-08-27', 71700, '[취소] (주)루나')];
  assert.strictEqual(match(rows[2], rows).state, 'none', '이미 갚은 승인을 또 쓴다');
  assert.strictEqual(match(rows[1], rows).state, 'one', '자기가 이어 둔 승인은 그대로 보여야 한다');
});

test('★ 「[취소]」 머리를 떼고 이름을 견준다', () => {
  assert.strictEqual(ctx.erpCardCancelKey('[취소] (주)루나'), ctx.erpCardCancelKey('(주)루나'));
  assert.strictEqual(ctx.erpCardCancelKey('[취소] 합자회사 루나'), ctx.erpCardCancelKey('(자)루나'));
});

test('★★ 취소가 아니거나 카드가 아니면 아예 안 찾는다', () => {
  const rows = [OK('a1', '2026-08-25', 71700, '(주)루나')];
  assert.strictEqual(match(OK('x', '2026-08-26', 71700, '(주)루나'), rows).state, 'none');
  assert.strictEqual(match(CX('x', '2026-08-26', 71700, '(주)루나', { src: 'bank' }), rows).state, 'none');
});

test('빠진 값에도 죽지 않는다', () => {
  assert.strictEqual(match(null, []).state, 'none');
  assert.strictEqual(match(CX('c', '', 0, ''), []).state, 'none');
  assert.strictEqual(match(CX('c', '2026-08-26', 71700, '(주)루나'), null).state, 'none');
});

/* ── 화면 ── */
test('★★ 출금 표에 짝을 «적는다» (찾아만 놓고 안 보여 주면 소용없다)', () => {
  const B = bare(SRC);
  assert.ok(B.indexOf('expPair[row._k] = erpCardCancelMatch(row, expAll);') >= 0, '줄마다 안 찾는다');
  assert.ok(B.indexOf("'↔ ' + String(pm.row.date||'').slice(5,10) + ' 승인과 짝'") >= 0, '짝을 안 적는다');
  assert.ok(B.indexOf("'↔ 짝 후보 ' + pm.all.length + '건 — 골라야 합니다'") >= 0, '여럿일 때를 안 알려 준다');
  assert.ok(B.indexOf("'↔ 짝을 못 찾았습니다'") >= 0, '못 찾았을 때를 안 알려 준다');
});

test('★★ 찾기만 하고 «스스로 지우지» 않는다', () => {
  const B = bare(SRC);
  const i = B.indexOf('var expPair = {};');
  const g = B.slice(i, i + 700);
  assert.ok(g.indexOf('dbUpsert') < 0 && g.indexOf('dbSet') < 0 && g.indexOf('dbRemove') < 0,
    '짝을 찾으면서 저장까지 하고 있다 — 되돌리는 것은 되돌릴 수 없다');
});

test('★ 줄마다 «한 번만» 찾는다 (표를 그릴 때마다 다시 찾지 않게)', () => {
  const B = bare(SRC);
  assert.strictEqual(B.split('erpCardCancelMatch(row, expAll)').length - 1, 1,
    '표 그리는 자리에서도 다시 찾고 있다');
});

/* ── 휴대폰 연결은 권형하만 ── */
test('★★ 「휴대폰 연결」·「문자 가져오기」는 대표만 보인다', () => {
  const B = bare(SRC);
  const p = B.indexOf('startHanaSmsPair();},');
  const q = B.indexOf('importHanaSms();},');
  assert.ok(p >= 0 && q >= 0, '단추를 못 찾았다');
  assert.ok(B.slice(Math.max(0, p - 260), p).indexOf('_meNow().isOwner &&') >= 0, '연결 단추가 모두에게 보인다');
  assert.ok(B.slice(Math.max(0, q - 260), q).indexOf('_meNow().isOwner &&') >= 0, '가져오기 단추가 모두에게 보인다');
});

test('★★ 사번을 «못 박지» 않는다 (사번은 바뀔 수 있다)', () => {
  const B = bare(SRC);
  const p = B.indexOf('startHanaSmsPair();},');
  const near = B.slice(Math.max(0, p - 260), p + 60);
  assert.strictEqual(near.indexOf("'P-001'"), -1, '사번을 코드에 박았다');
  assert.strictEqual(near.indexOf('권형하'.repeat(1) + "'"), -1, '이름을 코드에 박았다');
});

test('isOwner 는 «대표(총괄)» 한 사람이다', () => {
  const B = bare(SRC);
  assert.ok(/isOwner = \(u\.role==='admin'\)/.test(B), 'isOwner 의 뜻이 바뀌었다 — 단추가 열릴 수 있다');
});
