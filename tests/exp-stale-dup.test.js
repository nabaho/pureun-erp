/* 겹친 줄 — 파서를 고쳐 «같은 문자»가 두 벌로 들어온 것 (2026-08-29)
 *
 * 무슨 일이 있었나: 카드 적요에서 「가능액」을 걷어냈다. 적요가 바뀌자
 * 줄의 열쇠(id = 적요를 재료로 만든다)가 달라졌고, 지난 문자를 다시 가져오자
 * «같은 문자»가 새 줄로 또 들어왔다 — 카드 26건이 두 벌, 합계 1,176,450원 부풀었다.
 *
 * ★ 고칠 곳 둘: ①서버는 «원문 해시»로 중복을 본다(파서를 고쳐도 안 변한다)
 *              ②화면은 이미 들어온 두 벌을 «치울 수» 있어야 한다
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const R = path.join(__dirname, '..');
const ERP = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');
const FN = fs.readFileSync(path.join(R, 'functions', 'index.js'), 'utf8');
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
function cutBlock(src, header) {
  const i = src.indexOf(header);
  assert.ok(i >= 0, '못 찾음: ' + header);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('닫는 괄호 없음: ' + header);
}
function cutLine(src, pre) {
  const i = src.indexOf(pre);
  assert.ok(i >= 0, '못 찾음: ' + pre);
  return src.slice(i, src.indexOf('\n', i));
}

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(cutLine(ERP, 'var ERP_DUP_TAIL ='), ctx);
vm.runInContext(cutBlock(ERP, 'function erpStaleDupPairs(rows){'), ctx);
const pairs = ctx.erpStaleDupPairs;

const ROW = (memo, amount, date, extra) =>
  Object.assign({ memo: memo, amount: amount, date: date, src: 'card', cancel: false }, extra || {});

test('★★ 「가능액」이 붙은 쪽을 «치울 것»으로, 깨끗한 쪽을 «남길 것»으로 고른다', () => {
  const got = pairs([
    ROW('롯데리아천 가능액', 52200, '2026-07-31 11:48'),
    ROW('롯데리아천', 52200, '2026-07-31 11:48'),
  ]);
  assert.strictEqual(got.length, 1, '겹친 짝을 못 찾는다');
  assert.strictEqual(got[0].drop.memo, '롯데리아천 가능액', '★ 깨끗한 쪽을 치우면 안 된다');
  assert.strictEqual(got[0].keep.memo, '롯데리아천');
});

test('★★ 금액이 다르면 «짝이 아니다»', () => {
  assert.strictEqual(pairs([
    /* ⚠ 날짜를 «같게» 둔다 — 날짜까지 다르면 금액 검사를 떼어 내도 날짜가 막아 준다.
       그러면 이 검사는 금액을 지키는 것이 아니라 날짜를 지키는 셈이 된다. */
    ROW('버거앤타코 가능액', 14800, '2026-08-03 21:01'),
    ROW('버거앤타코', 14900, '2026-08-03 21:01'),
  ]).length, 0, '★ 금액이 다른 «다른 결제»를 지운다');
});

test('★★ 날짜가 다르면 «짝이 아니다»', () => {
  assert.strictEqual(pairs([
    ROW('리틀방콕 가능액', 11000, '2026-08-02 18:24'),
    ROW('리틀방콕', 11000, '2026-08-03 18:44'),
  ]).length, 0, '★ 다른 날 같은 금액의 결제를 지운다');
});

test('★★ 취소와 승인은 «짝이 아니다»', () => {
  assert.strictEqual(pairs([
    ROW('버거앤타코 가능액', 14800, '2026-08-03 21:03', { cancel: true }),
    ROW('버거앤타코', 14800, '2026-08-03 21:03', { cancel: false }),
  ]).length, 0, '★★ 취소를 승인의 겹침으로 보면 취소가 사라진다');
});

test('★★ 꼬리가 «아는 군더더기»가 아니면 짝이 아니다', () => {
  assert.strictEqual(pairs([
    ROW('스타벅스 2호점', 5000, '2026-08-01 10:00'),
    ROW('스타벅스', 5000, '2026-08-01 10:00'),
  ]).length, 0,
  '★★ 「스타벅스」와 「스타벅스 2호점」은 다른 가게다 — 넓게 잡으면 진짜 기록이 지워진다');
});

test('★ 적요가 아주 같으면 손대지 않는다 (여기서 볼 일이 아니다)', () => {
  assert.strictEqual(pairs([
    ROW('리틀방콕', 11000, '2026-08-02 18:24'),
    ROW('리틀방콕', 11000, '2026-08-02 18:24'),
  ]).length, 0);
});

test('★ 통장 줄과 카드 줄은 «짝이 아니다»', () => {
  assert.strictEqual(pairs([
    ROW('아무개 가능액', 1000, '2026-08-01 10:00', { src: 'card' }),
    ROW('아무개', 1000, '2026-08-01 10:00', { src: 'bank' }),
  ]).length, 0);
});

test('★ 빈 목록에도 안 죽는다', () => {
  assert.strictEqual(pairs(null).length, 0);
  assert.strictEqual(pairs([]).length, 0);
});

/* ── 서버: 원문이 진짜 열쇠다 ── */
test('★★ 서버가 «원문 해시»로 이미 담은 것을 알아본다', () => {
  const ing = bare(cutBlock(FN, 'if (action === "ingest") {'));
  assert.ok(/orderByChild\("rawHash"\)\.equalTo\(tx\.rawHash\)/.test(ing),
    '★★ 적요로 만든 id 로만 보면, 파서를 고칠 때마다 같은 문자가 새 줄로 또 들어온다');
  assert.ok(/sameRaw && sameRaw\.exists\(\)/.test(ing), '★ 찾아 놓고 안 쓴다');
  /* 원문 검사가 «저장보다 먼저» 와야 한다 */
  assert.ok(ing.indexOf('rawHash"').valueOf() < ing.indexOf('db.ref("hanaSmsBridge").update'),
    '★ 저장한 «뒤에» 보면 소용이 없다');
});

/* ── 화면: 치울 수 있는가 ── */
test('★★ 치우기 단추는 «있을 때만» 나오고, 묻고 나서 치운다', () => {
  const src = bare(ERP);
  assert.ok(/expDupPairs\.length>0 && h\('button'/.test(src),
    '★ 겹친 것이 없는데도 단추가 있으면, 누를 일 없는 단추가 늘 자리를 차지한다');
  assert.ok(/await popConfirm\('겹친 줄 ' \+ ps\.length/.test(src),
    '★★ 묻지 않고 치우면, 잘못 골랐을 때 되돌릴 틈이 없다');
  assert.ok(/removeRow\(p\.drop\._k,'exp'\)/.test(src),
    '★ 치울 쪽(drop)이 아니라 남길 쪽을 지우면 큰일이다');
});

test('★ 무엇을 치우는지 «보여 주고» 묻는다', () => {
  const src = bare(ERP);
  assert.ok(/p\.drop\.memo \+ '」 → 「' \+ p\.keep\.memo/.test(src),
    '★ 어느 줄이 어느 줄로 합쳐지는지 안 보여 주면, 세어 보지도 못하고 누르게 된다');
});
