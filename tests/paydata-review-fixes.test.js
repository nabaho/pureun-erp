'use strict';
/* 2026-08-15 전체 검토가 찾은 고침들 — 실행: node --test tests/*.test.js
   하나하나가 「화면은 멀쩡해 보이는데 실제로는 안 되던 것」이라, 되돌아가면
   또 아무도 모르게 같은 일이 벌어진다. 그래서 여기에 못 박아 둔다. */
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

/* ══════ 1) 업체 이름에 작은따옴표가 있어도 그 줄이 눌린다 ══════
   esc() 는 ' 를 &#39; 로 바꾼다. 브라우저는 속성을 읽을 때 그것을 **다시 '** 로
   되돌린 뒤 자바스크립트로 읽는다 — 그래서 onclick="App.go('…','이름')" 안에
   esc() 만 쓰면 이름의 ' 가 문자열을 끊어 그 줄이 아예 안 눌렸다. */
function loadJsq() {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(cut('esc') + '\n' + cut('jsq'), { filename: 'jsq.js' }).runInContext(sandbox);
  return sandbox;
}

test("★ jsq 는 작은따옴표를 \\' 로 막는다 — 되돌아와도 문자열이 안 끊긴다", () => {
  const sb = loadJsq();
  // &#39; 가 브라우저에서 ' 로 되돌아오므로, 그 앞에 \ 가 남아 있어야 한다.
  assert.equal(sb.jsq("김'스토어"), "김&#39;스토어".replace('&#39;', '\\&#39;'));
  assert.equal(sb.jsq('가\\나'), '가\\\\나');
});

test('jsq 도 esc 처럼 태그를 막는다 — 이름에 <script> 가 들어와도 글자로 남는다', () => {
  const sb = loadJsq();
  assert.equal(sb.jsq('<b>'), '&lt;b&gt;');
});

function loadSites() {
  const sandbox = { window: {}, console, Date };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    /* 본문 목록은 왼쪽에서 고른 보기를 따른다(2026-08-17) — 그 계산 층도 함께 싣는다. */
    'const S = window.PuPaydataStore; S.init({uid:"U1", name:"권형하", isAdmin:true});',
    'const App = { month:"2026-08", pick:{}, companies:[], pending:{}, arrivals:{},'
      + ' me:{uid:"U1", email:"p001@pureun.kr"}, owners:{}, shares:{}, myOrder:[], dir:null,'
      + ' sideView:"all", colFilter:"all", colQuery:"" };',
    cut('esc'), cut('jsq'), cut('thisMonth'), cut('coArrivedAt'),
    cut('pickOn'), cut('pickToggle'), cut('pickSetAll'), cut('pickList'),
    cut('pickAllOn'), cut('pickPrune'), cut('pickOf'), cut('pickPut'),
    cut('companyDocCount'), cut('sitesModel'), cut('sideCtx'), cut('guessTag'), cut('siteState'), cut('sideListModel'),
    cut('bannerHtml'), cut('monthShift'), cut('monthCount'), cut('monthAhead'), "const WEEKDAY = ['일','월','화','수','목','금','토'];", cut('todayLabel'), cut('monthStripHtml'),
    cut('pickBar'), cut('mailBarHtml'), cut('screenSites'),
    'window.App = App; window.screenSites = screenSites;'
  ].join('\n'), { filename: 'screen.js' }).runInContext(sandbox);
  return sandbox;
}

test("★ 업체 이름에 ' 가 있어도 onclick 이 성립한다", () => {
  const sb = loadSites();
  sb.window.App.companies = [{ id: 'co_1', name: "김'스토어" }];
  const out = sb.window.screenSites.call(sb);
  /* 속성이 브라우저를 거친 뒤의 모습으로 되돌려 놓고 문법이 성립하는지 본다 —
     예전 코드는 여기서 SyntaxError 가 나 그 줄이 통째로 안 눌렸다. */
  /* 2026-08-17부터 본문 목록도 왼쪽과 **같은 길**로 연다(openColCompany). */
  const m = out.match(/onclick="(openColCompany\([^"]*)"/);
  assert.ok(m, '업체 줄의 onclick 을 찾지 못했습니다');
  const asBrowserSees = m[1].replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  assert.ok(asBrowserSees.indexOf("김\\'스토어") >= 0, '이름의 따옴표가 막혀 있지 않습니다: ' + asBrowserSees);
  assert.doesNotThrow(() => new vm.Script('function openColCompany(){};' + asBrowserSees),
    '이름의 작은따옴표가 문자열을 끊었습니다 — 그 줄은 눌러도 아무 일도 안 일어납니다');
});

