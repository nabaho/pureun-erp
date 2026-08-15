'use strict';
// 월별 값 표 — 사람이 한 줄, 항목이 가로. 실행: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');

function cut(name) {
  const m = html.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 함수를 찾을 수 없습니다');
  return m[0];
}

function loadApp(appState) {
  const sandbox = { window: {}, console, Date, document: { getElementById: () => null } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1"});',
    'const App = ' + JSON.stringify(Object.assign({
      companyId: 'co_1', companyName: '화담원', month: '2026-08', values: {}
    }, appState)) + ';',
    cut('esc'), cut('valueGridModel'), cut('screenValues'),
    'window.App = App; window.valueGridModel = valueGridModel; window.screenValues = screenValues;'
  ].join('\n'), { filename: 'app.js' }).runInContext(sandbox);
  return sandbox.window;
}

const VALS = {
  v1: { companyId: 'co_1', month: '202608', name: '배영승', sourceId: 'a1', confirmed: false,
        pairs: [{ item: '유급일수', value: '3일' }, { item: '기본급', value: '3,200,000' }] },
  v2: { companyId: 'co_1', month: '202608', name: '이옥자', sourceId: 'a2', confirmed: true,
        pairs: [{ item: '유급일수', value: '3일' }] }
};

test('★ 사람이 한 줄로 모인다', () => {
  const W = loadApp({});
  const g = W.valueGridModel(VALS);
  assert.equal(g.people.length, 2);
  assert.equal(g.people[0].name, '배영승');
});

test('★ 항목이 가로 열이 된다 — 처음 나온 차례대로', () => {
  const W = loadApp({});
  const g = W.valueGridModel(VALS);
  assert.equal(g.items.join(','), '유급일수,기본급');
});

test('★ 값마다 출처가 남는다', () => {
  const W = loadApp({});
  const g = W.valueGridModel(VALS);
  assert.equal(g.people[0].cells['유급일수'].sourceId, 'a1');
});

test('★ 같은 사람의 값은 한 줄로 합쳐진다 — 서류가 달라도', () => {
  const W = loadApp({});
  const g = W.valueGridModel({
    v1: { name: '배영승', sourceId: 'a1', pairs: [{ item: '유급일수', value: '3일' }] },
    v2: { name: '배영승', sourceId: 'a2', pairs: [{ item: '기본급', value: '1' }] }
  });
  assert.equal(g.people.length, 1);
  assert.equal(g.items.length, 2);
});

test('자료가 없어도 터지지 않는다', () => {
  const W = loadApp({});
  assert.equal(W.valueGridModel(null).people.length, 0);
  assert.equal(W.valueGridModel({}).items.length, 0);
});

test('★ 없는 항목은 0 이 아니라 － 로 보인다', () => {
  const W = loadApp({ values: VALS });
  const h = W.screenValues();
  assert.match(h, /－/, '0 으로 두면 「0원」과 「안 왔음」이 구별되지 않습니다');
});

test('★ 확인 안 된 값은 노랗게', () => {
  const W = loadApp({ values: VALS });
  assert.match(W.screenValues(), /class="[^"]*iffy/);
});

test('★ 값을 누르면 출처 원본이 열린다', () => {
  const W = loadApp({ values: VALS });
  assert.match(W.screenValues(), /openViewer\('a1'\)/);
});

test('값이 없으면 빈 안내를 보여준다', () => {
  const W = loadApp({ values: {} });
  assert.match(W.screenValues(), /아직 정리된 값이 없습니다/);
});

test('★ 서랍에서 「이 달 값 보기」로 들어갈 수 있다', () => {
  assert.match(html, /App\.go\(\\?'values\\?'/, '들어갈 길이 없으면 만든 화면이 아닙니다');
});
