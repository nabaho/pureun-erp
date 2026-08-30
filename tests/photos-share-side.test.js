/* 👥 사람 고르기를 «왼쪽 칸 안»으로 · 사번 순 · 거두기 (대표 지시 2026-08-30)

   "권형하에게는 이것 공유하기 클릭하면 캡쳐3셀에 사람을 선택할 수 있게 해달라.
    그리고 원칙은 푸른이알피 사번순서대로 사람 정렬해라 더하거나 뺄사람 필요없다."
   "추후에 공유한것 취소 하는 기능도 만들어 달라."

   ■ ① 가운데 창이 아니라 «그 칸 안»에서 고른다
   가운데 창을 띄우면 뒤의 격자가 가려진다 — 무엇을 골라 두었는지 보면서 사람을
   고를 수가 없다. 단추를 누르면 그 자리(왼쪽 칸)에서 목록이 열리고, 다시 누르면 닫힌다.
   ⚠ 그렇다고 목록을 «두 벌» 만들지 않았다. sharePeopleHtml 하나가 두 칸에 들어간다 —
     크게 보기(창)에는 창으로, 격자에서는 왼쪽 칸으로. 갈라 두면 한쪽만 좋아진다.

   ■ ② 사람은 «푸른이알피 사번 순»
   이름 가나다도, 많이 나눈 순도 아니다. 사무실이 사람을 세는 차례가 사번이라
   **어디서 보든 같은 자리에 같은 사람이 있다.** 사번 모르는 사람은 맨 뒤.

   ■ ③ 「더하거나 뺄 사람을 골라 주세요」를 없앴다
   바뀐 것이 없는데 누르면 빨간 글씨로 꾸짖고 있었다 — **누를 수 없는 단추를 눌러 보게
   한 뒤 나무라는 꼴**이다. 이제 바뀐 것이 없으면 단추가 아예 안 눌린다.

   ■ ④ 공유 취소
   이미 열린 분의 체크를 풀면 거둔다. 단추가 「1명 열고 1명 거두기」처럼
   **무엇을 하려는지 그대로** 말한다. */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const CODE = APP.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

/* 고르개를 «실제로» 열어 본다 — 글자로 찾으면 몸통을 바꿔도 통과한다 */
function pick(over) {
  const o = over || {};
  const el = {};
  const mk = function (id) {
    return el[id] || (el[id] = {
      style: {}, textContent: '', innerHTML: '', disabled: false, title: '',
      classList: { _on: {}, add: function (c) { this._on[c] = 1; },
        remove: function (c) { delete this._on[c]; },
        contains: function (c) { return !!this._on[c]; },
        toggle: function (c, v) { if (v) this._on[c] = 1; else delete this._on[c]; } },
      querySelectorAll: function () { return []; },
      focus: function () {}, oninput: null
    });
  };
  const ctx = Object.assign({
    console: { warn: function () {} },
    Object: Object, Array: Array, Set: Set, String: String, Number: Number,
    Promise: Promise, Math: Math, JSON: JSON, Boolean: Boolean,
    ownerNames: o.names || {}, gridItems: o.items || [], selected: new Set(o.sel || []),
    _uidBySid: o.sids || {}, _sidByUid: null, _sharePick: null,
    gridOwner: null, ALL_OWNERS: '__all__', SHARED_OWNER: '__shared__', viewerId: null,
    esc: function (s) { return String(s == null ? '' : s); },
    isPhone: function () { return false; },
    toast: function () {}, alert: function (m) { ctx._said = m; },
    localStorage: { getItem: function () { return '[]'; }, setItem: function () {} },
    document: { querySelectorAll: function () { return []; } },
    coMgrsFor: function () { return Promise.resolve(null); },
    oneCoOf: function () { return ''; },
    uidBySid: function () { return Promise.resolve(ctx._uidBySid); },
    PuPhotoStore: { myUid: function () { return o.me || 'me'; },
      amAdmin: function () { return !!o.admin; },
      isSensitiveRead: function () { return false; } },
    $: mk
  }, o.ctx || {});
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ['function sidOf(', 'function bySid(', 'function shareOften(', 'function noteShareOften(',
   'function isMinePhoto(', 'function viewingOther(', 'function mayTouch(', 'function maskForced(',
   'function sharedToMe(', 'function mayShare(', 'function shareNoWhy(', 'function closeSharePick(',
   'function openShareMany(', 'function openSharePeople(', 'function sharePeopleHtml(',
   'function sharePickFilter(', 'function sharePickChanges(', 'function sharePickTouched(',
   'function renderShareCard('].forEach(function (n) {
    vm.runInContext(cutFn(APP, n), ctx);
  });
  vm.runInContext(APP.match(/const SHARE_OFTEN_KEY[^\n]*/)[0] + '\n' +
    APP.match(/const SHARE_OFTEN_MAX[^\n]*/)[0], ctx);
  ctx._el = el;
  return ctx;
}

