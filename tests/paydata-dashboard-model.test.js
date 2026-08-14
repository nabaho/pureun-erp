'use strict';
// 사람별 대시보드 계산(personDashboardModel) — 실행: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');

function loadModel() {
  const html = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
  const store = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');
  const cc = html.match(/function companyDocCount[\s\S]*?\n\}/);
  const pm = html.match(/function personDashboardModel[\s\S]*?\n\}/);
  assert.ok(cc, 'companyDocCount 함수를 찾을 수 없습니다');
  assert.ok(pm, 'personDashboardModel 함수를 찾을 수 없습니다');
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script('const S = window.PuPaydataStore; S.init({uid:"U1"});\n' + cc[0] + '\n' + pm[0]
    + '\nwindow.personDashboardModel = personDashboardModel;', { filename: 'model.js' }).runInContext(sandbox);
  return sandbox.window.personDashboardModel;
}

const COMPANIES = [
  { id: 'co_1', name: '화담원', managerMain: 'p-me', managerSubs: [] },
  { id: 'co_2', name: '안전공사', managerMain: 'p-me', managerSubs: [] },
  { id: 'co_3', name: '(주)이비', managerMain: 'p-002', managerSubs: [] },
  { id: 'co_4', name: '디와이산업', managerMain: 'p-002', managerSubs: [] }
];
const OWNERS = {
  'p-me': { name: '권형하(나)', email: 'pme@pureun.kr' },
  'p-002': { name: '민미애', email: 'p002@pureun.kr' },
  'p-003': { name: '김보람' }   // 이메일이 아직 없는(예전 로그인) 사람
};

test('★ 나는 담당 업체가 순서대로 나온다', () => {
  const model = loadModel();
  const out = model(OWNERS, COMPANIES, {}, {}, 'p-me', 'pme@pureun.kr', '권형하', ['co_2', 'co_1'], '2026-08', 0, '');
  assert.equal(out.me.uid, 'p-me');
  assert.deepEqual(out.me.companies.map(c => c.id), ['co_2', 'co_1']);
});

test('나 자신은 다른 담당자 목록에 끼지 않는다', () => {
  const model = loadModel();
  const out = model(OWNERS, COMPANIES, {}, {}, 'p-me', 'pme@pureun.kr', '권형하', [], '2026-08', 0, '');
  assert.equal(out.others.some(o => o.uid === 'p-me'), false);
});

test('★ 다른 담당자의 업체도 이메일로 가려진다', () => {
  const model = loadModel();
  const out = model(OWNERS, COMPANIES, {}, {}, 'p-me', 'pme@pureun.kr', '권형하', [], '2026-08', 0, '');
  const min = out.others.find(o => o.uid === 'p-002');
  assert.ok(min);
  assert.deepEqual(min.companies.map(c => c.id).sort(), ['co_3', 'co_4']);
});

test('이메일을 아직 안 남긴 사람(예전 로그인)은 담당 업체가 빈 목록이다 — 안 터진다', () => {
  const model = loadModel();
  const out = model(OWNERS, COMPANIES, {}, {}, 'p-me', 'pme@pureun.kr', '권형하', [], '2026-08', 0, '');
  const kim = out.others.find(o => o.uid === 'p-003');
  assert.ok(kim);
  assert.equal(kim.companies.length, 0);
});

test('이름으로 다른 담당자를 좁힌다', () => {
  const model = loadModel();
  const out = model(OWNERS, COMPANIES, {}, {}, 'p-me', 'pme@pureun.kr', '권형하', [], '2026-08', 0, '미애');
  assert.equal(out.others.length, 1);
  assert.equal(out.others[0].uid, 'p-002');
});

test('다른 담당자는 이름 가나다순으로 나온다', () => {
  const model = loadModel();
  const out = model(OWNERS, COMPANIES, {}, {}, 'p-me', 'pme@pureun.kr', '권형하', [], '2026-08', 0, '');
  const names = out.others.map(o => o.name);
  assert.deepEqual(names.slice().sort((a, b) => a.localeCompare(b, 'ko')), names);
});

test('★ 도착 여부·건수가 도착 칸에서 그대로 나온다', () => {
  const model = loadModel();
  const arrivals = { co_1: { 202608: { attend: { a: 1 }, ledger: { b: 1 }, last: 1 } } };
  const out = model(OWNERS, COMPANIES, arrivals, {}, 'p-me', 'pme@pureun.kr', '권형하', [], '2026-08', 0, '');
  const co1 = out.me.companies.find(c => c.id === 'co_1');
  assert.equal(co1.arrived, true);
  assert.equal(co1.count, 2);
  const co2 = out.me.companies.find(c => c.id === 'co_2');
  assert.equal(co2.arrived, false);
});

test('★ 공유받은 것은 최근 순으로 나온다', () => {
  const model = loadModel();
  const shares = {
    s1: { companyId: 'co_5', companyName: '참살이', byName: '민미애', tags: ['확인 부탁드립니다'], at: 1000 },
    s2: { companyId: 'co_6', companyName: '플러스동반성장', byName: '김보람', tags: ['참고만 하세요'], at: 2000 }
  };
  const out = model(OWNERS, COMPANIES, {}, shares, 'p-me', 'pme@pureun.kr', '권형하', [], '2026-08', 0, '');
  // vm 안에서 만든 배열은 밖의 것과 다른 종류라 deepEqual 이 튕긴다 — 문자열로 견준다.
  assert.equal(out.shared.map(s => s.id).join(','), 's2,s1');
});

test('공유받은 것이 없으면 빈 목록이다', () => {
  const model = loadModel();
  const out = model(OWNERS, COMPANIES, {}, {}, 'p-me', 'pme@pureun.kr', '권형하', [], '2026-08', 0, '');
  assert.equal(out.shared.length, 0);
});

test('내 이름이 없으면 uid 로 대신 보여준다', () => {
  const model = loadModel();
  const out = model(OWNERS, COMPANIES, {}, {}, 'p-me', 'pme@pureun.kr', '', [], '2026-08', 0, '');
  assert.equal(out.me.name, 'p-me');
});

test('자료가 없어도 터지지 않는다', () => {
  const model = loadModel();
  const out = model(null, null, null, null, 'p-me', '', '', null, '2026-08', 0, '');
  assert.equal(out.me.companies.length, 0);
  assert.equal(out.others.length, 0);
  assert.equal(out.shared.length, 0);
});
