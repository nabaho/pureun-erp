'use strict';
/* 서랍 간략 정리 · 월별 보기 · 끌어다 놓기 (대표 지시 2026-08-17)
   실행: node --test tests/*.test.js · 목업 docs/mockups/paydata-drawer-tidy.html */
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

function load(appState) {
  const sandbox = { window: {}, console, Date, document: { getElementById: () => null } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1"});',
    'const $ = id => document.getElementById(id);',
    'const App = ' + JSON.stringify(Object.assign({
      screen: 'drawer', companyId: 'co_1', companyName: '화담원', month: '2026-08',
      kind: 'attend', query: '', arrivals: {}, monthEdit: false, viewingUid: '', viewingDeputy: false
    }, appState)) + ';',
    'App.render = function(){};',
    cut('esc'), cut('bannerHtml'), cut('jsq'), cut('thisMonth'), cut('canWrite'),
    cut('monthShift'), cut('monthCount'), cut('monthAhead'), "const WEEKDAY = ['일','월','화','수','목','금','토'];", cut('todayLabel'), cut('monthStripHtml'),
    cut('dropTargetNow'), cut('dropHintHtml'), cut('dropHasFiles'),
    'window.App = App; window.monthShift = monthShift; window.monthCount = monthCount;',
    'window.monthStripHtml = monthStripHtml; window.dropTargetNow = dropTargetNow;',
    'window.dropHintHtml = dropHintHtml; window.dropHasFiles = dropHasFiles;',
    'window.canWrite = canWrite;'
  ].join('\n'), { filename: 'app.js' }).runInContext(sandbox);
  return sandbox.window;
}

/* ══════ 월별로 간략히 보기 ══════ */

test('★ 달을 앞뒤로 옮긴다 — 해가 바뀌어도 맞다', () => {
  const W = load();
  assert.equal(W.monthShift('2026-08', -1), '2026-07');
  assert.equal(W.monthShift('2026-01', -1), '2025-12');
  assert.equal(W.monthShift('2025-12', 1), '2026-01');
});

/* 여섯 달을 늘어놓던 것을 **한 칸**으로 줄였다(대표 지시 2026-08-17
   「월은 1개씩만 보면 된다」) — 줄이 길어 머리가 다시 두꺼워졌기 때문이다. */
