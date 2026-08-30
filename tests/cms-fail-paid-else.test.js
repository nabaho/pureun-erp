'use strict';
/* 출금실패가 «입금 확인되면» 손볼 것에서 빠진다 — 대표 2026-08-30
     「출금실패는 입금된 부분 확인되면 자동으로 정리되게 해야 한다」

   자동이체가 실패해도 업체가 계좌이체로 따로 넣어 주는 일이 흔하다. 그러면
   그 달 자문료 입금표시가 «이미» 있는데 CMS 목록에는 「❌ 미수로 남음」이 남아,
   손볼 것 75건처럼 보인다.

   ★★ 줄을 «지우지 않는다» — 이 검사의 절반이 그것을 못 박는다.
     CMS 출금이 실패한 것은 사실이고, 나중에 「왜 이 달 자동이체가 안 됐지」를
     물을 때 그 기록이 있어야 한다. 숫자에서만 뺀다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn.js');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/* ★ 이름 다듬기는 «진짜 것»을 잘라 쓴다. 흉내 내어 적었더니 지우는 «차례»가 달라
     「(주)이음홀딩스」와 「주식회사 이음홀딩스」를 다른 곳으로 봤다 — 실제로 걸렸다.
     흉내는 그 함수가 바뀔 때 검사만 옛 규칙을 보게 만든다. */
const ctx = {};
vm.createContext(ctx);
vm.runInContext(
  cutFn(app, 'function erpNormName(') + '\n'
  + cutFn(app, 'function erpNbPaidKeys(') + '\n' + cutFn(app, 'function erpNbRowYm(') + '\n'
  + cutFn(app, 'function erpNbMarkPaid(') + '\n' + cutFn(app, 'function erpNbStat(') + '\n'
  + 'this.mark = erpNbMarkPaid; this.stat = erpNbStat; this.ymOf = erpNbRowYm;', ctx);
const { mark, stat, ymOf } = ctx;

const FAIL = (o) => Object.assign(
  { _k: 'x', status: 'fail', name: '이음홀딩스', amount: 165000, wdate: '2026-07-30', setdate: '' }, o);
const OK = (o) => Object.assign(
  { _k: 'o', status: 'ok', name: '천일테크', amount: 220000, wdate: '2026-08-05', setdate: '2026-08-06' }, o);
const PAID = (nm, ymd) => ({ sourceKind: 'company', companyName: nm, date: ymd, amount: 165000 });

/* ══════ ① 입금이 확인되면 손볼 것에서 뺀다 ══════ */

test('★★ 실패했지만 그 달 자문료 입금이 있으면 「손볼 것」에서 뺀다', () => {
  const rows = [FAIL({})];
  const n = mark(rows, [PAID('이음홀딩스', '2026-07-15')]);
  assert.equal(n, 1, '★ 입금이 있는데 못 알아봤습니다');
  assert.equal(rows[0].paidElse, 1);
  const st = stat(rows);
  assert.equal(st.fail, 0, '★ 손볼 것에 그대로 남아 있습니다');
  assert.equal(st.paidElse, 1, '★ 몇 건이 정리됐는지 안 보여 줍니다');
});

test('★★ 줄을 «지우지 않는다» — 출금이 실패한 것은 사실이고 기록이 남아야 한다', () => {
  const rows = [FAIL({})];
  mark(rows, [PAID('이음홀딩스', '2026-07-15')]);
  assert.equal(rows.length, 1, '★ 줄이 사라졌습니다');
  assert.equal(rows[0].status, 'fail', '★ 실패였다는 사실이 지워졌습니다');
  assert.equal(stat(rows).total, 1, '★ 전체 수에서도 빠졌습니다');
});

test('★ 업체를 이어 준 이름(co)이 있으면 그것으로 본다 — 회원명과 업체명이 다를 수 있다', () => {
  const rows = [FAIL({ name: '이음홀딩스', co: { name: '(주)이음홀딩스' } })];
  mark(rows, [PAID('주식회사 이음홀딩스', '2026-07-01')]);
  assert.equal(rows[0].paidElse, 1, '★ ㈜·주식회사 표기 차이로 못 찾았습니다');
});

/* ══════ ② 아무거나 정리하면 안 된다 ══════ */

test('★★ 다른 달 입금으로는 정리하지 않는다 — 7월 미수가 8월 입금으로 지워지면 안 된다', () => {
  const rows = [FAIL({ wdate: '2026-07-30' })];
  mark(rows, [PAID('이음홀딩스', '2026-08-15')]);
  assert.equal(rows[0].paidElse, 0, '★ 다른 달 입금으로 미수가 사라집니다');
  assert.equal(stat(rows).fail, 1);
});

