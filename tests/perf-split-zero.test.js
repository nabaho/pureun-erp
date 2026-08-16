/* 「성과 미반영」이 지급액 0원 건도 잡는다 (2026-08-16 대표 결정: 세어서 보여주기만)
   ★ 전에는 이런 건이 어디에도 안 걸렸다 — 기록은 있고 금액만 0이라 조용히 통과했다. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');
const _s = SRC.indexOf('function IncomeUnmatchedTab(');
const _e = SRC.indexOf('function IncomePendingTab(', _s);
assert.ok(_s > 0 && _e > _s, '성과 미반영 화면을 찾지 못했다');
const TAB = SRC.slice(_s, _e);

/* 글자만 보지 말고 실제로 돌려 본다 */
const _cs = SRC.indexOf('function erpPerfPaidZero(');
assert.ok(_cs > 0, 'erpPerfPaidZero 를 찾지 못했다');
const CODE = SRC.slice(_cs, SRC.indexOf('\n}', _cs) + 2);

function zero(fi) {
  const ctx = { Array, Math };
  vm.createContext(ctx);
  vm.runInContext(CODE + '\n;__r = erpPerfPaidZero(__fi);', Object.assign(ctx, { __fi: fi, __r: null }));
  return ctx.__r;
}

test('분배 기록이 있는데 금액이 전부 0이면 잡는다', () => {
  assert.strictEqual(zero({ perfShares: [{ amount: 0 }, { amount: 0 }] }), true);
});

test('한 사람이라도 받으면 안 잡는다', () => {
  assert.strictEqual(zero({ perfShares: [{ amount: 0 }, { amount: 150000 }] }), false);
});

test('분배 기록이 아예 없는 건은 여기서 잡지 않는다', () => {
  /* 그건 「분배 누락」이라는 다른 무리다 — 섞으면 무엇을 고쳐야 할지 알 수 없다 */
  assert.strictEqual(zero({ perfShares: [] }), false);
  assert.strictEqual(zero({}), false);
  assert.strictEqual(zero(null), false);
});

test('마이너스 조정으로 0이 된 것도 잡는다', () => {
  assert.strictEqual(zero({ perfShares: [{ amount: 100 }, { amount: -100 }] }), true);
});

test('목록이 0원 건을 걸러 담는다', () => {
  const filt = TAB.slice(TAB.indexOf('var unmatched'), TAB.indexOf('// 사유별 분류'));
  assert.strictEqual(/erpPerfPaidZero\(fi\)/.test(filt), true);
});

test('「지급액 0원」이 제 무리로 나뉜다', () => {
  const cls = TAB.slice(TAB.indexOf('function classify('), TAB.indexOf('function classify(') + 900);
  assert.strictEqual(/'💸 지급액 0원'/.test(cls), true);
  // 명시적 제외보다 «뒤» 여야 한다 — 일부러 뺀 건을 0원으로 잘못 부르면 안 된다
  assert.ok(cls.indexOf('명시적 제외') < cls.indexOf('지급액 0원'));
});
