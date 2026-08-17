'use strict';
// 4차 — 급여관리로 이 달 값 넘기기 화면 배선. 실행: node --test tests/*.test.js
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

/* 실시간DB 흉내 — 값 칸(…/values/…)만 자료를 돌려주고, 인자 없는 ref() 는
   다중 경로 update 자리다. handoffMonth 가 **화면 상태가 아니라 여기서** 값을
   읽어야 하므로, 값 칸에 무엇이 들어 있는지를 시험마다 따로 준다. */
function makeDb(values, saved) {
  return {
    ref(p) {
      if (p === undefined) return { update(map) { Object.assign(saved, map); return Promise.resolve(); } };
      return { once() { return Promise.resolve({ val: () => (/\/values\//.test(p) ? (values || null) : null) }); } };
    }
  };
}

function loadApp(appState, opts) {
  opts = opts || {};
  const calls = { alerts: [], confirms: [] };
  const confirmReturn = opts.confirmReturn !== undefined ? opts.confirmReturn : true;
  const sandbox = {
    window: {}, console, Date,
    document: { getElementById: () => null },
    alert: m => calls.alerts.push(m),
    confirm: m => { calls.confirms.push(m); return confirmReturn; },
    db: opts.db || { ref: () => ({ once: () => Promise.resolve({ val: () => null }) }) }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1", name:"권형하", db: db, isAdmin: '
      + (opts.isAdmin ? 'true' : 'false') + ', isFin: ' + (opts.isFin ? 'true' : 'false') + '});',
    'const App = ' + JSON.stringify(Object.assign({
      pick: {}, companies: [], pending: {}, arrivals: {}, trash: {},
      folders: {}, folderPick: 'all', folderEdit: { mode: '', fid: '', value: '' },
      staffList: [], deputies: {}, month: '2026-08', kind: 'attend',
      companyId: 'co_1', companyName: '화담원',
      viewingUid: '', viewingName: '', viewingDeputy: false
    }, appState)) + ';',
    cut('esc'), cut('jsq'), cut('thisMonth'),
    cut('pickOn'), cut('pickToggle'), cut('pickSetAll'), cut('pickList'),
    cut('pickAllOn'), cut('pickPrune'), cut('pickOf'), cut('pickPut'), cut('pickBar'),
    cut('canWrite'), cut('bannerHtml'),
    cut('drawerCounts'), cut('drawerModel'), cut('searchRows'),
    cut('folderCounts'), cut('folderRows'), cut('folderBar'), cut('folderEditorHtml'), cut('folderOptionsHtml'),
    cut('valueGridModel'), cut('fetchValues'),
    cut('monthShift'), cut('monthCount'), cut('monthStripHtml'), cut('sideCtx'), cut('sideListModel'), cut('coArrivedAt'), cut('screenDrawer'), cut('handoffMonth'),
    'window.App = App; window.screenDrawer = screenDrawer; window.handoffMonth = handoffMonth;'
  ].join('\n'), { filename: 'app.js' }).runInContext(sandbox);
  return { W: sandbox.window, calls };
}

const ITEMS_MONTH = { a1: { companyId: 'co_1', kind: 'attend', month: '202608', filename: '근태.jpg', filedAt: 10 } };

/* ══════ 단추가 보이는가 ══════ */

test('★ 관리자·재무권한이 아니면 넘기기 단추가 없다', () => {
  const { W } = loadApp({ itemsMonth: ITEMS_MONTH, itemsKeep: {} }, { isAdmin: false, isFin: false });
  assert.equal(/handoffMonth\(\)/.test(W.screenDrawer()), false);
});

test('관리자면 넘기기 단추가 보인다', () => {
  const { W } = loadApp({ itemsMonth: ITEMS_MONTH, itemsKeep: {} }, { isAdmin: true });
  assert.match(W.screenDrawer(), /handoffMonth\(\)/);
});

test('재무권한이면 넘기기 단추가 보인다', () => {
  const { W } = loadApp({ itemsMonth: ITEMS_MONTH, itemsKeep: {} }, { isFin: true });
  assert.match(W.screenDrawer(), /handoffMonth\(\)/);
});

test('근로계약서(keep) 탭에서는 "이 달" 개념이 없어 단추도 없다', () => {
  const { W } = loadApp({ kind: 'contract', itemsMonth: {}, itemsKeep: {} }, { isAdmin: true });
  assert.equal(/handoffMonth\(\)/.test(W.screenDrawer()), false);
});

/* ══════ 넘기기 동작 ══════ */

test('권한이 없으면 눌러도 아무 일도 안 한다', () => {
  const { W, calls } = loadApp({}, { isAdmin: false, isFin: false });
  W.handoffMonth();
  assert.equal(calls.confirms.length, 0);
  assert.equal(calls.alerts.length, 0);
});

const 값한줄 = { v1: { companyId: 'co_1', name: '배영승', at: 1, pairs: [{ item: '유급일수', value: '3일' }] } };

test('★ 이 달에 넘길 값이 없으면 알리고 묻지 않는다', async () => {
  const { W, calls } = loadApp({ itemsMonth: {}, itemsKeep: {} }, { isAdmin: true });
  await W.handoffMonth();
  assert.equal(calls.confirms.length, 0, '넘길 게 없는데 확인창을 띄웠습니다');
  assert.match(calls.alerts[0], /없습니다/);
});

test('확인을 취소하면 저장하지 않는다', async () => {
  const saved = {};
  const { W, calls } = loadApp({ itemsMonth: ITEMS_MONTH, itemsKeep: {}, values: 값한줄 },
    { isAdmin: true, db: makeDb(값한줄, saved), confirmReturn: false });
  await W.handoffMonth();
  assert.equal(calls.confirms.length, 1);
  assert.equal(Object.keys(saved).length, 0, '취소했는데 저장됐습니다');
});

test('★ 확인하면 급여관리 수신함과 handoff_log 에 저장되고 성공을 알린다', async () => {
  const saved = {};
  const { W, calls } = loadApp({ itemsMonth: ITEMS_MONTH, itemsKeep: {}, values: 값한줄 },
    { isAdmin: true, db: makeDb(값한줄, saved), confirmReturn: true });
  await W.handoffMonth();
  const inboxKeys = Object.keys(saved).filter(k => k.startsWith('payroll_os/inbox/'));
  const logKeys = Object.keys(saved).filter(k => k.startsWith('paydata/handoff_log/'));
  assert.equal(inboxKeys.length, 1);
  assert.equal(logKeys.length, 1);
  assert.equal(saved[inboxKeys[0]].사업장, '화담원');
  assert.equal(saved[inboxKeys[0]].월, '2026-08');
  assert.equal(saved[logKeys[0]].companyId, 'co_1');
  assert.match(calls.alerts[0], /넘겼습니다/);
});

test('확인 문구에 업체명·월·건수가 들어간다', async () => {
  const saved = {};
  const { W, calls } = loadApp({ itemsMonth: ITEMS_MONTH, itemsKeep: {}, values: 값한줄 },
    { isAdmin: true, db: makeDb(값한줄, saved) });
  await W.handoffMonth();
  assert.match(calls.confirms[0], /화담원/);
  assert.match(calls.confirms[0], /2026-08/);
  assert.match(calls.confirms[0], /1줄/, '급여관리가 보는 것은 서류 장수가 아니라 값 줄 수입니다');
});

/* ══════ 화면에 남아 있던 값으로 세면 안 된다 (2026-08-15) ══════
   App.values 는 「이 달 값 보기」에 들어갈 때만 채워진다. 업체를 바꿔 들어오거나
   기준 월을 바꾸는 길에는 채워지지도 비워지지도 않는다. 그 낡은 값을 세면
   급여관리 수신함에 **다른 업체 줄 수**가 적히고, 급여관리 담당자가 「이 달
   준비됐다」를 아는 유일한 신호가 거짓이 된다. */

test('★ 앞 업체 값 표를 보고 온 뒤 눌러도 그 업체 줄 수를 알리지 않는다', async () => {
  const 화담원12 = {};
  for (let i = 0; i < 12; i++) {
    화담원12['v' + i] = { companyId: 'co_1', name: '화담원사람' + i, at: i,
      pairs: [{ item: '유급일수', value: '3일' }] };
  }
  const saved = {};
  // 화면에는 앞서 본 화담원(co_1) 값 12줄이 그대로 남아 있고, 지금 열린 업체는 co_2 다.
  // 실시간DB 의 co_2 자리에는 값이 하나도 없다.
  const { W, calls } = loadApp({
    companyId: 'co_2', companyName: '푸른상사', itemsMonth: {}, itemsKeep: {}, values: 화담원12
  }, { isAdmin: true, db: makeDb(화담원12, saved), confirmReturn: true });
  await W.handoffMonth();
  assert.equal(calls.confirms.length, 0,
    '앞 업체(화담원) 값 12줄을 이 업체 것으로 세어 물었습니다 — 급여관리에 거짓이 올라갑니다');
  assert.match(calls.alerts[0], /없습니다/);
  assert.equal(Object.keys(saved).length, 0, '남의 업체 줄 수가 급여관리 수신함에 적혔습니다');
});

test('★ 값 표를 한 번도 안 연 달도 정리돼 있으면 그대로 넘긴다', async () => {
  const saved = {};
  // 값 표 화면에 들어간 적이 없어 App.values 는 아직 비어 있다(null).
  const { W, calls } = loadApp({ itemsMonth: ITEMS_MONTH, itemsKeep: {}, values: null },
    { isAdmin: true, db: makeDb(값한줄, saved), confirmReturn: true });
  await W.handoffMonth();
  assert.equal(calls.confirms.length, 1,
    '다 정리된 달인데 「값이 없습니다」라고 했습니다 — 화면 상태가 아니라 실제 값을 세야 합니다');
  assert.match(calls.confirms[0], /1줄/);
  assert.ok(Object.keys(saved).some(k => k.startsWith('payroll_os/inbox/')));
});
