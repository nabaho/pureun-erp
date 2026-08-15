'use strict';
/* 골라서 한꺼번에 (대표 승인 2026-08-15) — 실행: node --test tests/*.test.js
   ☐ 는 세 목록에 진작 있었는데 골라도 할 수 있는 일이 없었다.
   한꺼번에 처리하는 단추가 생기면 **안 보이는 자료가 딸려 가는 것**과
   **덜 채워진 건이 조용히 빠지는 것**이 가장 위험하다. 그 둘을 못 박는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
const storeSrc = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');

function cut(name) {
  const m = html.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 함수를 찾을 수 없습니다');
  return m[0];
}

/* ══════ 저장 층 — 대기 칸 자료의 휴지통 ══════ */
function loadStore() {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(storeSrc, { filename: 'store.js' }).runInContext(sandbox);
  const S = sandbox.window.PuPaydataStore;
  S.init({ uid: 'U1' });
  return S;
}

const PEND = { filename: '사진.jpg', file: 'pu_paydata/U1/pending/p1.jpg', at: 100, by: 'U1' };

/* trashUpdate 를 그대로 쓰면 pending 자리가 남아 휴지통과 대기 칸 **양쪽에**
   같은 자료가 보인다. 그래서 대기 칸 전용 길이 따로 있다. */
test('★ 대기 칸 자료를 버리면 대기 칸 자리가 비워진다', () => {
  const S = loadStore();
  const up = S.trashPendingUpdate('p1', PEND, '');
  assert.equal(up[S.pendingPath('p1', '')], null, '대기 칸에 그대로 남아 두 번 보입니다');
  assert.ok(up[S.trashPath('p1', '')], '휴지통에 안 들어갔습니다');
  assert.equal(up[S.trashPath('p1', '')].fromPending, true, '되살릴 때 어디로 갈지 알 수 없습니다');
});

test('★ 대기 칸에서 버린 것은 대기 칸으로 돌아간다 — 서랍으로 가면 유령이 된다', () => {
  const S = loadStore();
  const trashed = S.trashPendingUpdate('p1', PEND, '')[S.trashPath('p1', '')];
  const back = S.restoreUpdate('p1', trashed, '');
  assert.ok(back[S.pendingPath('p1', '')], '대기 칸으로 돌아가지 않았습니다');
  assert.equal(back[S.trashPath('p1', '')], null);
  assert.equal(back[S.itemPath('keep', 'p1', '')], undefined,
    '사업장·귀속월이 없는 자료가 서랍에 들어가면 어느 목록에도 안 걸립니다');
  const restored = back[S.pendingPath('p1', '')];
  assert.equal(restored.fromPending, undefined, '되살린 자료에 지웠던 표가 남으면 안 됩니다');
  assert.equal(restored.trashedAt, undefined);
  assert.equal(restored.filename, '사진.jpg', '되살렸는데 내용이 바뀌면 안 됩니다');
});

test('서랍 자료는 예전처럼 서랍으로 돌아간다 — 대기 칸 길이 생겨도 그대로다', () => {
  const S = loadStore();
  const item = { filename: 'a.jpg', month: '202608', companyId: 'co_1', kind: 'attend' };
  const trashed = S.trashUpdate('i1', item, '')[S.trashPath('i1', '')];
  const back = S.restoreUpdate('i1', trashed, '');
  assert.ok(back[S.itemPath('202608', 'i1', '')], '서랍으로 안 돌아갔습니다');
  assert.equal(back[S.pendingPath('i1', '')], undefined);
});

/* 건마다 따로 쓰면 중간에 끊겼을 때 절반만 옮겨진 채 아무도 모른다. */
test('★ 폴더 한꺼번에 옮기기는 쓰기가 한 번이다', async () => {
  const S = loadStore();
  const writes = [];
  S.init({ db: { ref: () => ({ update: up => { writes.push(up); return Promise.resolve(); } }) } });
  const n = await S.setFolderMany('202608', ['a', 'b', 'c'], 'f1', '');
  assert.equal(n, 3);
  assert.equal(writes.length, 1, '건마다 따로 쓰면 절반만 옮겨질 수 있습니다');
  assert.equal(Object.keys(writes[0]).length, 3);
});

