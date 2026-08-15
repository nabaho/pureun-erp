'use strict';
// 좌측 사람별 대시보드 — 렌더링·순서 바꾸기·공유·사유 배선. 실행: node --test tests/*.test.js
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

const shareTagOptions = html.match(/const SHARE_TAG_OPTIONS = \[[\s\S]*?\];/);
assert.ok(shareTagOptions, 'SHARE_TAG_OPTIONS 를 찾을 수 없습니다');

function fakeDbConst(val) {
  return { ref() { return { once() { return Promise.resolve({ val: () => val }); } }; } };
}

function loadApp(appState, opts) {
  opts = opts || {};
  const calls = { alerts: [] };
  const byId = opts.byId || {};
  const sandbox = {
    window: {}, console, Date,
    document: { getElementById: id => byId[id] || null },
    alert: m => calls.alerts.push(m),
    db: opts.db || fakeDbConst(null)
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1", name:"권형하", db: db});',
    'const $ = id => document.getElementById(id);',
    'const App = ' + JSON.stringify(Object.assign({
      screen: 'sites', companyId: '', companyName: '', month: '2026-08', kind: 'attend', query: '',
      companies: [], pending: {}, arrivals: {}, trash: {}, me: { uid: 'U1', email: 'p001@pureun.kr' }, myName: '권형하',
      pick: {}, owners: {}, shares: {}, myOrder: [],
      sideQuery: '', sideOpen: {}, sideReason: null, shareCtx: null, sharedBanner: null,
      viewingUid: '', viewingName: '', viewingDeputy: false
    }, appState)) + ';',
    'App.render = function(){};',
    'App.go = function(screen, o){ Object.assign(App, o||{}); App.screen = screen; };',
    cut('esc'), cut('thisMonth'), cut('companyDocCount'), cut('personDashboardModel'),
    cut('peopleBarHtml'), cut('toggleSidePerson'),
    cut('resetOwnerCaches'), cut('enterSeatAt'),
    cut('sideOpenCompany'), cut('closeSideReason'), cut('submitSideReason'), cut('sideReasonHtml'),
    cut('openShared'), cut('sideDragStart'), cut('sideDragDrop'),
    shareTagOptions[0],
    cut('openShare'), cut('closeShare'), cut('pickShareTarget'), cut('goShareTags'), cut('backShareStep'),
    cut('toggleShareTag'), cut('confirmShare'), cut('shareModalHtml'),
    cut('canWrite'), cut('bannerHtml'),
    'window.App = App;',
    'window.peopleBarHtml = peopleBarHtml; window.toggleSidePerson = toggleSidePerson;',
    'window.sideOpenCompany = sideOpenCompany; window.closeSideReason = closeSideReason;',
    'window.submitSideReason = submitSideReason; window.sideReasonHtml = sideReasonHtml;',
    'window.openShared = openShared; window.sideDragStart = sideDragStart; window.sideDragDrop = sideDragDrop;',
    'window.openShare = openShare; window.closeShare = closeShare; window.pickShareTarget = pickShareTarget;',
    'window.goShareTags = goShareTags; window.backShareStep = backShareStep; window.toggleShareTag = toggleShareTag;',
    'window.confirmShare = confirmShare; window.shareModalHtml = shareModalHtml;',
    'window.canWrite = canWrite; window.bannerHtml = bannerHtml;'
  ].join('\n'), { filename: 'app.js' }).runInContext(sandbox);
  return { W: sandbox.window, calls };
}

const COMPANIES = [
  { id: 'co_1', name: '화담원', managerMain: 'p-001', managerSubs: [] },
  { id: 'co_2', name: '안전공사', managerMain: 'p-001', managerSubs: [] },
  { id: 'co_3', name: '(주)이비', managerMain: 'p-002', managerSubs: [] }
];
const OWNERS = { U1: { name: '권형하', email: 'p001@pureun.kr' }, U2: { name: '민미애', email: 'p002@pureun.kr' } };

/* ══════ 렌더링 ══════ */