/* ── ① 그 칸 안에서 열린다 ── */

test('★★ 「공유하기」를 누르면 «왼쪽 칸 안»에서 고른다 — 가운데 창이 격자를 가리지 않게', () => {
  const fn = cutFn(APP, 'function openShareMany(');
  assert.match(fn, /openSharePeople\(Array\.from\(selected\), 'sharePickBox'\)/,
    '★★ 격자에서 누르면 아직 가운데 창이 뜹니다');
  assert.match(APP, /<div id="sharePickBox"/, '★★ 목록이 들어갈 칸이 없습니다');
  /* 크게 보기(한 장)는 창 그대로 — 거기에는 왼쪽 칸이 없다 */
  assert.match(cutFn(APP, 'function openSharePick('), /openSharePeople\(\[viewerId\]\)/,
    '★ 크게 보기에서 있지도 않은 칸에 그리려 합니다');
});

test('★★ 목록을 «두 벌» 만들지 않았다 — 한 함수가 두 칸에 들어간다', () => {
  /* 두 벌이면 한쪽만 좋아지는 날이 온다(이 기능이 처음에 그래서 갈라져 있었다) */
  const open = cutFn(APP, 'function openSharePeople(');
  assert.match(open, /box\.innerHTML = sharePeopleHtml\(others, noAcct\)/,
    '★★ 칸마다 따로 그립니다');
  assert.match(open, /const box = \$\(host\)/, '★ 어느 칸에 그릴지 받지 않습니다');
  assert.ok((APP.match(/function sharePeopleHtml\(/g) || []).length === 1,
    '★★ 목록 만드는 함수가 둘입니다');
  /* 꾸밈도 두 칸 모두에 걸려 있어야 한다 — 한쪽만 걸면 맨 목록이 나온다 */
  const css = APP.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /#sharePickBox \.prow\{/, '★★ 왼쪽 칸에 꾸밈이 없습니다');
  assert.match(css, /#sharePickBox \.pgrp\{/, '★ 무리 이름표 꾸밈이 없습니다');
});

test('★★ 실제로 열고 닫아 본다 — 단추 하나로 여닫는다', async () => {
  const c = pick({ names: { me: '나', b: '박', d: '홍' }, sids: { '1': 'me', '2': 'b', '3': 'd' },
    items: [{ id: 'a', meta: { __ownerUid: 'me' } }], sel: ['a'] });
  c.openShareMany();
  await new Promise(function (r) { setTimeout(r, 0); });
  assert.equal(c._el.sharePickBox.style.display, 'block', '★★ 칸이 안 열립니다');
  assert.ok(c._el.shareSideBtn.classList.contains('on'),
    '★ 열려 있다는 표시가 없어 다시 누르면 닫힌다는 것을 모릅니다');
  assert.ok(c._el.sharePickBox.innerHTML.indexOf('prow') > 0, '★★ 사람이 안 그려졌습니다');
  /* 다시 누르면 닫힌다 */
  c.openShareMany();
  assert.equal(c._el.sharePickBox.style.display, 'none', '★★ 다시 눌러도 안 닫힙니다');
  assert.equal(c._sharePick, null, '★ 닫았는데 고르던 것이 남아 있습니다');
});

test('★★ 고른 사진이 바뀌면 열려 있던 목록을 닫는다 — 화면이 거짓말하지 않게', () => {
  /* 「3장을 같이 볼 사람」이라 적힌 채로 다섯 장에 열어 주면 안 된다 */
  const fn = cutFn(APP, 'function renderShareCard(');
  assert.match(fn, /_sharePick\.ids\.length !== n/,
    '★★ 고른 장수가 바뀌어도 옛 목록이 그대로 열려 있습니다');
  assert.match(fn, /closeSharePick\(\)/);
});

/* ── ② 사번 순 ── */

test('★★ 사람을 «푸른이알피 사번 순»으로 늘어놓는다 (대표 지시 2026-08-30)', () => {
  const c = pick({ names: { a: '가나', b: '나다', d: '다라' },
    sids: { '11': 'a', '2': 'b', '3': 'd' } });
  /* ⚠ 사번은 «숫자»로 본다 — 글자로 견주면 '11' 이 '2' 보다 앞에 온다 */
  assert.deepEqual(['a', 'b', 'd'].sort(c.bySid), ['b', 'd', 'a'],
    '★★ 사번 2 · 3 · 11 차례가 아닙니다 — 글자로 견주고 있습니다');
  /* 이름 가나다순이 아니라는 것을 못 박는다(이름순이면 가나·나다·다라 = a,b,d) */
  assert.notDeepEqual(['a', 'b', 'd'].sort(c.bySid), ['a', 'b', 'd'],
    '★★ 이름순으로 늘어놓고 있습니다');
});

test('★ 사번을 모르는 사람은 «맨 뒤» — 앞에 끼면 아는 사람들 자리가 밀린다', () => {
  const c = pick({ names: { a: '가나', z: '모름' }, sids: { '9': 'a' } });
  assert.deepEqual(['z', 'a'].sort(c.bySid), ['a', 'z']);
  assert.equal(c.sidOf('z'), '');
});

test('★★ 무리마다 그 차례를 «실제로» 쓴다 — 셈만 있고 안 쓰면 뜻이 없다', () => {
  const fn = cutFn(APP, 'function sharePeopleHtml(');
  const uses = (fn.match(/\.sort\(bySid\)/g) || []).length;
  assert.ok(uses >= 4, '★★ 사번 순을 ' + uses + '군데에서만 씁니다 — 무리마다 써야 합니다');
});

test('★ 사번으로도 찾아진다 — 이름이 헷갈리는 동명이인은 번호로 짚는다', () => {
  const fn = cutFn(APP, 'function sharePeopleHtml(');
  assert.match(fn, /data-nm="' \+ esc\(nm \+ ' ' \+ sid\)/,
    '★ 찾기 칸이 이름만 봅니다');
});

test('★★ 찾기가 «그 칸 안»을 뒤진다 — 창 자리를 못 박으면 왼쪽 칸에서 헛돈다', () => {
  /* ⚠ 돌연변이에서 살아남던 자리다. '#kindPopupBody' 로 박아 두면 왼쪽 칸에서
     이름을 쳐도 아무 일이 없는데, 글자만 보는 검사로는 안 잡힌다.
     그래서 **어디를 뒤졌는지 받아 적어** 본다. */
  const asked = [];
  const c = pick({ names: { me: '나', b: '박' }, sids: { '1': 'me', '2': 'b' } });
  c._sharePick = { host: 'sharePickBox' };
  c.document.querySelectorAll = function (sel) { asked.push(sel); return []; };
  c.sharePickFilter('박');
  assert.ok(asked.length, '★ 아무 데도 안 뒤집니다');
  asked.forEach(function (sel) {
    assert.match(sel, /^#sharePickBox /,
      '★★ 왼쪽 칸에서 열었는데 딴 자리를 뒤집니다: ' + sel);
  });
  /* 창에서 열었을 때는 창을 뒤진다 */
  asked.length = 0;
  c._sharePick = { host: 'kindPopupBody' };
  c.sharePickFilter('박');
  asked.forEach(function (sel) { assert.match(sel, /^#kindPopupBody /); });
});

test('★★ 좁은 칸에서 이름이 «세로로 안 깨진다» — 왼쪽 칸은 262px 다', () => {
  /* ⚠ 브라우저에서 「최 / 기 / 운」으로 쪼개진 것을 보고 고친 자리다.
     flex 칸은 기본이 min-width:auto 라 글자 하나 너비까지 쥐어짜인다 —
     min-width:0 과 nowrap 이 함께 있어야 안 깨진다. 둘 중 하나만 빠져도 도로 깨진다. */
  const css = APP.replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (css.match(/#sharePickBox \.prow \.nm\{[^}]*\}/) || [''])[0];
  assert.ok(rule, '★ 이름 칸 꾸밈이 없습니다');
  assert.match(rule, /min-width:0/, '★★ min-width:0 이 빠져 이름이 세로로 깨집니다');
  assert.match(rule, /white-space:nowrap/, '★★ 줄바꿈을 안 막아 이름이 세로로 깨집니다');
});

/* ── ③ 「더하거나 뺄 사람」을 없앴다 ── */

test('★★ 바뀐 것이 없으면 단추가 «안 눌린다» — 눌러 보게 한 뒤 꾸짖지 않는다', async () => {
  const c = pick({ names: { me: '나', b: '박' }, sids: { '1': 'me', '2': 'b' },
    items: [{ id: 'a', meta: { __ownerUid: 'me' } }], sel: ['a'] });
  c.openShareMany();
  await new Promise(function (r) { setTimeout(r, 0); });
  /* 아무도 안 골랐다 */
  c.document.querySelectorAll = function () { return []; };
  c.sharePickTouched();
  assert.equal(c._el.sharePickGo.disabled, true, '★★ 바뀐 것이 없는데 눌립니다');
  assert.equal(c._el.sharePickGo.textContent, '열어 주기');
  /* 옛 꾸짖는 글이 코드에 남아 있으면 안 된다 */
  assert.ok(CODE.indexOf('더하거나 뺄 사람을 골라 주세요') < 0,
    '★★ 「더하거나 뺄 사람을 골라 주세요」가 아직 살아 있습니다');
});

test('★★ 단추가 «무엇을 할지» 그대로 말한다 — 「열어 주기」만으로는 거두는 것을 못 읽는다', () => {
  const fn = cutFn(APP, 'function sharePickTouched(');
  assert.match(fn, /명 열고 '.*명 거두기/, '★★ 열기와 거두기가 함께일 때를 안 적습니다');
  assert.match(fn, /명에게 열어 주기/);
  assert.match(fn, /명 거두기/);
  assert.match(fn, /go\.disabled = !n/, '★★ 바뀐 것이 없어도 눌립니다');
  /* 체크를 건드릴 때마다 다시 센다 */
  assert.match(cutFn(APP, 'function sharePeopleHtml('), /onchange="sharePickTouched\(\)"/,
    '★★ 체크를 눌러도 단추가 안 바뀝니다');
});

/* ── ④ 공유 취소 ── */

test('★★ 이미 열린 분의 체크를 풀면 «거둔다» — 그것이 공유 취소다', async () => {
  const c = pick({ names: { me: '나', b: '박', d: '홍' },
    sids: { '1': 'me', '2': 'b', '3': 'd' },
    items: [{ id: 'a', meta: { __ownerUid: 'me', shareWith: { b: true, d: true } } }], sel: ['a'] });
  c.openShareMany();
  await new Promise(function (r) { setTimeout(r, 0); });
  /* 박은 체크된 채, 홍은 풀었다고 치자 */
  c.document.querySelectorAll = function () {
    return [{ checked: true, disabled: false, value: 'b' }];
  };
  const ch = c.sharePickChanges();
  assert.deepEqual(ch.drop, ['d'], '★★ 체크를 풀어도 거두지 않습니다');
  assert.deepEqual(ch.add, [], '★ 없던 사람을 더하려 합니다');
  c.sharePickTouched();
  assert.equal(c._el.sharePickGo.textContent, '1명 거두기');
  assert.equal(c._el.sharePickGo.disabled, false);
});

test('★★ 거두는 일을 «실제로» 저장 층에 시킨다 — 화면에서만 지우면 그대로 열려 있다', () => {
  const fn = cutFn(APP, 'function submitSharePeople(');
  assert.match(fn, /const c = sharePickChanges\(\)/,
    '★★ 단추에 적은 셈과 실제로 하는 일이 다른 곳에서 나옵니다');
  assert.match(fn, /PuPhotoStore\.setShare\(/, '★★ 거두기를 저장 층에 안 시킵니다');
  assert.match(fn, /거뒀습니다/, '★ 거둔 뒤에 아무 말이 없습니다');
});

test('★★ 넘겨받은 사람은 «거두지 못한다» — 서버 규칙과 화면이 같은 말을 한다', () => {
  const html = cutFn(APP, 'function sharePeopleHtml(');
  assert.match(html, /lock: !p\.mayDrop/, '★★ 넘긴 사람이 체크를 풀 수 있습니다');
  assert.match(html, /올린 분만/, '★ 왜 못 거두는지 안 적습니다');
  const ch = cutFn(APP, 'function sharePickChanges(');
  assert.match(ch, /p\.mayDrop \? p\.has\.filter/,
    '★★ 넘긴 사람의 「풀기」가 거두기로 셈해집니다 — 눌러도 서버가 막습니다');
});

test('★ 거두는 길이 «어디 있는지» 말해 준다 — 모르면 「한 번 열면 못 닫는다」고 여기신다', () => {
  const html = cutFn(APP, 'function sharePeopleHtml(');
  assert.match(html, /체크를 풀면 거둡니다/, '★ 거두는 길을 안 알려 줍니다');
  assert.match(html, /그분 화면에서 사진이 사라집니다/,
    '★ 거두면 어떻게 되는지 안 말하면 눌러 보기가 무섭습니다');
});
