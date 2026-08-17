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
    'const S = window.PuPaydataStore; S.init({uid:"U1", name:"권형하", db: db'
      + (opts.isAdmin ? ', isAdmin: true' : '') + '});',
    'const $ = id => document.getElementById(id);',
    'const App = ' + JSON.stringify(Object.assign({
      screen: 'sites', companyId: '', companyName: '', month: '2026-08', kind: 'attend', query: '',
      companies: [], pending: {}, arrivals: {}, trash: {}, me: { uid: 'U1', email: 'p001@pureun.kr' }, myName: '권형하',
      pick: {}, owners: {}, shares: {}, myOrder: [], dir: null,
      sideView: 'mine', colFilter: 'all', colQuery: '', sideFold: false,
      sideReason: null, shareCtx: null, sharedBanner: null,
      viewingUid: '', viewingName: '', viewingDeputy: false
    }, appState)) + ';',
    'App.render = function(){};',
    'App.go = function(screen, o){ Object.assign(App, o||{}); App.screen = screen; };',
    cut('esc'), cut('jsq'), cut('thisMonth'), cut('companyDocCount'), cut('coArrivedAt'),
    cut('sideViewModel'), cut('guessTag'), cut('siteState'), cut('sideListModel'), cut('sideCtx'),
    cut('viewBarHtml'), cut('colListHtml'),
    cut('pickSideView'), cut('pickColFilter'), cut('toggleSideFold'), cut('openColCompany'),
    cut('resetOwnerCaches'), cut('enterSeatAt'),
    cut('sideOpenCompany'), cut('closeSideReason'), cut('submitSideReason'), cut('sideReasonHtml'),
    cut('openShared'), cut('sideDragStart'), cut('sideDragDrop'),
    shareTagOptions[0],
    cut('openShare'), cut('closeShare'), cut('pickShareTarget'), cut('goShareTags'), cut('backShareStep'),
    cut('toggleShareTag'), cut('confirmShare'), cut('shareModalHtml'),
    cut('canWrite'), cut('bannerHtml'),
    'window.App = App;',
    'window.viewBarHtml = viewBarHtml; window.colListHtml = colListHtml;',
    'window.pickSideView = pickSideView; window.pickColFilter = pickColFilter;',
    'window.toggleSideFold = toggleSideFold; window.openColCompany = openColCompany;',
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

/* ══════ 그리기 — 2중 대시보드(대표 결정 2026-08-17, 목업 4안+2안) ══════ */

test('★ 내 업체에만 드래그 손잡이·공유 단추가 붙는다', () => {
  const { W } = loadApp({ companies: COMPANIES, owners: OWNERS });
  const h = W.colListHtml();          // 기본 보기는 「내 담당」
  assert.match(h, /draggable="true"/, '내 업체는 끌 수 있어야 합니다');
  assert.match(h, /openShare/);
  assert.equal(h.indexOf('(주)이비'), -1, '「내 담당」에 남의 업체가 섞이면 안 됩니다');
});

test('★ 남의 업체 목록에서는 끌거나 공유할 수 없다', () => {
  const { W } = loadApp({ companies: COMPANIES, owners: OWNERS, sideView: 'all' }, { isAdmin: true });
  const h = W.colListHtml();
  assert.match(h, /\(주\)이비/, '관리자는 전체 목록을 봅니다');
  assert.equal(/draggable="true"/.test(h), false, '남의 업체까지 끌 수 있으면 안 됩니다');
});

test('★ 담당자에게는 전체 보기와 담당자 명단이 안 뜬다', () => {
  // 담당자는 자기 것만 본다(대표 지시 2026-08-17)
  const { W } = loadApp({ companies: COMPANIES, owners: OWNERS });
  const h = W.viewBarHtml();
  assert.match(h, /내 담당/);
  assert.equal(h.indexOf('전체 사업장'), -1);
  assert.equal(h.indexOf('담당자'), -1);
});

