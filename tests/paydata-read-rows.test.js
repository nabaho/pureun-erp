'use strict';
// 판독 결과 → 값 줄 정규화. 실행: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadStore() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-paydata-store.js'), 'utf8');
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'store.js' }).runInContext(sandbox);
  return sandbox.window.PuPaydataStore;
}

test('★ 서랍 종류마다 판독 방식이 정해진다', () => {
  const S = loadStore();
  assert.equal(S.readKindFor('attend'), 'timesheet');
  assert.equal(S.readKindFor('ledger'), 'wage');
  assert.equal(S.readKindFor('etc'), 'notice');
});

test('★ 근로계약서·우리 산출물은 판독하지 않는다', () => {
  const S = loadStore();
  assert.equal(S.readKindFor('contract'), null, '계약서에서 값을 뽑지 않습니다');
  assert.equal(S.readKindFor('output'), null, '우리가 만든 것은 다시 읽을 이유가 없습니다');
  assert.equal(S.readKindFor(''), null);
});

test('★ 근태표: 날짜 배열을 일수로 바꾼다', () => {
  const S = loadStore();
  const parsed = { rows: [{ name: '배영승', paid: [1, 5, 25], off: [11, 19, 28], adj: '+4일', note: '' }] };
  const rows = S.rowsFromRead('timesheet', parsed);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, '배영승');
  const m = {};
  rows[0].pairs.forEach(p => { m[p.item] = p.value; });
  assert.equal(m['유급일수'], '3일');
  assert.equal(m['휴무일수'], '3일');
  assert.equal(m['가감'], '+4일');
});

test('근태표: 빈 칸은 항목을 만들지 않는다 — 0 과 「없음」은 다르다', () => {
  const S = loadStore();
  const parsed = { rows: [{ name: '이산다라', paid: [], off: [], adj: '', note: '정상근무' }] };
  const rows = S.rowsFromRead('timesheet', parsed);
  const items = rows[0].pairs.map(p => p.item).join(',');
  assert.equal(items, '비고', '없는 항목까지 0 으로 만들면 안 됩니다: ' + items);
  assert.equal(rows[0].pairs[0].value, '정상근무');
});

test('★ 급여대장·알림은 이미 맞는 모양이라 그대로 온다', () => {
  const S = loadStore();
  const parsed = { rows: [{ name: '홍길동', pairs: [{ item: '기본급', value: '3,200,000' }] }] };
  ['wage', 'notice'].forEach(k => {
    const rows = S.rowsFromRead(k, parsed);
    assert.equal(rows[0].name, '홍길동');
    assert.equal(rows[0].pairs[0].item, '기본급');
    assert.equal(rows[0].pairs[0].value, '3,200,000');
  });
});

test('이름 없는 줄과 항목 없는 줄은 버린다', () => {
  const S = loadStore();
  const parsed = { rows: [
    { name: '', pairs: [{ item: '기본급', value: '1' }] },      // 이름이 없다 → 버린다
    { name: '홍길동', pairs: [] },                               // 항목이 하나도 없다 → 버린다
    { name: '김철수', pairs: [{ item: '기본급', value: '2' }] }  // 이것만 남는다
  ] };
  const rows = S.rowsFromRead('wage', parsed);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, '김철수');
});

test('자료가 없어도 터지지 않는다', () => {
  const S = loadStore();
  assert.equal(S.rowsFromRead('timesheet', null).length, 0);
  assert.equal(S.rowsFromRead('wage', {}).length, 0);
  assert.equal(S.rowsFromRead('없는방식', { rows: [{ name: 'a', pairs: [] }] }).length, 0);
});
