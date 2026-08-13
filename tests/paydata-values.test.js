'use strict';
// 값 층 — 원본과 값을 두 층으로 나눈다(설계서 3장). 실행: node --test tests/*.test.js
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
  new vm.Script(src, { filename: 'pu-paydata-store.js' }).runInContext(sandbox);
  const S = sandbox.window.PuPaydataStore;
  S.init({ uid: 'U1' });
  return S;
}

const PARSED = {
  company: '화담원', period: '2026-08', docName: '급여대장',
  rows: [
    { name: '홍길동', pairs: [{ item: '기본급', value: '3,200,000' }, { item: '실수령', value: '2,950,000' }] },
    { name: '김철수', pairs: [{ item: '기본급', value: '2,800,000' }] }
  ]
};

test('★ 사진 한 장에 근로자가 여럿이면 값도 여러 줄이 나온다 — 한 장=한 줄이 아니다', () => {
  const S = loadStore();
  const rows = S.buildValueRows(PARSED, { sourceId: 'a1', companyId: 'co_1', month: '2026-08', at: 1 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, '홍길동');
  assert.equal(rows[1].name, '김철수');
});

test('★ 값 한 줄마다 출처(원본 번호)가 반드시 붙는다', () => {
  const S = loadStore();
  const rows = S.buildValueRows(PARSED, { sourceId: 'a1', companyId: 'co_1', month: '2026-08', at: 1 });
  rows.forEach(r => assert.equal(r.sourceId, 'a1'));
});

test('★ 항목·값은 문서에 적힌 이름 그대로 담는다 — 바꿔 적지 않는다', () => {
  const S = loadStore();
  const rows = S.buildValueRows(PARSED, { sourceId: 'a1', companyId: 'co_1', month: '2026-08', at: 1 });
  assert.equal(rows[0].pairs[0].item, '기본급');
  assert.equal(rows[0].pairs[0].value, '3,200,000');
});

test('출처·사업장·귀속월이 없으면 값을 만들지 않고 알린다', () => {
  const S = loadStore();
  assert.throws(() => S.buildValueRows(PARSED, { companyId: 'co_1', month: '2026-08' }), /출처/);
  assert.throws(() => S.buildValueRows(PARSED, { sourceId: 'a1', month: '2026-08' }), /사업장/);
  assert.throws(() => S.buildValueRows(PARSED, { sourceId: 'a1', companyId: 'co_1' }), /귀속월/);
});

test('근로계약서 같은 keep 성 자료는 slot 을 직접 줄 수 있다', () => {
  const S = loadStore();
  const rows = S.buildValueRows(PARSED, { sourceId: 'a1', companyId: 'co_1', slot: 'keep', at: 1 });
  assert.equal(rows[0].month, 'keep');
});

test('사람이 없으면 빈 목록을 준다 — 터지지 않는다', () => {
  const S = loadStore();
  const rows = S.buildValueRows({ rows: [] }, { sourceId: 'a1', companyId: 'co_1', month: '2026-08' });
  assert.equal(rows.length, 0);
  const rows2 = S.buildValueRows(null, { sourceId: 'a1', companyId: 'co_1', month: '2026-08' });
  assert.equal(rows2.length, 0);
});

test('새 값 줄마다 번호가 겹치지 않는다', () => {
  const S = loadStore();
  const rows = S.buildValueRows(PARSED, { sourceId: 'a1', companyId: 'co_1', month: '2026-08', at: 1 });
  assert.notEqual(rows[0].id, rows[1].id);
});

/* ══════ 같은 자료 중복 ══════ */

test('★ 같은 사업장·월·근로자 값이 있으면 그 자리 번호를 알려준다', () => {
  const S = loadStore();
  const existing = { r1: { companyId: 'co_1', month: '202608', name: '홍길동' } };
  assert.equal(S.findDuplicateValue(existing, 'co_1', '202608', '홍길동'), 'r1');
});

test('업체·월·이름 중 하나라도 다르면 중복이 아니다', () => {
  const S = loadStore();
  const existing = { r1: { companyId: 'co_1', month: '202608', name: '홍길동' } };
  assert.equal(S.findDuplicateValue(existing, 'co_2', '202608', '홍길동'), null);
  assert.equal(S.findDuplicateValue(existing, 'co_1', '202609', '홍길동'), null);
  assert.equal(S.findDuplicateValue(existing, 'co_1', '202608', '김철수'), null);
});

test('아무것도 없으면 중복이 없다', () => {
  const S = loadStore();
  assert.equal(S.findDuplicateValue({}, 'co_1', '202608', '홍길동'), null);
  assert.equal(S.findDuplicateValue(null, 'co_1', '202608', '홍길동'), null);
});

/* ══════ 실제로 쓰는 층 ══════ */

test('★ 값 줄들을 한 묶음으로 쓴다', () => {
  const S = loadStore();
  let written = null;
  S.init({ db: { ref: () => ({ update: (u) => { written = u; return Promise.resolve(); } }) } });
  const rows = S.buildValueRows(PARSED, { sourceId: 'a1', companyId: 'co_1', month: '2026-08', at: 1 });
  return S.saveValues('202608', rows).then(n => {
    assert.equal(n, 2);
    assert.ok(written[S.valuePath('202608', rows[0].id)]);
    assert.ok(written[S.valuePath('202608', rows[1].id)]);
  });
});

test('값 목록을 읽는다', () => {
  const S = loadStore();
  S.init({ db: { ref: (p) => ({ once: () => Promise.resolve({ val: () => ({ r1: {} }) }) }) } });
  return S.listValues('202608').then(v => assert.equal(Object.keys(v).length, 1));
});

test('★ 값 한 줄을 확인 처리한다', () => {
  const S = loadStore();
  let written = null;
  S.init({ db: { ref: () => ({ update: (u) => { written = u; return Promise.resolve(); } }) } });
  return S.confirmValue('202608', 'r1').then(() => {
    assert.equal(written[S.valuePath('202608', 'r1') + '/confirmed'], true);
  });
});

test('실시간DB가 없으면 알리고 거절한다', () => {
  const S = loadStore();
  return S.saveValues('202608', []).then(
    () => { throw new Error('거절해야 합니다'); },
    e => assert.match(e.message, /실시간DB/)
  );
});
