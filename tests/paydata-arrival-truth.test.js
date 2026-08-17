'use strict';
/* 도착 확인이 사실을 말하게 (대표 지시 2026-08-17 「들어온 것을 정확하게 확인」)
   실행: node --test tests/*.test.js · 목업 docs/mockups/paydata-arrival-truth.html */
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

const COS = [
  { id: 'co_1', name: '화담원', typeCode: '급여', managerMain: 'p-001', managerSubs: [] },
  { id: 'co_2', name: '늘봄반찬', typeCode: '급여', managerMain: 'p-001', managerSubs: [] },
  { id: 'co_3', name: '보문사', typeCode: '급여', managerMain: 'p-001', managerSubs: [] },
  { id: 'co_4', name: '세창이엔지', typeCode: '급여', managerMain: 'p-001', managerSubs: [] }
];

function load(app) {
  const sandbox = { window: {}, console, Date, document: { getElementById: () => null } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1", isAdmin:true});',
    'const $ = id => document.getElementById(id);',
    'const App = ' + JSON.stringify(Object.assign({
      companies: COS, dir: [{ sid: 'p-001', name: '권형하' }], owners: {}, arrivals: {}, shares: {},
      pending: {}, pendTag: {}, me: { uid: 'U1', email: 'p001@pureun.kr' },
      month: '2026-08', sideView: 'mine', colFilter: 'all', colQuery: '', myOrder: []
    }, app)) + ';',
    'App.render = function(){};',
    cut('esc'), cut('jsq'), cut('thisMonth'), cut('companyDocCount'), cut('coArrivedAt'),
    cut('guessTag'), cut('siteState'), cut('sideListModel'), cut('sideCtx'),
    'window.App = App; window.S = S; window.siteState = siteState;',
    'window.sideListModel = sideListModel; window.sideCtx = sideCtx;'
  ].join('\n'), { filename: 'app.js' }).runInContext(sandbox);
  return sandbox.window;
}

const rowOf = (W, id) => W.sideListModel('mine', W.sideCtx(), {}).rows.filter(r => r.id === id)[0];

/* ══════ ① 대기 칸에 걸린 것도 그 사업장 줄에 보인다 ══════ */

/* 도착 표시는 **서랍에 담긴 것**만 센다. 그래서 근태표가 이미 대기 칸에 와 있어도
   그 사업장은 「미도착」으로 보였고, 맨 위 「미정 N건」은 전체 합계라 어느 곳
   것인지 알 수 없었다. 「들어온 것을 정확하게 확인」이 안 되던 첫째 까닭이다. */
test('★ 대기 칸에 와 있는 자료가 그 사업장 줄에 잡힌다', () => {
  const W = load({ pending: {
    p1: { filename: '화담원 2026-08 근태.jpg' },
    p2: { filename: '화담원 근무표.jpg' }
  } });
  const r = rowOf(W, 'co_1');
  assert.equal(r.pend, 2, '왔는데도 「미도착」이라 하면 다시 달라고 하게 됩니다');
  assert.equal(W.siteState(r).key, 'wait');
  assert.match(W.siteState(r).label, /대기 2/);
});

/* ⚠ 짐작을 확정처럼 세면, 고치려던 거짓말을 색만 바꿔 되풀이하는 것이다. */
test('★ 대기(짐작)와 담김(확정)을 절대 같이 세지 않는다', () => {
  const W = load({ pending: { p1: { filename: '화담원 근태.jpg' } } });
  const r = rowOf(W, 'co_1');
  assert.equal(r.arrived, false, '★ 짐작을 도착으로 세면 안 됩니다');
  assert.equal(r.count, 0, '★ 장수에 섞이면 안 됩니다');
  assert.equal(r.pend, 1, '대기는 따로 셉니다');
});

/* 6월 자료를 8월 줄에 세면 그 줄이 또 거짓말을 한다. */
test('★ 짐작한 달이 다르면 이 달 줄에 안 붙인다', () => {
  const W = load({ month: '2026-08', pending: {
    p1: { filename: '화담원 2026-06 근태.jpg' },   // 6월 것
    p2: { filename: '화담원 근태.jpg' }             // 달을 모름
  } });
  const r = rowOf(W, 'co_1');
  assert.equal(r.pend, 1, '다른 달 것까지 세면 이 달 줄이 거짓이 됩니다');
});

/* 사람이 대기 칸에서 사업장을 손으로 골라 뒀으면 그것이 파일 이름 짐작보다 먼저다. */
test('★ 사람이 고쳐 둔 이름표가 짐작을 이긴다', () => {
  const W = load({
    pending: { p1: { filename: '이름없음.jpg' } },
    pendTag: { p1: { companyId: 'co_3', month: '2026-08' } }
  });
  assert.equal(rowOf(W, 'co_3').pend, 1);
  assert.equal(rowOf(W, 'co_1').pend, 0);
});

/* 업체를 못 알아본 자료는 어느 줄에도 없다 — 그래서 맨 위 「미정 N건」 띠가
   그대로 있어야 한다(사라지면 영원히 안 보인다). */