test('폴더에서 빼기는 빈 값이 아니라 null 로 쓴다 — 빈 문자열은 폴더 이름이 된다', async () => {
  const S = loadStore();
  const writes = [];
  S.init({ db: { ref: () => ({ update: up => { writes.push(up); return Promise.resolve(); } }) } });
  await S.setFolderMany('202608', ['a'], '', '');
  assert.equal(Object.values(writes[0])[0], null);
});

test('고른 것이 없으면 아무것도 쓰지 않는다', async () => {
  const S = loadStore();
  const writes = [];
  S.init({ db: { ref: () => ({ update: up => { writes.push(up); return Promise.resolve(); } }) } });
  assert.equal(await S.setFolderMany('202608', [], 'f1', ''), 0);
  assert.equal(writes.length, 0);
});

/* ══════ 화면 — 대기 칸 한꺼번에 서랍으로 ══════ */
function loadBulk(pending, picked) {
  const asked = { confirm: [], alert: [] };
  const writes = [];
  const sandbox = {
    window: {}, console, Date,
    document: { getElementById: () => null },      // 화면 밖에서 부른 경우 — 적어 둔 값을 쓴다
    confirm: m => { asked.confirm.push(m); return true; },
    alert: m => { asked.alert.push(m); }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(storeSrc, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const $ = id => document.getElementById(id);',
    'const S = window.PuPaydataStore; S.init({uid:"U1"});',
    'const App = ' + JSON.stringify({
      companies: [{ id: 'co_1', name: '화담원' }, { id: 'co_2', name: '이비' }],
      pending: pending, pendTag: {}, pick: { pending: picked },
      viewingUid: '', viewingDeputy: false, month: '2026-08'
    }) + ';',
    'App.render = function(){};',
    'const db = { ref: function(){ return { update: function(up){ __w.push(up); return Promise.resolve(); } }; } };',
    'var __w = [];',
    'function refreshArrivals(){ __refreshed = true; }',
    'var __refreshed = false;',
    cut('pickOn'), cut('pickList'), cut('pickOf'), cut('pickPut'),
    cut('canWrite'), cut('guessTag'), cut('pendTagOf'), cut('setPendTag'),
    cut('pendTagLive'), cut('bulkToDrawer'), cut('bulkPendingTrash'),
    'window.App = App; window.bulkToDrawer = bulkToDrawer; window.bulkPendingTrash = bulkPendingTrash;',
    'window.__writes = function(){ return __w; }; window.__refreshed = function(){ return __refreshed; };'
  ].join('\n'), { filename: 'bulk.js' }).runInContext(sandbox);
  return { W: sandbox.window, asked, writes };
}

const THREE = {
  p1: { filename: '화담원_2026-08_근태.jpg', at: 3 },
  p2: { filename: '이비_2026-08_근태.jpg', at: 2 },
  p3: { filename: '사진 2026-08-14.jpg', at: 1 }      // 업체를 알 수 없다
};

test('★ 고른 것을 한 번의 쓰기로 서랍에 내려보낸다', async () => {
  const { W } = loadBulk(THREE, { p1: true, p2: true });
  W.bulkToDrawer();
  await new Promise(r => setImmediate(r));
  assert.equal(W.__writes().length, 1, '건마다 따로 쓰면 중간에 끊겼을 때 알 수 없습니다');
  assert.equal(Object.keys(W.App.pending).length, 1, '내려간 건이 대기 칸에 남아 있습니다');
  assert.equal(W.__refreshed(), true, '도착 표시를 다시 읽지 않으면 「미도착 0장」으로 남습니다');
});

