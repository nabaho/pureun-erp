/* 급여 출금 → 인사관리 급여 잇기 (대표 지시 2026-08-29)
 *
 * 대표: 「12월 급여로 표시되어 있기 때문에 인사관리에서 12월 급여부분과
 *        연결시켜야 한다 반드시」
 *
 * ★ 어려운 곳은 «해»다. 12월 급여가 1월 5일에 나간다 —
 *   나간 날로 달을 정하면 온통 어긋난다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ERP = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');
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

/* 실제로 돌려 본다 — 글자로만 보면 해가 맞는지 알 수 없다. */
let PAYROLLS = [];
let NETS = {};
const ctx = {
  window: {}, console,
  dbGet: (k, d) => (k === 'payroll_monthly' ? PAYROLLS : d),
  calcPayroll: (r) => ({ netPay: NETS[r.id] || 0 }),
};
vm.createContext(ctx);
['function erpPayrollFromMemo(', 'function erpFindPayroll(', 'function erpPayrollLink(']
  .forEach((h) => vm.runInContext(cutBlock(ERP, h), ctx));
const fromMemo = ctx.erpPayrollFromMemo;
const link = ctx.erpPayrollLink;

/* ── 적요 읽기 ── */
test('★★ 12월 급여가 «1월에» 나가면 지난해 12월이다', () => {
  /* ⚠ 상자(vm) 안에서 만든 객체라 deepStrictEqual 은 «생김새»가 달라 틀렸다고 한다.
     볼 것은 칸의 값이다. */
  const g = fromMemo('박한별_12월급여', '2026-01-05 17:16:01');
  assert.strictEqual(g.ym, '2025-12', '★ 나간 날로 달을 정하면 12월 급여가 1월 급여가 된다');
  assert.strictEqual(g.name, '박한별');
  assert.strictEqual(g.month, 12);
});

test('★★ 같은 달에 나가면 그 해 그 달이다', () => {
  const g2 = fromMemo('김보람_1월급여', '2026-01-25');
  assert.strictEqual(g2.ym, '2026-01');
  assert.strictEqual(g2.name, '김보람');
});

test('★ 이름에 숫자가 붙어도 이름을 다 가져온다', () => {
  assert.strictEqual(fromMemo('홍길동2_3월급여', '2026-03-25').name, '홍길동2');
});

test('★ 급여가 아닌 적요는 «건드리지 않는다»', () => {
  assert.strictEqual(fromMemo('CMS사용료-H', '2026-01-05'), null);
  assert.strictEqual(fromMemo('12월 문자수수료', '2026-01-05'), null,
    '★ 수수료를 급여로 읽으면 엉뚱한 사람에게 붙는다');
  assert.strictEqual(fromMemo('', '2026-01-05'), null);
});

test('★ 날짜가 없으면 «해를 지어내지 않는다»', () => {
  assert.strictEqual(fromMemo('박한별_12월급여', ''), null);
});

/* ── 인사관리와 잇기 ── */
const ROW = (memo, amount, date) => ({ memo: memo, amount: amount, date: date || '2026-01-05' });

test('★★ 그 달 그 사람의 급여를 찾아 «금액까지» 맞춘다', () => {
  PAYROLLS = [{ id: 'p1', ym: '2025-12', empName: '박한별', empSid: 'A-1' }];
  NETS = { p1: 6433497 };
  const r = link(ROW('박한별_12월급여', 6433497));
  assert.strictEqual(r.state, 'ok');
  assert.strictEqual(r.ym, '2025-12');
  assert.strictEqual(r.netPay, 6433497);
});

test('★★ 금액이 다르면 «다르다고» 한다 — 맞춰 주지 않는다', () => {
  PAYROLLS = [{ id: 'p1', ym: '2025-12', empName: '박한별' }];
  NETS = { p1: 6433497 };
  const r = link(ROW('박한별_12월급여', 6400000));
  assert.strictEqual(r.state, 'gap',
    '★ 금액이 달라도 이어 버리면, 한 원 어긋난 급여를 아무도 못 본다');
  assert.strictEqual(r.netPay, 6433497, '장부 금액을 함께 알려 줘야 견줄 수 있다');
});

test('★★ 같은 이름이 여럿이면 «고르지 않는다»', () => {
  PAYROLLS = [{ id: 'p1', ym: '2025-12', empName: '박한별' },
    { id: 'p2', ym: '2025-12', empName: '박한별' }];
  NETS = { p1: 100, p2: 200 };
  const r = link(ROW('박한별_12월급여', 100));
  assert.strictEqual(r.state, 'many',
    '★★ 찍어서 이으면 «남의 급여»에 이 출금이 붙는다');
  assert.strictEqual(r.rec, null);
});

test('★ 그 달 기록이 없으면 «없다»고 한다', () => {
  PAYROLLS = [{ id: 'p1', ym: '2026-01', empName: '박한별' }];
  NETS = { p1: 1 };
  assert.strictEqual(link(ROW('박한별_12월급여', 1)).state, 'none');
});

test('★ 급여가 아닌 줄은 아예 «표를 안 단다»', () => {
  PAYROLLS = []; NETS = {};
  assert.strictEqual(link(ROW('CMS사용료-H', 33000)), null);
});

/* ── 화면·저장 ── */
test('★★ 줄마다 «한 번만» 찾는다 (표를 그릴 때마다 찾으면 안 된다)', () => {
  const src = bare(ERP);
  assert.ok(/var expPayroll = \{\};/.test(src) && /expPayroll\[row\._k\] = erpPayrollLink\(row\)/.test(src),
    '★ 미리 찾아 두지 않으면 398줄짜리 표에서 인사관리 전체를 398번 훑는다');
});

test('★★ 등록할 때 «맞은 것만» 잇는다', () => {
  const fn = bare(cutBlock(ERP, '  function saveExpense(row, cat){'));
  assert.ok(/_pl\.state === 'ok'/.test(fn),
    '★★ 금액이 어긋나거나 이름이 여럿인데도 이어 버린다 — 틀린 연결은 없느니만 못하다');
  assert.ok(/payroll:_payroll/.test(fn),
    '★ 이어 놓고 저장을 안 한다 — 출금관리에서 보면 어느 달 급여인지 알 수 없다');
});

test('★ 화면이 네 갈래를 «모두» 말해 준다', () => {
  const src = bare(ERP);
  ['👤 인사 ', '금액 다름', '골라야 합니다', '기록 없음'].forEach((w) => {
    assert.ok(src.indexOf(w) >= 0, '「' + w + '」를 안 알려 준다');
  });
});