/* ══════ 2) 대기 칸에서 사람이 고른 이름표는 다시 그려도 남는다 ══════
   짐작값을 화면 그릴 때마다 새로 채워, 사업장을 골라 두고 ☐ 를 누르면
   (다시 그린다) 방금 고른 것이 되돌아갔다. */
function loadPend() {
  const sandbox = { window: {}, console, Date };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1"});',
    'const App = { companies: [{id:"co_1",name:"화담원"}], pendTag: {} };',
    cut('guessTag'), cut('pendTagOf'), cut('setPendTag'),
    'window.App = App; window.pendTagOf = pendTagOf; window.setPendTag = setPendTag;'
  ].join('\n'), { filename: 'pend.js' }).runInContext(sandbox);
  return sandbox.window;
}

test('★ 사람이 고른 사업장은 다시 그려도 그대로다', () => {
  const W = loadPend();
  const rec = { filename: '근태표.jpg' };
  assert.equal(W.pendTagOf('p1', rec).companyId, '', '못 알아본 파일은 빈칸으로 시작합니다');
  W.setPendTag('p1', 'companyId', 'co_1');
  assert.equal(W.pendTagOf('p1', rec).companyId, 'co_1', '사람이 고른 것이 되돌아가면 안 됩니다');
});

test('★ 사람이 고친 귀속월이 짐작값을 이긴다', () => {
  const W = loadPend();
  const rec = { filename: '화담원_2026-08_근태.jpg' };
  assert.equal(W.pendTagOf('p1', rec).month, '2026-08');
  W.setPendTag('p1', 'month', '2026-07');
  assert.equal(W.pendTagOf('p1', rec).month, '2026-07', '손으로 고친 달이 짐작값에 덮이면 안 됩니다');
});

test('안 고친 칸은 그대로 짐작값이다 — 하나 고쳤다고 나머지가 비면 안 된다', () => {
  const W = loadPend();
  const rec = { filename: '화담원_2026-08_근태.jpg' };
  W.setPendTag('p1', 'kind', 'ledger');
  const g = W.pendTagOf('p1', rec);
  assert.equal(g.kind, 'ledger');
  assert.equal(g.month, '2026-08');
  assert.equal(g.companyId, 'co_1');
});

/* ══════ 3) 자리를 옮기는 사이 늦게 온 답은 버린다 ══════
   남의 자리를 보다 「내 자리로」를 누르면, 이미 보낸 읽기 요청은 취소되지 않는다.
   그 답이 뒤늦게 도착해 그려지면 「내 자리」 화면에 남의 서류가 뜬다. */
function loadSeatGuard() {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script([
    'const App = { viewingUid: "" };',
    cut('seatNow'), cut('seatSame'),
    'window.App = App; window.seatNow = seatNow; window.seatSame = seatSame;'
  ].join('\n'), { filename: 'seat.js' }).runInContext(sandbox);
  return sandbox.window;
}

test('★ 자리가 바뀌면 늦게 온 답을 버린다고 판정한다', () => {
  const W = loadSeatGuard();
  W.App.viewingUid = 'U9';
  const seat = W.seatNow();
  assert.equal(W.seatSame(seat), true);
  W.App.viewingUid = '';                 // 「내 자리로」 를 눌렀다
  assert.equal(W.seatSame(seat), false, '남의 자리에서 온 답이 내 자리 화면에 그려집니다');
});

/* 자리를 읽는 곳마다 이 문지기를 거쳐야 한다 — 한 군데만 빠져도 그 화면에서
   남의 자료가 샌다. 함수 본문에 실제로 들어 있는지 글자로 확인한다. */
test('★ 자리별로 읽는 함수는 모두 늦게 온 답을 버린다', () => {
  ['ensureDrawerData', 'ensureFolders', 'ensureTrash'].forEach(name => {
    const src = cut(name);
    assert.match(src, /seatNow\(\)/, name + ' 가 부르기 전 자리를 적어 두지 않습니다');
    assert.match(src, /seatSame\(seat\)/, name + ' 가 답을 받고 자리를 다시 보지 않습니다');
  });
  assert.match(cut('loadSites'), /seatSame\(seat\)/, 'loadSites 가 늦게 온 답을 버리지 않습니다');
});

/* ══════ 4) 서랍에 넣거나 버리면 도착 표시를 다시 읽는다 ══════
   안 읽으면 방금 넣은 자료가 사업장 목록에서 「미도착 0장」으로 남아,
   사람이 안 들어간 줄 알고 또 올린다. */