test('★ 업체를 못 알아본 자료는 어느 줄에도 안 붙는다 — 미정 띠가 받는다', () => {
  const W = load({ pending: { p1: { filename: 'IMG_0421.jpg' } } });
  assert.equal(W.sideListModel('mine', W.sideCtx(), {}).rows.reduce((n, r) => n + r.pend, 0), 0);
  assert.match(cut('screenSites'), /미정/, '★ 미정 띠까지 없애면 그 자료는 사라집니다');
});

/* ══════ ② 무엇이 왔는지 ══════ */

test('★ 「몇 장」이 아니라 「무엇이」 왔는지 종류별로 나온다', () => {
  const W = load({ arrivals: { co_2: { 202608: {
    attend: { a: 1, b: 1, c: 1 }, ledger: { d: 1 }, last: 1 } } } });
  const r = rowOf(W, 'co_2');
  assert.equal(r.count, 4);
  const s = r.kinds.map(k => k.label + ' ' + k.n).join(' · ');
  assert.match(s, /근태 3/, '무엇이 왔는지 없으면 열어 봐야 압니다: ' + s);
  assert.match(s, /급여대장 1/);
  assert.equal(rowOf(W, 'co_4').kinds.length, 0, '안 온 곳에는 종류가 없어야 합니다');
});

/* ══════ ③ 판독까지 됐나 ══════ */

test('★ 사진만 온 것과 표까지 나온 것을 가른다', () => {
  const W = load({ arrivals: {
    co_2: { 202608: { attend: { a: 1 }, last: 1, vals: 7 } },
    co_3: { 202608: { attend: { b: 1 }, last: 1 } }
  } });
  const done = W.siteState(rowOf(W, 'co_2'));
  const yet = W.siteState(rowOf(W, 'co_3'));
  assert.equal(done.key, 'done');
  assert.match(done.label, /표 7명/, '몇 사람분인지 알아야 원본과 대조합니다');
  assert.equal(yet.key, 'in');
  assert.match(yet.label, /판독 전/, '다음에 할 일이 판독이라는 것이 보여야 합니다');
});

test('★ 아무것도 없으면 미도착이다', () => {
  assert.equal(load().siteState({ arrived: false, pend: 0, vals: 0, count: 0 }).key, 'none');
});

/* 「표 몇 명」 표시가 종류 세는 데 섞이면 장수가 부풀어 오른다. */
test('★ 「표 몇 명」 표시가 장수·종류에 섞이지 않는다', () => {
  const W = load({ arrivals: { co_2: { 202608: { attend: { a: 1 }, last: 1, vals: 7 } } } });
  const r = rowOf(W, 'co_2');
  assert.equal(r.count, 1, '★ 표 표시가 장수로 세어졌습니다');
  assert.equal(r.kinds.reduce((n, k) => n + k.n, 0), 1);
});

/* ══════ 저장 층 — 표 몇 명을 도착 칸에 적는다 ══════ */

function loadStore() {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  return sandbox.window.PuPaydataStore;
}

/* 값은 사람 자리마다 따로 있어 남의 것을 세려면 자리를 옮겨야 한다. 도착 칸은
   전 직원 공용이라, 여기에 적어야 사업장 목록이 한 번의 읽기로 안다. */
test('★ 값을 저장하면 「표 몇 명」이 도착 칸에 같은 묶음으로 적힌다', async () => {
  const S = loadStore();
  const writes = [];
  S.init({ uid: 'U1', db: { ref: () => ({ update: up => { writes.push(up); return Promise.resolve(); } }) } });
  await S.saveValues('202608', [{ id: 'r1', companyId: 'co_1', name: '배영승' }],
    '', { companyId: 'co_1', people: 7 });
  const up = writes[0];
  assert.equal(up['paydata/arrivals/co_1/202608/vals'], 7);
  assert.ok(Object.keys(up).some(k => /\/values\/202608\/r1$/.test(k)), '값 줄이 안 써졌습니다');
});

/* 이번 것만 세면 두 번째 서류를 읽었을 때 사람 수가 오히려 줄어든다. */
test('★ 이미 있던 사람과 이번 사람을 함께 센다', () => {
  const S = loadStore();
  const box = {
    r1: { companyId: 'co_1', name: '배영승' },
    r2: { companyId: 'co_1', name: '김은주' },
    r3: { companyId: 'co_9', name: '남의회사사람' }
  };
  assert.equal(S.valuePeopleCount(box, 'co_1', [{ companyId: 'co_1', name: '이광수' }]), 3);
  assert.equal(S.valuePeopleCount(box, 'co_1', [{ companyId: 'co_1', name: '배영승' }]), 2,
    '같은 사람을 두 번 세면 안 됩니다');
  assert.equal(S.valuePeopleCount(box, 'co_1', []), 2, '이번 줄이 없어도 있던 사람은 셉니다');
});

test('★ 값 저장 화면이 도착 칸 표시를 함께 넘긴다', () => {
  const s = cut('saveVals');
  assert.match(s, /valuePeopleCount\(/, '사람 수를 안 세면 「표 몇 명」이 안 붙습니다');
  assert.match(s, /S\.saveValues\([\s\S]*?people:/, '저장할 때 함께 넘겨야 합니다');
});
