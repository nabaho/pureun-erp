'use strict';
// 2차 D2 — 남의 자리 보기·사유·휴가 대리 화면 배선. 실행: node --test tests/*.test.js
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

/* 화면 전부를 실제로 돌릴 수 있는 샌드박스 — App 상태를 자유롭게 바꿔 가며
   screenPending/screenDrawer/screenTrash/screenDeputy 가 실제로 무엇을
   그리는지 본다(글자 찾기가 아니라 렌더 결과를 본다). */
function loadApp(appState) {
  const sandbox = { window: {}, console, Date, document: { getElementById: () => null } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1"});',
    'const App = ' + JSON.stringify(Object.assign({
      pick: {}, companies: [], pending: {}, arrivals: {}, trash: {},
      folders: {}, folderPick: 'all', folderEdit: { mode: '', fid: '', value: '' },
      staffList: [], deputies: {}, pendTag: {}, month: '2026-08', kind: 'attend',
      viewingUid: '', viewingName: '', viewingDeputy: false
    }, appState)) + ';',
    cut('esc'), cut('jsq'), cut('thisMonth'),
    cut('pickOn'), cut('pickToggle'), cut('pickSetAll'), cut('pickList'),
    cut('pickAllOn'), cut('pickPrune'), cut('pickOf'), cut('pickPut'), cut('pickBar'),
    cut('canWrite'), cut('bannerHtml'),
    cut('guessTag'), cut('pendTagOf'), cut('setPendTag'), cut('screenPending'),
    cut('drawerCounts'), cut('drawerModel'), cut('searchRows'),
    cut('folderCounts'), cut('folderRows'), cut('folderBar'), cut('folderEditorHtml'),
    cut('folderOptionsHtml'), cut('monthShift'), cut('monthCount'), cut('monthAhead'), cut('monthStripHtml'), cut('sideCtx'), cut('sideListModel'), cut('coArrivedAt'), cut('screenDrawer'),
    cut('screenTrash'), cut('screenDeputy'),
    'window.canWrite = canWrite; window.bannerHtml = bannerHtml;',
    'window.screenPending = screenPending; window.screenDrawer = screenDrawer;',
    'window.screenTrash = screenTrash; window.screenDeputy = screenDeputy;'
  ].join('\n'), { filename: 'app.js' }).runInContext(sandbox);
  return sandbox.window;
}

/* ══════ canWrite ══════ */

test('내 자리는 늘 고칠 수 있다', () => {
  const W = loadApp({ viewingUid: '' });
  assert.equal(W.canWrite(), true);
});

test('★ 남의 자리는 대리가 아니면 못 고친다', () => {
  const W = loadApp({ viewingUid: 'U2', viewingDeputy: false });
  assert.equal(W.canWrite(), false);
});

test('★ 대리로 맡은 자리는 고칠 수 있다', () => {
  const W = loadApp({ viewingUid: 'U2', viewingDeputy: true });
  assert.equal(W.canWrite(), true);
});

/* ══════ 배너 ══════ */

test('내 자리에서는 배너가 없다', () => {
  const W = loadApp({ viewingUid: '' });
  assert.equal(W.bannerHtml(), '');
});

test('★ 남의 자리 배너는 「보기만」이라고 말한다', () => {
  const W = loadApp({ viewingUid: 'U2', viewingName: '박은비', viewingDeputy: false });
  const h = W.bannerHtml();
  assert.match(h, /박은비/);
  assert.match(h, /보기만/);
  assert.match(h, /내 자리로/);
});

test('★ 대리 자리 배너는 「맡은 자리」라고 말한다 — 「보기만」이 아니다', () => {
  const W = loadApp({ viewingUid: 'U2', viewingName: '박은비', viewingDeputy: true });
  const h = W.bannerHtml();
  assert.match(h, /맡은 자리/);
  assert.equal(/보기만/.test(h), false);
});

/* ══════ 남의 자리에서는 고치는 단추가 안 보인다 ══════ */

