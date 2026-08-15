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
    cut('esc'), cut('thisMonth'),
    cut('pickOn'), cut('pickToggle'), cut('pickSetAll'), cut('pickList'),
    cut('pickAllOn'), cut('pickPrune'), cut('pickOf'), cut('pickPut'), cut('pickBar'),
    cut('canWrite'), cut('bannerHtml'),
    cut('drawerCounts'), cut('drawerModel'), cut('searchRows'),
    cut('folderCounts'), cut('folderRows'), cut('folderBar'), cut('folderEditorHtml'), cut('folderOptionsHtml'),
    cut('valueGridModel'),
    cut('screenDrawer'), cut('handoffMonth'),
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

test('★ 이 달에 넘길 값이 없으면 알리고 묻지 않는다', () => {
  const { W, calls } = loadApp({ itemsMonth: {}, itemsKeep: {} }, { isAdmin: true });
  W.handoffMonth();
  assert.equal(calls.confirms.length, 0, '넘길 게 없는데 확인창을 띄웠습니다');
  assert.match(calls.alerts[0], /없습니다/);
});

test('확인을 취소하면 저장하지 않는다', () => {
  let saved = false;
  const db = {
    ref(p) {
      if (p === undefined) return { update(map) { saved = true; return Promise.resolve(); } };
      return { once() { return Promise.resolve({ val: () => null }); } };
    }
  };
  const { W, calls } = loadApp({
    itemsMonth: ITEMS_MONTH, itemsKeep: {},
    values: { v1: { companyId: 'co_1', name: '배영승', pairs: [{ item: '유급일수', value: '3일' }] } }
  }, { isAdmin: true, db, confirmReturn: false });
  W.handoffMonth();
  assert.equal(calls.confirms.length, 1);
  assert.equal(saved, false, '취소했는데 저장됐습니다');
});

test('★ 확인하면 급여관리 수신함과 handoff_log 에 저장되고 성공을 알린다', async () => {
  const saved = {};
  const db = {
    ref(p) {
      if (p === undefined) return { update(map) { Object.assign(saved, map); return Promise.resolve(); } };
      return { once() { return Promise.resolve({ val: () => null }); } };
    }
  };
  const { W, calls } = loadApp({
    itemsMonth: ITEMS_MONTH, itemsKeep: {},
    values: { v1: { companyId: 'co_1', name: '배영승', pairs: [{ item: '유급일수', value: '3일' }] } }
  }, { isAdmin: true, db, confirmReturn: true });
  W.handoffMonth();
  await new Promise(r => setTimeout(r, 0));
  const inboxKeys = Object.keys(saved).filter(k => k.startsWith('payroll_os/inbox/'));
  const logKeys = Object.keys(saved).filter(k => k.startsWith('paydata/handoff_log/'));
  assert.equal(inboxKeys.length, 1);
  assert.equal(logKeys.length, 1);
  assert.equal(saved[inboxKeys[0]].사업장, '화담원');
  assert.equal(saved[inboxKeys[0]].월, '2026-08');
  assert.equal(saved[logKeys[0]].companyId, 'co_1');
  assert.match(calls.alerts[0], /넘겼습니다/);
});

test('확인 문구에 업체명·월·건수가 들어간다', () => {
  const db = {
    ref(p) {
      if (p === undefined) return { update() { return Promise.resolve(); } };
      return { once() { return Promise.resolve({ val: () => null }); } };
    }
  };
  const { W, calls } = loadApp({
    itemsMonth: ITEMS_MONTH, itemsKeep: {},
    values: { v1: { companyId: 'co_1', name: '배영승', pairs: [{ item: '유급일수', value: '3일' }] } }
  }, { isAdmin: true, db });
  W.handoffMonth();
  assert.match(calls.confirms[0], /화담원/);
  assert.match(calls.confirms[0], /2026-08/);
  assert.match(calls.confirms[0], /1줄/, '급여관리가 보는 것은 서류 장수가 아니라 값 줄 수입니다');
});