test('★ 내 업체에만 드래그 손잡이·공유 단추가 붙는다', () => {
  const { W } = loadApp({ companies: COMPANIES, owners: OWNERS, sideOpen: { U1: true, U2: true } });
  const h = W.peopleBarHtml();
  assert.match(h, /draggable="true"/, '내 업체는 끌 수 있어야 합니다');
  assert.match(h, /↗ 공유/);
  // 남의 업체(이비) 줄에는 손잡이·공유 단추가 없어야 한다
  const idx = h.indexOf('(주)이비');
  const around = h.slice(Math.max(0, idx - 400), idx + 50);
  assert.equal(/draggable="true"/.test(around), false, '남의 업체까지 끌 수 있으면 안 됩니다');
});

test('접힌 사람은 pkids 가 열려 있지 않다', () => {
  const { W } = loadApp({ companies: COMPANIES, owners: OWNERS, sideOpen: {} });
  const h = W.peopleBarHtml();
  assert.equal(/class="pkids open"/.test(h.slice(h.indexOf('다른 담당자'))), false);
});

test('이름으로 찾으면 다른 담당자가 좁혀진다', () => {
  const { W } = loadApp({ companies: COMPANIES, owners: OWNERS, sideQuery: '미애' });
  const h = W.peopleBarHtml();
  assert.match(h, /민미애/);
});

test('★ 다른 사람이 아직 없으면 그렇다고 말한다 — 제목만 덩그러니 두지 않는다', () => {
  // 이름 명단은 한 번이라도 로그인한 사람만 담긴다 — 처음엔 나 혼자인 게 정상이다.
  const { W } = loadApp({ companies: COMPANIES, owners: { U1: OWNERS.U1 } });
  const h = W.peopleBarHtml();
  assert.match(h, /다른 담당자/);
  assert.match(h, /아직 급여데이터함에 들어온 다른 사람이 없습니다/);
});

test('찾는 이름이 없을 때는 「없다」가 아니라 「못 찾았다」로 말한다', () => {
  const { W } = loadApp({ companies: COMPANIES, owners: OWNERS, sideQuery: '없는이름' });
  const h = W.peopleBarHtml();
  assert.match(h, /찾는 이름이 없습니다/);
});

test('★ 공유받음 칸이 개수와 함께 보인다', () => {
  const shares = { s1: { companyId: 'co_9', companyName: '참살이', byName: '민미애', tags: ['확인 부탁드립니다'], at: 1 } };
  const { W } = loadApp({ companies: COMPANIES, owners: OWNERS, shares });
  const h = W.peopleBarHtml();
  assert.match(h, /공유받음<span class="n">1<\/span>/);
  assert.match(h, /참살이/);
  assert.match(h, /확인 부탁드립니다/);
});

/* ══════ 펼치기·접기 ══════ */

test('★ 사람을 누르면 펼치고 다시 누르면 접는다', () => {
  const { W } = loadApp({});
  assert.equal(W.App.sideOpen.U2, undefined);
  W.toggleSidePerson('U2', false);
  assert.equal(W.App.sideOpen.U2, true);
  W.toggleSidePerson('U2', false);
  assert.equal(W.App.sideOpen.U2, false);
});

test('나는 처음부터 펼쳐져 있다가 누르면 접힌다', () => {
  const { W } = loadApp({});
  W.toggleSidePerson('U1', true);
  assert.equal(W.App.sideOpen.U1, false);
});

/* ══════ 업체 열기 — 내 것/남의 것 ══════ */

test('★ 내 업체는 사유 없이 곧장 서랍으로 간다', () => {
  const { W } = loadApp({});
  W.sideOpenCompany('U1', '권형하', 'co_1', '화담원', true);
  assert.equal(W.App.screen, 'drawer');
  assert.equal(W.App.companyId, 'co_1');
  assert.equal(W.App.sideReason, null);
});