test('★★ 다른 업체 입금으로는 정리하지 않는다', () => {
  const rows = [FAIL({})];
  mark(rows, [PAID('씨지아이', '2026-07-15')]);
  assert.equal(rows[0].paidElse, 0, '★ 남의 입금으로 미수가 사라집니다');
});

test('★ 업체입금(자문료)이 아닌 기록으로는 정리하지 않는다', () => {
  const rows = [FAIL({})];
  mark(rows, [{ sourceKind: 'case', companyName: '이음홀딩스', date: '2026-07-15' }]);
  assert.equal(rows[0].paidElse, 0, '★ 사건 수임료로 자문료 미수가 지워집니다');
});

test('★ 성공·대기 줄은 건드리지 않는다', () => {
  const rows = [OK({}), FAIL({ status: 'pending' })];
  mark(rows, [PAID('천일테크', '2026-08-06')]);
  assert.equal(rows[0].paidElse, 0, '★ 성공 줄에 표가 붙었습니다');
  const st = stat(rows);
  assert.equal(st.ok, 1);
  assert.equal(st.pending, 1);
  assert.equal(st.paidElse, 0);
});

test('날짜를 모르는 줄은 정리하지 않는다 — 어느 달인지 못 가린다', () => {
  const rows = [FAIL({ wdate: '', setdate: '' })];
  mark(rows, [PAID('이음홀딩스', '2026-07-15')]);
  assert.equal(rows[0].paidElse, 0);
});

test('정산예정일이 있으면 그것을, 없으면 출금일을 본다 (실패 줄은 정산예정일이 「미정」이 많다)', () => {
  assert.equal(ymOf({ setdate: '2026-08-06', wdate: '2026-07-30' }), '2026-08');
  assert.equal(ymOf({ setdate: '', wdate: '2026-07-30' }), '2026-07');
  assert.equal(ymOf({}), '');
});

test('다시 표시해도 늘어나지 않는다 — 두 번 눌러도 셈이 같아야 한다', () => {
  const rows = [FAIL({})];
  const inc = [PAID('이음홀딩스', '2026-07-15')];
  mark(rows, inc); mark(rows, inc);
  assert.equal(stat(rows).paidElse, 1, '★ 두 번 세었습니다');
});

/* ══════ ③ 화면이 그것을 보여 준다 ══════ */

test('★ 업체를 이은 «뒤에» 표시한다 — 이름을 알아야 그 달 입금을 찾는다', () => {
  const hits = bare(app).split('erpNbMarkPaid(').length - 1;
  assert.ok(hits >= 3, '★ 표시하는 자리가 모자랍니다 (만든 곳 + 부르는 곳 둘)');
  /* 두 자리 모두 erpNicebillAttachCo 뒤에 있어야 한다 */
  const code = bare(app);
  [/erpNicebillAttachCo\(rs\)[\s\S]{0,220}?erpNbMarkPaid\(rs/,
   /erpNicebillAttachCo\(_rows\)[\s\S]{0,220}?erpNbMarkPaid\(_rows/].forEach((re, i) => {
    assert.match(code, re, '★ ' + (i + 1) + '번째 자리에서 업체를 잇기 전에 표시하고 있습니다');
  });
});

test('★★ 화면에 「몇 건이 정리됐는지」 보여 준다 — 숫자만 줄면 사람이 못 믿는다', () => {
  /* ⚠ 글자만 보면 「그리지 않게」 막아 놔도 통과한다 — 실제로 그렇게 새어 나갔다
       (조건을 false 로 바꿔 보고서야 알았다). «언제 그리는가»까지 본다. */
  assert.match(bare(app), /nbStat\.paidElse>0 && nbChip\('✔ 입금 확인 '\+nbStat\.paidElse\+'건/,
    '★ 정리된 건수를 안 보여 줍니다 — 「75건이 갑자기 63건」이 됩니다');
  assert.match(app, /✔ 입금 확인됨/, '★ 줄에 그 표가 안 붙습니다');
});

test('★ 「출금실패만 보기」에서도 빠진다 — 표와 목록이 어긋나면 안 된다', () => {
  assert.match(bare(app), /nbFailOnly \? g\.rows\.filter\(function\(r\)\{ return r\.status==='fail' && !r\.paidElse; \}\)/,
    '★ 표는 63건인데 목록은 75줄이 나옵니다');
});