test('★ 서랍 이동·휴지통·되살리기 뒤에 도착 칸을 다시 읽는다', () => {
  /* 2026-08-17부터 **그 업체·그 달만** 읽는다(다섯이 동시에 쓰면 통째로 받는 것이
     느려지고 요금이 된다). 그래서 「인자 없이 부르는가」가 아니라 「부르는가」를 본다. */
  ['fileToDrawer', 'toTrash', 'restoreItem'].forEach(name => {
    assert.match(cut(name), /refreshArrivals\(/, name + ' 뒤에 도착 표시가 낡은 채로 남습니다');
  });
});

/* ⚠ 통째로 읽는 길로 되돌아가면 다섯이 각자 112곳 × 열두 달을 반복해서 받는다. */
test('★ 한 건 손댈 때는 그 업체·그 달만 읽는다', () => {
  ['fileToDrawer', 'toTrash', 'restoreItem'].forEach(name => {
    assert.match(cut(name), /refreshArrivals\([^)]+\)/,
      name + ' 이 도착 칸을 통째로 다시 받습니다 — 자리를 집어 주세요');
  });
});

/* ══════ 5) 다시 그려도 치던 칸을 잃지 않는다 ══════
   찾기 줄에 한 글자를 치면 화면을 통째로 다시 그려 그 칸이 새로 만들어졌고,
   커서가 빠져 두 글자째가 아무 데도 안 들어갔다. */
test('★ 찾기 칸들에 id 가 있다 — 없으면 커서를 되찾을 수 없다', () => {
  // colFind 는 2중 대시보드의 사업장 찾기 칸(옛 sideFind 자리, 2026-08-17)
  ['findInput', 'colFind', 'staffFind', 'shareFind'].forEach(id => {
    assert.ok(html.indexOf('id="' + id + '"') >= 0, id + ' 칸에 이름표가 없습니다');
  });
});

test('★ 다시 그리기 전후로 커서 자리를 기억하고 되돌린다', () => {
  const src = html.match(/render\(\) \{[\s\S]*?\n  \}/);
  assert.ok(src, 'render 를 찾을 수 없습니다');
  assert.match(src[0], /const keep = focusSnapshot\(\);/, '다시 그리기 전에 커서를 기억하지 않습니다');
  assert.match(src[0], /restoreFocus\(keep\);/, '다 그린 뒤 커서를 되돌리지 않습니다');
});

function loadFocus() {
  const els = {};
  const doc = { activeElement: null, getElementById: id => els[id] || null };
  const sandbox = { document: doc, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script([
    'const $ = id => document.getElementById(id);',
    cut('focusSnapshot'), cut('restoreFocus'),
    'globalThis.focusSnapshot = focusSnapshot; globalThis.restoreFocus = restoreFocus;'
  ].join('\n'), { filename: 'focus.js' }).runInContext(sandbox);
  return { sandbox, doc, els };
}

test('★ 치던 칸과 커서 자리를 그대로 되돌린다', () => {
  const { sandbox, doc, els } = loadFocus();
  const before = { id: 'findInput', tagName: 'INPUT', selectionStart: 2, selectionEnd: 2 };
  doc.activeElement = before;
  const snap = sandbox.focusSnapshot();
  assert.deepEqual({ id: snap.id, start: snap.start }, { id: 'findInput', start: 2 });

  // 다시 그려서 같은 이름표의 **새** 칸이 생겼다 — 커서는 아무 데도 없다.
  const after = { id: 'findInput', tagName: 'INPUT', focused: false, range: null,
    focus() { this.focused = true; }, setSelectionRange(a, b) { this.range = [a, b]; } };
  els.findInput = after;
  doc.activeElement = null;
  sandbox.restoreFocus(snap);
  assert.equal(after.focused, true, '새로 그린 칸으로 커서가 돌아가지 않았습니다');
  assert.deepEqual(after.range, [2, 2], '커서가 칸 맨 뒤나 앞으로 튀면 글자가 뒤집힙니다');
});

test('이미 그 칸에 커서가 있으면 손대지 않는다 — 폰에서 자판이 다시 뜬다', () => {
  const { sandbox, doc, els } = loadFocus();
  const el = { id: 'findInput', tagName: 'INPUT', focused: false, focus() { this.focused = true; } };
  els.findInput = el;
  doc.activeElement = el;
  sandbox.restoreFocus({ id: 'findInput', start: 1, end: 1 });
  assert.equal(el.focused, false);
});

test('기억해 둔 칸이 사라졌으면 아무 일도 하지 않는다', () => {
  const { sandbox } = loadFocus();
  assert.doesNotThrow(() => sandbox.restoreFocus({ id: '없는칸', start: 0, end: 0 }));
});