test('★ 관리자에게는 담당자마다 진행률이 보인다', () => {
  const { W } = loadApp({ companies: COMPANIES, owners: OWNERS }, { isAdmin: true });
  const h = W.viewBarHtml();
  assert.match(h, /전체 사업장/);
  assert.match(h, /class="fill" style="width:\d/, '진행률이 없으면 누가 밀렸는지 모릅니다');
});

/* 대표 지적 2026-08-17 「맨왼쪽 너무 이상하다」 — 한 사람이 세 줄(이름줄·막대·
   「아직 N곳」)을 먹어 아홉 명이면 27줄이었다. 되돌아가면 또 그렇게 된다. */
test('★ 담당자 한 사람은 한 줄이다 — 세 줄로 되돌아가면 안 된다', () => {
  const { W } = loadApp({ companies: COMPANIES, owners: OWNERS }, { isAdmin: true });
  const h = W.viewBarHtml();
  assert.ok((h.match(/class="vrow prow/g) || []).length >= 1, '담당자 줄이 없습니다');
  assert.equal(/class="vbar"/.test(h), false, '진행률이 제 줄을 차지하면 목록이 세 배가 됩니다');
  assert.equal(/아직 \d+곳/.test(h), false, '0/28 이 이미 그 말입니다 — 되풀이하지 않습니다');
});

test('★ 급여데이터함에 안 들어온 담당자는 그렇다고 알린다 — 다만 한 번만', () => {
  // 이름·업체는 보이되 그 사람 자리는 못 연다 — 미리 말해 줘야 헛걸음을 안 한다
  const { W } = loadApp({ companies: COMPANIES, owners: { U1: OWNERS.U1 } }, { isAdmin: true });
  const h = W.viewBarHtml();
  /* 안내는 **한 줄**로 접혀 있고 긴 말은 title 에 있다(대표 지시 2026-08-17
     「좌우가 균형있게」). 그래서 글자를 못 박지 않고 「안내가 하나 있고, 그것이
     안 들어왔다는 뜻을 담고 있다」만 본다 — 문구는 다듬을 수 있어야 한다. */
  const notes = h.match(/<div class="pnote"[^>]*>[^<]*<\/div>/g) || [];
  assert.equal(notes.length, 1, '사람마다 되풀이하면 아홉 줄이 됩니다 — 맨 위에 한 번만 적습니다');
  assert.match(notes[0], /안 들어옴|들어오지 않은/, '안 들어온 사람이라는 것을 알려야 합니다');
  assert.match(h, /class="vrow prow[^"]*off"/, '안 들어온 사람은 이름이 연해야 가려집니다');
});

test('★ 공유받음 보기가 개수와 함께 보인다', () => {
  const shares = { s1: { companyId: 'co_9', companyName: '참살이', byName: '민미애', tags: ['확인 부탁드립니다'], at: 1 } };
  const { W } = loadApp({ companies: COMPANIES, owners: OWNERS, shares });
  assert.match(W.viewBarHtml(), /공유받음<\/b><span class="n">1<\/span>/);
  const h = loadApp({ companies: COMPANIES, owners: OWNERS, shares, sideView: 'shared' }).W.colListHtml();
  assert.match(h, /참살이/);
  assert.match(h, /확인 부탁드립니다/);
});

test('찾는 사업장이 없을 때는 「없다」가 아니라 「못 찾았다」로 말한다', () => {
  const { W } = loadApp({ companies: COMPANIES, owners: OWNERS, colQuery: '없는이름' });
  assert.match(W.colListHtml(), /찾는 사업장이 없습니다/);
});

/* ══════ 보기 고르기·접기 ══════ */

test('★ 보기를 누르면 바뀐다', () => {
  const { W } = loadApp({});
  W.pickSideView('late');
  assert.equal(W.App.sideView, 'late');
});

test('★ 상태 칩을 누르면 걸러진다', () => {
  const { W } = loadApp({});
  W.pickColFilter('no');
  assert.equal(W.App.colFilter, 'no');
});

test('★ 첫 칸을 접었다 폈다 할 수 있다', () => {
  const { W } = loadApp({});
  W.toggleSideFold();
  assert.equal(W.App.sideFold, true);
  W.toggleSideFold();
  assert.equal(W.App.sideFold, false);
});

test('★ 아직 안 들어온 담당자의 업체를 누르면 헛걸음 대신 안내가 뜬다', () => {
  const { W, calls } = loadApp({});
  W.openColCompany('co_3', '(주)이비', false, '', '민미애');
  assert.equal(calls.alerts.length, 1);
  assert.match(calls.alerts[0], /들어온 적이 없어/);
  assert.equal(W.App.screen, 'sites', '빈 서랍으로 들어가면 안 됩니다');
});

test('담당자가 아예 없는 업체는 내 자리에서 연다', () => {
  const { W, calls } = loadApp({});
  W.openColCompany('co_5', '신흥기업', false, '', '');
  assert.equal(calls.alerts.length, 0);
  assert.equal(W.App.screen, 'drawer');
  assert.equal(W.App.companyId, 'co_5');
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

/* ══════ 대시보드와 본문이 이어져야 한다 (대표 지적 2026-08-17) ══════
   「대시보드와 사업장의 연결이 원활하지 않다」 — 본문에는 텃골이 열려 있는데
   목록은 딴 담당자의 28곳을 보여 주고, 목록 어디에도 열린 곳 표시가 없었다. */

test('★ 사업장 목록에 번호가 붙는다 — 「28곳 중 몇 번째」를 셀 수 있어야 한다', () => {
  const { W } = loadApp({ companies: COMPANIES, owners: OWNERS, sideView: 'all' }, { isAdmin: true });
  const h = W.colListHtml();
  assert.match(h, /class="cno">1</, '첫 줄 번호가 없습니다');
  assert.match(h, /class="cno">2</, '둘째 줄 번호가 없습니다');
});

test('★ 지금 서랍에 열어 놓은 곳이 목록에서 짚어진다', () => {
  const { W } = loadApp({
    companies: COMPANIES, owners: OWNERS, sideView: 'all',
    screen: 'drawer', companyId: 'co_3', companyName: '(주)이비'
  }, { isAdmin: true });
  const h = W.colListHtml();
  assert.match(h, /class="crow[^"]* sel"/, '열어 놓은 곳이 안 짚어지면 본문과 목록이 딴 말을 합니다');
  const sel = h.match(/<div class="crow[^"]* sel"[\s\S]*?<\/div>\s*<\/div>/);
  assert.ok(sel && sel[0].indexOf('이비') >= 0, '엉뚱한 줄이 짚어졌습니다');
});

test('첫 화면(서랍이 아닐 때)에는 아무 줄도 안 짚는다 — 열어 둔 것이 없다', () => {
  const { W } = loadApp({
    companies: COMPANIES, owners: OWNERS, sideView: 'all',
    screen: 'sites', companyId: 'co_3'
  }, { isAdmin: true });
  assert.equal(/class="crow[^"]* sel"/.test(W.colListHtml()), false);
});

test('내 담당 목록은 번호 대신 끌 손잡이를 준다 — 순서를 바꾸는 칸이라서', () => {
  const { W } = loadApp({ companies: COMPANIES, owners: OWNERS });
  const h = W.colListHtml();
  assert.match(h, /class="handle"/);
});