test('★ 대기 칸 — 남의 자리에서는 올리기 단추가 없다', () => {
  const W = loadApp({ viewingUid: 'U2', viewingDeputy: false, pending: { p1: { filename: 'a.jpg', at: 1 } } });
  const h = W.screenPending();
  assert.equal(/pickFiles\(\)/.test(h), false, '파일 올리기 단추가 보입니다');
  assert.equal(/pickShot\(\)/.test(h), false, '촬영 단추가 보입니다');
  assert.equal(/fileToDrawer\(/.test(h), false, '서랍으로 단추가 보입니다');
});

test('내 자리에서는 올리기 단추가 있다', () => {
  const W = loadApp({ viewingUid: '', pending: { p1: { filename: 'a.jpg', at: 1 } } });
  const h = W.screenPending();
  assert.match(h, /pickFiles\(\)/);
  assert.match(h, /fileToDrawer\(/);
});

test('★ 대리로 맡은 자리에서는 올리기 단추가 있다', () => {
  const W = loadApp({ viewingUid: 'U2', viewingDeputy: true, pending: { p1: { filename: 'a.jpg', at: 1 } } });
  const h = W.screenPending();
  assert.match(h, /pickFiles\(\)/);
  assert.match(h, /fileToDrawer\(/);
});

const ITEMS_MONTH = { a1: { companyId: 'co_1', kind: 'attend', month: '202608', filename: '근태.jpg', filedAt: 10 } };

test('★ 서랍 — 남의 자리에서는 지우기·폴더 만들기가 없다', () => {
  const W = loadApp({ viewingUid: 'U2', viewingDeputy: false, companyId: 'co_1', itemsMonth: ITEMS_MONTH, itemsKeep: {} });
  const h = W.screenDrawer();
  assert.equal(/toTrash\(/.test(h), false, '지우기 단추가 보입니다');
  assert.equal(/openFolderEditor\('new'\)/.test(h), false, '폴더 만들기 단추가 보입니다');
  assert.equal(/assignFolder\(/.test(h), false, '폴더 지정 골라잡기가 보입니다');
});

test('내 자리 서랍에는 지우기·폴더 만들기가 있다', () => {
  const W = loadApp({ viewingUid: '', companyId: 'co_1', itemsMonth: ITEMS_MONTH, itemsKeep: {} });
  const h = W.screenDrawer();
  assert.match(h, /toTrash\(/);
  assert.match(h, /openFolderEditor\('new'\)/);
});

test('★ 휴지통 — 남의 자리에서는 되살리기가 없다', () => {
  const W = loadApp({ viewingUid: 'U2', viewingDeputy: false, trash: { t1: { filename: 'a.jpg', trashedAt: 1 } } });
  const h = W.screenTrash();
  assert.equal(/restoreItem\(/.test(h), false, '되살리기 단추가 보입니다');
});

test('내 휴지통에는 되살리기가 있다', () => {
  const W = loadApp({ viewingUid: '', trash: { t1: { filename: 'a.jpg', trashedAt: 1 } } });
  const h = W.screenTrash();
  assert.match(h, /restoreItem\(/);
});

/* ══════ 휴가 대리 화면 ══════ */

test('자리 맡기기 화면에 맡기는 폼이 있다', () => {
  const W = loadApp({});
  const h = W.screenDeputy();
  assert.match(h, /id="depWho"/);
  assert.match(h, /id="depFrom"/);
  assert.match(h, /id="depTo"/);
  assert.match(h, /submitDeputy\(\)/);
});

test('★ 기간이 지나면 「기간 끝남」으로 보인다 — 「지금 거두기」는 여전히 있다', () => {
  const day = 86400000, now = Date.now();
  const W = loadApp({ deputies: { U2: { name: '박은비', to: now - 10 * day } } });
  const h = W.screenDeputy();
  assert.match(h, /기간 끝남/);
  assert.match(h, /cancelDeputy\('U2'\)/);
});

test('맡긴 사람이 없으면 빈 안내를 보여준다', () => {
  const W = loadApp({ deputies: {} });
  assert.match(W.screenDeputy(), /아직 아무에게도 맡기지 않았습니다/);
});

/* ══════ 배선 ══════ */

test('★ 로그인 마무리에서 signIn 을 부른다 — 이름 명단에 나를 남긴다', () => {
  assert.match(html, /S\.signIn\(/);
});

test('머리글에 담당자 고르기·자리 맡기기 단추가 있다', () => {
  assert.match(html, /openStaffPicker\(\)/);
  assert.match(html, /App\.go\('deputy'\)/);
});