/* 조용히 빠뜨리면 사람은 다 들어간 줄 알고 원본을 지운다. */
test('★ 이름표가 덜 채워진 건은 대기 칸에 남고, 무엇이 남았는지 이름까지 알린다', async () => {
  const { W, asked } = loadBulk(THREE, { p1: true, p3: true });
  W.bulkToDrawer();
  await new Promise(r => setImmediate(r));
  assert.ok(W.App.pending.p3, '사업장이 비어 있는 건은 남아야 합니다');
  assert.ok(!W.App.pending.p1, '채워진 건은 내려가야 합니다');
  const said = asked.alert.join('\n');
  assert.match(said, /2건 중 1건/, '몇 건이 갔는지 말해 주지 않습니다');
  assert.match(said, /사진 2026-08-14\.jpg/, '남은 건의 이름을 말해 주지 않습니다');
  assert.match(said, /사업장/, '왜 남았는지 말해 주지 않습니다');
});

test('한 건도 못 내려보내면 쓰지 않고 이유만 알린다', async () => {
  const { W, asked } = loadBulk(THREE, { p3: true });
  W.bulkToDrawer();
  await new Promise(r => setImmediate(r));
  assert.equal(W.__writes().length, 0);
  assert.match(asked.alert.join('\n'), /내려보낼 수 있는 건이 없습니다/);
});

test('★ 남의 자리에서는 한꺼번에 처리하지 않는다 — 서버가 어차피 거절한다', async () => {
  const { W } = loadBulk(THREE, { p1: true, p2: true });
  W.App.viewingUid = 'U9'; W.App.viewingDeputy = false;
  W.bulkToDrawer();
  await new Promise(r => setImmediate(r));
  assert.equal(W.__writes().length, 0);
});

test('★ 대기 칸에서 한꺼번에 버리면 그 건들이 대기 칸에서 빠진다', async () => {
  const { W } = loadBulk(THREE, { p1: true, p2: true });
  W.bulkPendingTrash();
  await new Promise(r => setImmediate(r));
  assert.equal(W.__writes().length, 1);
  assert.equal(JSON.stringify(Object.keys(W.App.pending)), JSON.stringify(['p3']));
  assert.equal(W.App.trash, null, '휴지통을 다시 읽지 않으면 방금 버린 것이 안 보입니다');
});

/* ══════ 안 보이는 자료가 딸려 가면 안 된다 ══════
   서랍의 「모두 고르기」는 지금 그려진 것만 골라야 한다. 폴더를 골라 세 건만
   보고 있는데 안 보이는 것까지 골라지면, 한꺼번에 휴지통으로 딸려 간다. */
function loadVisible() {
  const sandbox = { window: {}, console, Date };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(storeSrc, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1"});',
    'const App = ' + JSON.stringify({
      companyId: 'co_1', kind: 'attend', query: '', folderPick: 'all',
      companies: [], pending: {}, arrivals: {}, month: '2026-08',
      itemsKeep: {}, itemsMonth: {
        a: { companyId: 'co_1', kind: 'attend', filename: 'a.jpg', folder: 'f1' },
        b: { companyId: 'co_1', kind: 'attend', filename: 'b.jpg', folder: 'f2' },
        c: { companyId: 'co_1', kind: 'attend', filename: 'c.jpg' }
      }
    }) + ';',
    cut('drawerModel'), cut('searchRows'), cut('folderRows'),
    cut('companyDocCount'), cut('sitesModel'), cut('pickVisible'),
    'window.App = App; window.pickVisible = pickVisible;'
  ].join('\n'), { filename: 'vis.js' }).runInContext(sandbox);
  return sandbox.window;
}

test('★ 폴더를 골라 놓으면 「모두 고르기」도 그 폴더 것만 고른다', () => {
  const W = loadVisible();
  assert.equal(JSON.stringify(W.pickVisible('drawer').sort()), JSON.stringify(['a','b','c']));
  W.App.folderPick = 'f1';
  assert.equal(JSON.stringify(W.pickVisible('drawer')), JSON.stringify(['a']),
    '안 보이는 자료가 골라지면 한꺼번에 휴지통으로 딸려 갑니다');
});

test('찾기 줄과 폴더를 함께 걸러도 화면과 같다', () => {
  const W = loadVisible();
  W.App.folderPick = 'all'; W.App.query = 'b';
  assert.equal(JSON.stringify(W.pickVisible('drawer')), JSON.stringify(['b']));
});