test('★ 달은 한 칸만 보인다 — 옆 달이 줄에 늘어서지 않는다', () => {
  const W = load({ month: '2026-08' });
  const h = W.monthStripHtml();
  assert.equal((h.match(/class="mo/g) || []).length, 1, '★ 달 칸이 둘 이상입니다');
  ['3월', '4월', '5월', '6월', '7월', '9월'].forEach(m =>
    assert.equal(h.indexOf('>' + m + '<') >= 0, false, m + '이 남아 있습니다'));
});

/* 달을 잘못 보고 있는 것이 모든 「자료가 없다」의 첫째 까닭이다 — 한 칸만
   보이니 그 칸이 **몇 년 몇 월인지 · 몇 장인지**를 다 말해야 한다. */
test('★ 그 한 칸이 몇 년 몇 월인지와 몇 장인지를 말한다', () => {
  const W = load({ month: '2026-08', arrivals: { co_1: {
    202605: { attend: { a: 1, b: 1 }, last: 1 },
    202608: { ledger: { c: 1 }, last: 1 }
  } } });
  assert.equal(W.monthCount('co_1', '2026-05'), 2);
  assert.equal(W.monthCount('co_1', '2026-08'), 1);
  const h = W.monthStripHtml();
  assert.match(h, /2026년 8월/, '해가 안 보이면 지난해 8월과 안 갈립니다');
  assert.match(h, /<span class="c">1</, '장수가 없습니다');
});

test('평소에는 「직접 적기」 단추만, 누르면 적는 칸이 나온다', () => {
  assert.match(load({ monthEdit: false }).monthStripHtml(), /직접 적기/);
  assert.match(load({ monthEdit: true }).monthStripHtml(), /id="monthInput"/);
});

/* ══════ 서랍 머리 한 줄 ══════ */

test('★ 서랍 머리가 한 줄이다 — 이름·건수·단추가 같은 줄에', () => {
  assert.match(html, /class="dhead"/, '머리 줄이 없습니다');
  const d = cut('screenDrawer');
  assert.match(d, /class="dtitle"/, '이름이 머리 줄에 없습니다');
  assert.match(d, /class="dmeta"/, '건수·담당자가 머리 줄에 없습니다');
  assert.match(d, /class="dacts"/, '단추가 머리 줄에 없습니다');
});

/* 자료가 쌓여 내려가도 탭·찾기를 쓰려고 맨 위까지 되올라오지 않아야 한다
   (대표 지시 2026-08-13, 사진첩과 같은 방식). 한 줄로 합치면서 잃기 쉽다. */
test('★ 폴더·찾기를 한 줄로 합쳐도 굴러가는 동안 붙어 있다', () => {
  const d = cut('screenDrawer');
  assert.match(d, /id="findBar" class="foldfind"/);
  /* 2026-08-17 「틀고정」으로 **머리 덩어리 하나**가 통째로 붙게 바뀌었다 —
     탭·찾기가 스스로 붙는 대신 그 덩어리 안에 들어 있다. 그래서 「#findBar 가
     sticky 인가」가 아니라 「붙는 덩어리 안에 있는가」를 본다. */
  assert.match(html, /\.stickhead\{[^}]*position:sticky/, '머리가 안 붙으면 되올라와야 합니다');
  const head = d.slice(d.indexOf('stickhead'));
  assert.ok(head.indexOf('.stickhead 끝') > head.indexOf('id="findBar"'),
    '★ 찾기 줄이 붙는 덩어리 밖에 있습니다');
});

/* ══════ 끌어다 놓기 ══════ */

test('★ 서랍 위에 놓으면 그 사업장·그 달·그 종류로 담긴다', () => {
  const W = load({ screen: 'drawer', kind: 'attend' });
  const t = W.dropTargetNow();
  assert.equal(t.where, 'drawer');
  assert.equal(t.companyId, 'co_1');
  assert.equal(t.month, '2026-08');
  assert.equal(t.kind, 'attend');
  const hint = W.dropHintHtml(t);
  assert.match(hint.sub, /화담원/);
  assert.match(hint.sub, /2026-08/);
  assert.match(hint.sub, /근태/);
});

test('★ 첫 화면에 놓으면 대기 칸으로 간다 — 이름으로 짐작한다고 알린다', () => {
  const W = load({ screen: 'sites' });
  const t = W.dropTargetNow();
  assert.equal(t.where, 'pending');
  assert.match(W.dropHintHtml(t).sub, /짐작/);
});

/* 근로계약서는 월이 없는 칸이라 「이 달」이라 적을 수 없다 — 대기 칸으로 보내
   사람이 이름표를 눈으로 보게 한다. */
test('근로계약서 탭에 놓으면 대기 칸으로 간다', () => {
  assert.equal(load({ screen: 'drawer', kind: 'contract' }).dropTargetNow().where, 'pending');
});

test('★ 남의 자리에서는 끌어다 놓아도 담기지 않는다', () => {
  const W = load({ viewingUid: 'U9', viewingDeputy: false });
  assert.equal(W.canWrite(), false);
  assert.match(cut('dropWatch'), /canWrite\(\)/, '남의 자리에 담기면 안 됩니다');
});

/* 화면 안에서 사업장 순서를 바꾸려고 끄는 것에는 파일이 없다 — 그때 안내가
   뜨면 순서 바꾸기를 방해한다. */
test('★ 파일을 끌 때만 안내가 뜬다 — 사업장 순서 바꾸기와 안 부딪힌다', () => {
  const W = load();
  assert.equal(W.dropHasFiles({ dataTransfer: { types: ['Files'] } }), true);
  assert.equal(W.dropHasFiles({ dataTransfer: { types: ['text/plain'] } }), false);
  assert.equal(W.dropHasFiles({}), false);
});

/* ⚠ 올리자마자 판독하면 주민번호 가림을 통째로 건너뛴다. */
test('★ 끌어다 놓아도 판독을 자동으로 돌리지 않는다', () => {
  const d = cut('dropFiles');
  assert.equal(/startMask\(|runRead\(|PuDocRead\./.test(d), false,
    '★ 자동 판독은 가림을 건너뜁니다 — 주민번호가 그대로 나갑니다');
});

/* ══════ 저장 층 — 곧장 서랍으로 ══════ */
function loadStore() {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  return sandbox.window.PuPaydataStore;
}

function fakeDeps(writes) {
  return {
    uid: 'U1',
    storage: { ref: () => ({ put: () => Promise.resolve() }) },
    db: { ref: () => ({ update: up => { writes.push(up); return Promise.resolve(); } }) }
  };
}

test('★ 이름표가 덜 채워지면 서랍에 억지로 넣지 않고 대기 칸에 둔다', async () => {
  const S = loadStore();
  const writes = [];
  S.init(fakeDeps(writes));
  const file = { name: 'a.jpg', type: 'image/jpeg', size: 10 };
  const r = await S.saveFileToDrawer(file, { companyId: '', month: '', kind: 'attend' }, '');
  assert.equal(r.filed, false, '귀속월 없는 자료를 서랍에 넣으면 어느 칸에도 안 걸립니다');
  assert.equal(writes.length, 1, '대기 칸에는 담겨 있어야 합니다');
});

test('★ 이름표가 다 있으면 대기 칸을 거치지 않고 서랍으로 간다', async () => {
  const S = loadStore();
  const writes = [];
  S.init(fakeDeps(writes));
  const file = { name: 'a.jpg', type: 'image/jpeg', size: 10 };
  const r = await S.saveFileToDrawer(file,
    { companyId: 'co_1', companyName: '화담원', month: '2026-08', kind: 'attend' }, '');
  assert.equal(r.filed, true);
  const last = writes[writes.length - 1];
  const keys = Object.keys(last);
  assert.ok(keys.some(k => /\/items\/202608\//.test(k)), '서랍 칸에 안 들어갔습니다');
  assert.ok(keys.some(k => /\/pending\//.test(k) && last[k] === null), '대기 칸을 안 비웠습니다');
  assert.ok(keys.some(k => /arrivals\/co_1\/202608/.test(k)), '도착 표시가 안 붙었습니다');
});

/* 창고 자리를 화면이 짐작하면 어긋난다 — 저장 층이 만든 그 자리를 그대로 써야
   나중에 「확대 보기」가 파일을 찾는다. */
test('★ 서랍으로 곧장 담은 자료도 창고 자리가 제대로 붙는다', async () => {
  const S = loadStore();
  const writes = [];
  S.init(fakeDeps(writes));
  await S.saveFileToDrawer({ name: 'a.jpg', type: 'image/jpeg', size: 10 },
    { companyId: 'co_1', companyName: '화담원', month: '2026-08', kind: 'attend' }, '');
  const last = writes[writes.length - 1];
  const item = last[Object.keys(last).filter(k => /\/items\/202608\//.test(k))[0]];
  assert.match(item.file, /^pu_paydata\/U1\/pending\/.*\.jpg$/, '창고 자리가 안 붙었습니다: ' + item.file);
  assert.equal(item.from, 'drop', '어디서 들어온 것인지 남겨야 합니다');
});