test('★ 대리로 맡은 자리면 남의 업체도 사유 없이 곧장 들어간다', async () => {
  const db = fakeDbConst({ to: Date.now() + 100000 });
  const { W } = loadApp({}, { db });
  W.sideOpenCompany('U2', '민미애', 'co_3', '(주)이비', false);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(W.App.screen, 'drawer');
  assert.equal(W.App.viewingUid, 'U2');
  assert.equal(W.App.viewingDeputy, true);
  assert.equal(W.App.sideReason, null);
});

test('★ 대리가 아니면 사유를 먼저 묻는다 — 서랍으로 바로 안 간다', async () => {
  const db = fakeDbConst(null);
  const { W } = loadApp({}, { db });
  W.sideOpenCompany('U2', '민미애', 'co_3', '(주)이비', false);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(W.App.screen, 'sites', '사유를 안 물었는데 서랍으로 갔습니다');
  assert.ok(W.App.sideReason);
  assert.equal(W.App.sideReason.targetUid, 'U2');
  assert.equal(W.App.sideReason.companyId, 'co_3');
});

test('사유 프롬프트 화면에 안내 문구가 있다', () => {
  const { W } = loadApp({ sideReason: { targetUid: 'U2', targetName: '민미애', companyId: 'co_3', companyName: '(주)이비' } });
  const h = W.sideReasonHtml();
  assert.match(h, /민미애/);
  assert.match(h, /\(주\)이비/);
  assert.match(h, /사유가 필요 없습니다/);
});

test('사유 없이 확인을 누르면 거절한다', () => {
  const { W, calls } = loadApp({ sideReason: { targetUid: 'U2', targetName: '민미애', companyId: 'co_3', companyName: '이비' } });
  W.submitSideReason();
  assert.equal(calls.alerts.length, 1);
  assert.equal(W.App.screen, 'sites');
});

test('★ 사유를 적으면 기록하고 곧장 서랍으로 들어간다', async () => {
  let logged = null;
  const db = {
    ref(p) {
      if (p === undefined) return { update() { return Promise.resolve(); } };
      return { once() { return Promise.resolve({ val: () => null }); } };
    }
  };
  const { W } = loadApp(
    { sideReason: { targetUid: 'U2', targetName: '민미애', companyId: 'co_3', companyName: '이비' } },
    { db, byId: { sideReasonInput: { value: '급여 문의' } } }
  );
  W.submitSideReason();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(W.App.screen, 'drawer');
  assert.equal(W.App.viewingUid, 'U2');
  assert.equal(W.App.sideReason, null);
});

/* ══════ 내 업체 순서 바꾸기(드래그) ══════ */

test('★ 끌어다 놓으면 순서가 바뀌고 서버에 저장한다', async () => {
  let saved = null;
  const db = {
    ref(p) {
      if (p === undefined) return { update(map) { Object.keys(map).forEach(k => { saved = map[k]; }); return Promise.resolve(); } };
      return { once() { return Promise.resolve({ val: () => null }); } };
    }
  };
  const { W } = loadApp({ companies: COMPANIES, owners: OWNERS }, { db });
  W.sideDragStart({}, 'co_2');
  W.sideDragDrop({ preventDefault() {} }, 'co_1');
  assert.equal(W.App.myOrder[0], 'co_2');
  await new Promise(r => setTimeout(r, 0));
  assert.ok(Array.isArray(saved));
  assert.equal(saved[0], 'co_2');
});

test('같은 자리에 놓으면 아무 일도 안 한다', () => {
  const { W } = loadApp({ companies: COMPANIES, owners: OWNERS, myOrder: ['co_1', 'co_2'] });
  W.sideDragStart({}, 'co_1');
  W.sideDragDrop({ preventDefault() {} }, 'co_1');
  assert.equal(W.App.myOrder.join(','), 'co_1,co_2');
});

/* ══════ 공유받음 열기 — 사유 없이 ══════ */

