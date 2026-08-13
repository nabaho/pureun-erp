'use strict';
// 첫 화면 계산 — 실행: node --test tests/*.test.js
//   화면 그리기와 계산을 갈라 두었다. 계산 함수를 HTML 에서 잘라 **실제로 돌린다** —
//   글자를 찾는 검사는 배선이 끊겨도 통과한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');

function loadModel() {
  const html = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
  const store = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');
  const m = html.match(/function sitesModel[\s\S]*?\n\}/);
  assert.ok(m, 'sitesModel 함수를 찾을 수 없습니다');
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script('const S = window.PuPaydataStore; S.init({uid:"U1"});\n' + m[0]
    + '\nwindow.sitesModel = sitesModel;', { filename: 'model.js' }).runInContext(sandbox);
  return sandbox.window.sitesModel;
}

const COMPANIES = [{ id: 'co_1', name: '화담원' }, { id: 'co_2', name: '이비' }];

test('업체마다 한 줄이 나온다', () => {
  const model = loadModel();
  const out = model(COMPANIES, {}, {}, '2026-08', 0);
  assert.equal(out.rows.length, 2);
  assert.equal(out.rows[0].name, '화담원');
});

test('★ 도착 여부를 도착 칸에서 읽는다', () => {
  const model = loadModel();
  const arrivals = { co_1: { 202608: { attend: { a: 1, b: 2 }, last: 2 } } };
  const out = model(COMPANIES, {}, arrivals, '2026-08', 0);
  const byId = {}; out.rows.forEach(r => { byId[r.id] = r; });
  assert.equal(byId.co_1.arrived, true);
  assert.equal(byId.co_1.count, 2);
  assert.equal(byId.co_2.arrived, false);
  assert.equal(byId.co_2.count, 0);
});

test('종류가 여러 가지면 다 더해서 센다', () => {
  const model = loadModel();
  const arrivals = { co_1: { 202608: { attend: { a: 1 }, ledger: { b: 1, c: 1 }, last: 1 } } };
  assert.equal(model(COMPANIES, {}, arrivals, '2026-08', 0).rows[0].count, 3);
});

test('★ 근로계약서(keep 칸)도 장수에 든다', () => {
  const model = loadModel();
  // 계약서는 월별 자료가 아니라 keep 칸에 있다. 안 세면 「0장」으로 보인다.
  const arrivals = { co_1: { keep: { contract: { k1: 1 } }, 202608: { attend: { a: 1 }, last: 1 } } };
  assert.equal(model(COMPANIES, {}, arrivals, '2026-08', 0).rows[0].count, 2);
});

test('★ 미정 건수가 첫 화면에 나온다', () => {
  const model = loadModel();
  // 서랍 안에만 있으면 잊힌다. 맨 위에 늘 보여야 한다.
  const out = model(COMPANIES, { p1: { at: 1 }, p2: { at: 2 } }, {}, '2026-08', 0);
  assert.equal(out.pendingCount, 2);
});

test('★ 3일 넘게 묵은 미정 건수를 따로 센다', () => {
  const model = loadModel();
  const day = 86400000, now = 10 * day;
  const out = model(COMPANIES, { p1: { at: now - 1 * day }, p2: { at: now - 5 * day } }, {}, '2026-08', now);
  assert.equal(out.pendingCount, 2);
  assert.equal(out.staleCount, 1);
});

test('★ 명단에 없는 사업장을 숨기지 않는다', () => {
  const model = loadModel();
  // 급여관리 설정카드에만 있는 사업장이 숨으면 그 업체가 빠진 줄도 모른다.
  const arrivals = { co_9: { 202608: { attend: { a: 1 }, last: 1 } } };
  const out = model(COMPANIES, {}, arrivals, '2026-08', 0);
  assert.equal(out.unlisted.length, 1);
  assert.equal(out.unlisted[0].id, 'co_9');
});

test('명단에 있는 업체는 「명단에 없음」에 겹쳐 나오지 않는다', () => {
  const model = loadModel();
  const arrivals = { co_1: { 202608: { attend: { a: 1 }, last: 1 } } };
  assert.equal(model(COMPANIES, {}, arrivals, '2026-08', 0).unlisted.length, 0);
});

test('월을 못 알아보면 그 달 도착 여부를 켜지 않는다', () => {
  const model = loadModel();
  const arrivals = { co_1: { 202608: { attend: { a: 1 }, last: 1 } } };
  const out = model(COMPANIES, {}, arrivals, '', 0);
  assert.equal(out.rows[0].arrived, false);
});

test('자료가 없어도 터지지 않는다', () => {
  const model = loadModel();
  const a = model(null, null, null, '2026-08', 0);
  assert.equal(a.rows.length, 0);
  assert.equal(a.pendingCount, 0);
  assert.equal(a.unlisted.length, 0);
});