test('★ 공유받은 것을 열면 사유 없이 곧장 서랍으로 가고 공유 배너가 뜬다', async () => {
  const shares = { s1: { companyId: 'co_9', companyName: '참살이', byUid: 'U2', byName: '민미애', tags: ['확인 부탁드립니다'], at: 1 } };
  const db = fakeDbConst(null);
  const { W } = loadApp({ shares: shares }, { db });
  W.openShared('s1');
  await new Promise(r => setTimeout(r, 0));
  assert.equal(W.App.screen, 'drawer');
  assert.equal(W.App.companyId, 'co_9');
  assert.equal(W.App.sideReason, null, '공유는 사유를 안 묻습니다');
  assert.ok(W.App.sharedBanner);
  assert.equal(W.App.sharedBanner.byName, '민미애');
});

test('★ 공유 배너가 있으면 bannerHtml 이 초록 띠를 그린다', () => {
  const { W } = loadApp({ sharedBanner: { byName: '민미애', tags: ['확인 부탁드립니다', '서명·날인 필요'] } });
  const h = W.bannerHtml();
  assert.match(h, /공유함/);
  assert.match(h, /민미애/);
  assert.match(h, /확인 부탁드립니다, 서명·날인 필요/);
});

/* ══════ 공유하기 — 사람 고르기 → 태그 체크 ══════ */

test('★ 공유하기를 열면 사람 고르기부터 시작한다', () => {
  const { W } = loadApp({});
  W.openShare('co_1', '화담원');
  assert.equal(W.App.shareCtx.step, 'pick');
  const h = W.shareModalHtml();
  assert.match(h, /누구와 공유할까요/);
});

test('사람을 안 고르고 다음을 누르면 거절한다', () => {
  const { W, calls } = loadApp({});
  W.openShare('co_1', '화담원');
  W.goShareTags();
  assert.equal(calls.alerts.length, 1);
  assert.equal(W.App.shareCtx.step, 'pick');
});

test('★ 사람을 고르고 다음으로 가면 공유사항 체크 화면이 뜬다', () => {
  const { W } = loadApp({});
  W.openShare('co_1', '화담원');
  W.pickShareTarget('U2', '민미애');
  W.goShareTags();
  assert.equal(W.App.shareCtx.step, 'tags');
  const h = W.shareModalHtml();
  assert.match(h, /민미애님에게/);
  assert.match(h, /확인 부탁드립니다/);
  assert.match(h, /서명·날인 필요/);
});

test('공유사항을 하나도 안 고르면 거절한다', () => {
  const { W, calls } = loadApp({});
  W.openShare('co_1', '화담원');
  W.pickShareTarget('U2', '민미애');
  W.goShareTags();
  W.confirmShare();
  assert.equal(calls.alerts.length, 1);
});

test('★ 공유사항을 고르고 확인하면 저장되고 창이 닫힌다', async () => {
  let saved = null;
  const db = {
    ref(p) {
      if (p === undefined) return { update(map) { Object.keys(map).forEach(k => { saved = map[k]; }); return Promise.resolve(); } };
      return { once() { return Promise.resolve({ val: () => null }); } };
    }
  };
  const { W } = loadApp({}, { db });
  W.openShare('co_1', '화담원');
  W.pickShareTarget('U2', '민미애');
  W.goShareTags();
  W.toggleShareTag('확인 부탁드립니다');
  W.confirmShare();
  await new Promise(r => setTimeout(r, 0));
  assert.ok(saved);
  assert.equal(saved.companyId, 'co_1');
  assert.equal(saved.tags[0], '확인 부탁드립니다');
  assert.equal(W.App.shareCtx, null);
});

test('뒤로 가면 사람 고르기로 돌아간다', () => {
  const { W } = loadApp({});
  W.openShare('co_1', '화담원');
  W.pickShareTarget('U2', '민미애');
  W.goShareTags();
  W.backShareStep();
  assert.equal(W.App.shareCtx.step, 'pick');
});

test('취소하면 공유 상태가 사라진다', () => {
  const { W } = loadApp({});
  W.openShare('co_1', '화담원');
  W.closeShare();
  assert.equal(W.App.shareCtx, null);
  assert.equal(W.shareModalHtml(), '');
});
