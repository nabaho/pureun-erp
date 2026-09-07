'use strict';
/* 공유받은 사진을 «전체사진에 함께» 본다 (대표 지시 2026-08-29)

   "이렇게 받은사진으로 나오지 말고 전체사진에서 같이 보이게하고 공유된사진만 따로
    선택할 수 있게 해라. 공유도 누가 공유했는지 확인되게 해라.
    그렇게 해야 공유된 사진을 같이 사용할 수 있다."

   ■ 왜 딴 화면이면 안 되나
   한 업체 일을 하는데 내가 찍은 것과 동료가 열어 준 것이 두 화면에 갈려 있으면,
   찾기도 분류 탭도 따로 놀아서 «같이 쓰는» 것이 안 된다.

   ■ 섞으면 새로 생기는 위험 — 이 파일의 절반은 그것을 막는다
   「내 사진」 화면에 **남의 사진이 들어온다.** 그러면 화면으로 판단하던 잠금이
   통째로 헐거워진다 — 직원이 공유받은 사진에 대고 지우기·판독을 누를 수 있게 되고,
   자동 판독은 남의 사진을 읽으려다 막히면서 AI 한도만 태운다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* ══════ ① 한 격자에 섞는다 ══════ */

function mergeCtx(mine, shared) {
  const ctx = {
    Promise, Object, String, console: { warn() {} },
    PuPhotoStore: {
      listYear: function () { return Promise.resolve(mine); },
      listSharedToMe: function () { return Promise.resolve(shared); },
      fillSharedNames: function (x) { return x; }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'function listMineAndShared('), ctx);
  return ctx;
}

test('★★ 내 사진과 공유받은 사진이 «한 목록»으로 온다 — 이것이 이 지시의 전부다', async () => {
  const c = mergeCtx(
    { m1: { upAt: 1 } },
    { s1: { upAt: 2, __ownerUid: 'U2', __year: '2026' } });
  const out = await c.listMineAndShared('2026');
  assert.deepEqual(Object.keys(out).sort(), ['m1', 's1'],
    '★ 갈려 있으면 찾기·분류 탭이 따로 놀아 «같이 쓰는» 것이 안 됩니다');
  assert.equal(out.s1.__ownerUid, 'U2', '누구 것인지 붙어 와야 칩을 달 수 있습니다');
});

test('★★ 보고 있는 «그 해» 것만 섞는다 — 안 거르면 날짜 묶음이 어긋난다', async () => {
  const c = mergeCtx({}, {
    old: { __ownerUid: 'U2', __year: '2025' },
    now: { __ownerUid: 'U2', __year: '2026' }
  });
  const out = await c.listMineAndShared('2026');
  assert.deepEqual(Object.keys(out), ['now'],
    '★ 2025년에 받은 사진이 2026년 화면에 끼어들면 「8월 28일」 묶음이 거짓이 됩니다');
});

test('★★ 공유 목록을 못 읽어도 «내 사진은 보인다»', async () => {
  const c = mergeCtx({ m1: {} }, {});
  c.PuPhotoStore.listSharedToMe = function () { return Promise.reject(new Error('PERMISSION_DENIED')); };
  const out = await c.listMineAndShared('2026');
  assert.deepEqual(Object.keys(out), ['m1'],
    '★ 규칙이 막혔다고 내 사진첩이 통째로 안 열리면 안 됩니다');
});

test('★ 같은 번호가 겹치면 «내 것»이 이긴다 — 남의 주인이 붙으면 엉뚱한 자리를 두드린다', async () => {
  const c = mergeCtx({ p: { mine: true } }, { p: { __ownerUid: 'U2', __year: '2026' } });
  const out = await c.listMineAndShared('2026');
  assert.equal(out.p.mine, true);
  assert.equal(out.p.__ownerUid, undefined);
});

test('★ 「내 사진」 화면일 때만 섞는다 — 사람을 골라 보는 화면에 남의 것이 끼면 안 된다', () => {
  const fn = cutFn(app, 'function loadGrid(');
  assert.match(fn, /:\s*gridOwner\s*\r?\n?\s*\?\s*PuPhotoStore\.listYear\(gridYear, gridOwner\)\s*\r?\n?\s*:\s*listMineAndShared\(gridYear\)/,
    '★ 「내 사진」(gridOwner 가 비었을 때)에서만 섞어야 합니다');
});

/* ══════ ② 누가 열어 줬는지 ══════ */

function nameCtx(meta, me) {
  const ctx = { PuPhotoStore: { myUid: function () { return me || 'ME'; } }, String };
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'function isSharedItem(') + '\n' +
    cutFn(app, 'function sharedByName('), ctx);
  return ctx;
}

test('★★ 남이 열어 준 사진에는 «그 사람 이름»이 붙는다 (대표 지시 「누가 공유했는지 확인되게」)', () => {
  const c = nameCtx();
  assert.equal(c.sharedByName({ meta: { __ownerUid: 'U2', __ownerName: '권형하' } }), '권형하');
  assert.equal(c.isSharedItem({ meta: { __ownerUid: 'U2' } }), true);
});

test('★ 내 사진에는 안 붙는다 — 온 칸에 붙으면 2026-08-16 에 걷어낸 「올린 사람 띠」가 되살아난다', () => {
  const c = nameCtx();
  assert.equal(c.isSharedItem({ meta: {} }), false);
  assert.equal(c.isSharedItem({ meta: { __ownerUid: 'ME' } }), false, '내 uid 면 내 사진이다');
  assert.equal(c.sharedByName({ meta: {} }), '');
});

test('★ 이름을 모르면 «표를 안 단다» — uid 글자만 칸을 먹는다', () => {
  const c = nameCtx();
  assert.equal(c.sharedByName({ meta: { __ownerUid: 'U2' } }), '');
  assert.equal(c.sharedByName({ meta: { __ownerUid: 'U2', __ownerName: 'U2' } }), '',
    '이름표를 못 읽으면 uid 가 그대로 이름 자리에 들어온다 — 그것도 표가 아니다');
});

test('★★ 칸이 실제로 그 칩을 그린다 — 판정만 있고 안 그리면 아무 소용이 없다', () => {
  const g = app.match(/function renderGrid\(\)[\s\S]*?\n\}/)[0];
  assert.match(g, /sharedByName\(it\)/, '★ 칩을 만드는 자리가 없습니다');
  assert.match(g, /class="shr"/, '★ 칩 이름표가 없습니다');
  /* 서류 카드와 사진 칸 **둘 다** — 한쪽만 그리면 서류로 받은 것은 표가 없다 */
  assert.equal((g.match(/proof \+ shr/g) || []).length, 2,
    '★ 서류 카드와 사진 칸 둘 다에 그려야 합니다');
  /* 「전체 근로자」에는 안 단다 */
  assert.match(g, /gridOwner === ALL_OWNERS\) \? '' : sharedByName\(it\)/,
    '★ 전체 근로자 화면은 원래 다 남의 것이라, 온 칸에 붙으면 못 쓰게 됩니다');
});

/* ══════ ③ 공유받은 것만 거르기 ══════ */

test('★★ 「공유받은 것만」이 분류 탭·찾기와 «함께» 걸린다', () => {
  const fn = cutFn(app, 'function shownItemsFresh(');
  assert.match(fn, /if \(sharedOnly\) list = list\.filter\(isSharedItem\)/,
    '★ 따로 걸면 탭을 옮겼을 때 다른 탭 사진이 섞여 나옵니다(2026-08-05 과 같은 어긋남)');
});

test('★ 켤 때 다른 거르개를 끈다 — 겹치면 지금 무엇을 보는지 알 수 없다', () => {
  const fn = cutFn(app, 'function toggleShared(');
  assert.match(fn, /needOnly = false/);
  assert.match(fn, /oldOnly = false/);
  assert.match(fn, /selected\.clear\(\)/, '고른 것을 안 비우면 안 보이는 사진이 골라진 채로 남습니다');
  assert.ok(!/gridOwner/.test(fn),
    '★ 화면을 바꾸면 다시 «딴 화면»이 됩니다 — 이 지시의 뜻과 반대입니다');
});

test('★ 사람을 바꾸면 「공유받은 것만」이 풀린다 — 다른 사람 화면에는 뜻이 없다', () => {
  assert.match(cutFn(app, 'function pickOwner('), /sharedOnly = false; sharedWho = ''/);
});

/* ══════ ③-2 «누가 준 것만» 골라 보기 (대표 지시 2026-08-29 두 번째) ══════
   "다른직원들과 공유하는경우 공유된 사람의 사진만 골라서 볼 수 있게 해달라." */

test('★★ 그 사람이 준 것만 남는다 — 여럿에게 받으면 누구 것인지로 좁혀야 일이 된다', () => {
  const fn = cutFn(app, 'function shownItemsFresh(');
  assert.match(fn, /if \(sharedWho\) list = list\.filter/, '★ 사람으로 좁히는 자리가 없습니다');
  assert.match(fn, /__ownerUid === sharedWho/, '준 사람이 아니라 다른 것으로 가르고 있습니다');
  /* 「공유받은 것만」 **다음**이어야 한다 — 앞에 두면 순서만 다를 뿐이지만,
     둘 다 같은 자리에 있어야 분류 탭·찾기와 함께 걸린다. */
  assert.ok(fn.indexOf('sharedOnly) list') < fn.indexOf('sharedWho) list'));
});

test('★★ 사람을 고르면 «공유받은 것만»도 함께 켜진다 — 안 켜면 내 사진이 섞여 나온다', () => {
  const ctx = {
    selected: { clear: function () {} },
    resetGridRenderLimit: function () {}, renderGrid: function () {},
    renderNeedBox: function () {}, renderOldBox: function () {},
    sharedWho: '', sharedOnly: false, needOnly: true, failOnly: true, oldOnly: true
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'function pickSharedWho('), ctx);
  ctx.pickSharedWho('U2');
  assert.equal(ctx.sharedWho, 'U2');
  assert.equal(ctx.sharedOnly, true,
    '★ 「사람은 골랐는데 왜 내 사진이 있지」가 됩니다');
  assert.equal(ctx.needOnly, false, '다른 거르개와 겹치면 무엇을 보는지 알 수 없습니다');
  assert.equal(ctx.oldOnly, false);
});

test('★ 같은 이름을 다시 누르면 풀린다 — 칩이 켜고 끄는 단추다', () => {
  const ctx = {
    selected: { clear: function () {} },
    resetGridRenderLimit: function () {}, renderGrid: function () {},
    renderNeedBox: function () {}, renderOldBox: function () {},
    sharedWho: 'U2', sharedOnly: true, needOnly: false, failOnly: false, oldOnly: false
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'function pickSharedWho('), ctx);
  ctx.pickSharedWho('U2');
  assert.equal(ctx.sharedWho, '', '★ 풀 길이 없으면 그 사람 것에 갇힙니다');
  assert.equal(ctx.sharedOnly, true, '받은 것 보기는 그대로 둔다 — 사람만 푼 것이다');
});

test('★★ 「공유받은 것만」을 끄면 골라 둔 사람도 함께 풀린다', () => {
  const ctx = {
    selected: { clear: function () {} },
    resetGridRenderLimit: function () {}, renderGrid: function () {},
    renderNeedBox: function () {}, renderOldBox: function () {}, renderGotCard: function () {},
    sharedOnly: true, sharedWho: 'U2', needOnly: false, failOnly: false, oldOnly: false
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'function toggleShared('), ctx);
  ctx.toggleShared();
  assert.equal(ctx.sharedOnly, false);
  assert.equal(ctx.sharedWho, '',
    '★ 사람을 안 풀면 다음에 켤 때 그 사람 것만 나와 「왜 세 장뿐이지」가 됩니다');
});

test('★★ 누가 몇 장을 줬는지 «지금 격자에 있는 것»으로 센다 — 칩 숫자가 곧 나올 장수다', () => {
  const ctx = {
    Object, String,
    gridItems: [
      { meta: { __ownerUid: 'A', __ownerName: '권형하' } },
      { meta: { __ownerUid: 'A', __ownerName: '권형하' } },
      { meta: { __ownerUid: 'B', __ownerName: '박은비' } },
      { meta: {} }                                   // 내 사진
    ],
    isSharedItem: function (it) { return !!(it.meta && it.meta.__ownerUid); },
    sharedByName: function (it) { return it.meta.__ownerName || ''; },
    idsOf: function () { return [1]; }
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'function sharedPeople('), ctx);
  const out = ctx.sharedPeople();
  assert.equal(out.length, 2, '내 사진이 섞이면 안 됩니다');
  assert.equal(out[0].name, '권형하');
  assert.equal(out[0].n, 2, '★ 칩에 적힌 수와 눌렀을 때 나올 수가 다르면 못 믿습니다');
  assert.equal(out[1].n, 1);
});

test('★ 이름을 몰라도 «가는 길»은 남긴다 — 빼면 그 사람 사진으로 갈 수가 없다', () => {
  const ctx = {
    Object, String,
    gridItems: [{ meta: { __ownerUid: 'U9' } }],
    isSharedItem: function () { return true; },
    sharedByName: function () { return ''; },          // 명단을 못 읽었다
    idsOf: function () { return [1]; }
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'function sharedPeople('), ctx);
  assert.equal(ctx.sharedPeople()[0].name, 'U9');
});

/* ⚠ 2026-08-29 대표 지시로 **칩 → 고르개**가 되었다
   ("공유받은거 드롭다운 방식으로 이름 선택하게").
   칩일 때는 다섯 사람이 **세 줄**을 먹어 왼쪽 칸이 밀렸다
   (대표 화면: 김보람 154 · 김동현 80 · 박은비 19 · 주민정 4 · 신욱임 3).
   그리고 칩은 «둘 이상»에서만 나와, 한 사람에게만 받으면 이름이 어디에도 없었다 —
   고르개는 **한 사람이어도** 그린다. */
test('★★ 준 사람을 «고르개»로 고른다 — 사람이 열이 되어도 한 줄이다', () => {
  const fn = cutFn(app, 'function renderGotCard(');
  assert.match(fn, /<select onchange="pickSharedWho\(this\.value, true\)">/,
    '★ 칩으로 되돌리면 사람이 늘 때마다 왼쪽 칸이 밀립니다');
  assert.match(fn, /if \(!list\.length\) \{ who\.style\.display = 'none'/,
    '★ 한 사람뿐이어도 그려야 이름이 보입니다(0명일 때만 접습니다)');
  assert.match(fn, /준 사람 — 전체 /, '★ 전체로 돌아갈 줄이 없으면 그 사람 것에 갇힙니다');
});

test('★★ 고르개에서 고르면 «고른 그대로» 따른다 — 다시 눌러 풀리면 화면과 어긋난다', () => {
  const ctx = {
    selected: { clear: function () {} },
    resetGridRenderLimit: function () {}, renderGrid: function () {},
    renderNeedBox: function () {}, renderOldBox: function () {},
    sharedWho: 'U2', sharedOnly: true, needOnly: false, failOnly: false, oldOnly: false
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'function pickSharedWho('), ctx);
  /* 이미 고른 사람을 고르개에서 «다시» 골랐다 — 칩이라면 풀렸겠지만 고르개는 그대로다 */
  ctx.pickSharedWho('U2', true);
  assert.equal(ctx.sharedWho, 'U2',
    '★ 고르개에는 「김보람」이 떠 있는데 화면은 전체가 되면, 무엇을 보는지 어긋납니다');
  /* 「준 사람 — 전체」를 고르면 푼다 */
  ctx.pickSharedWho('', true);
  assert.equal(ctx.sharedWho, '', '★ 전체로 돌아갈 길이 없으면 갇힙니다');
  assert.equal(ctx.sharedOnly, true, '받은 것 보기는 그대로 — 사람만 푼 것이다');
});

/* ══════ ③-3 「누구 사진」 고르개에 «준 사람 이름» (대표 지시 2026-08-29) ══════
   "받은사진의 사람이름이 있어야 선택한다."
   ⚠ 왼쪽 칸의 사람 칩은 **둘 이상**일 때만 나온다. 한 사람에게만 받으면 칩이 없어서,
     고르개에는 「받은 사진 — 다른 해까지 16장」뿐이고 **누가 준 것인지 이름이 어디에도
     안 보인다.** 사람은 이름을 보고 고른다. */
function selCtx(people, over) {
  const opts = [{ value: '', textContent: '내 사진' },
                { value: '__shared__', textContent: '받은 사진 — 다른 해까지' }];
  const sel = {
    options: opts,
    value: '',
    appendChild: function (o) { opts.push(o); },
    removeChild: function (o) { const i = opts.indexOf(o); if (i >= 0) opts.splice(i, 1); }
  };
  const ctx = Object.assign({
    Object, String,
    $: function () { return sel; },
    document: { createElement: function () { return { value: '', textContent: '' }; } },
    sharedPeople: function () { return people; },
    gridOwner: null, sharedWho: '',
    _sel: sel, _opts: opts
  }, over || {});
  vm.createContext(ctx);
  vm.runInContext("var FROM_PREFIX = 'from:'; var _whoSig = null;\n" +
    cutFn(app, 'function syncSharedWhoOptions('), ctx);
  return ctx;
}

test('★★ 고르개에 «👤 이름»이 줄로 들어간다 — 이름이 없으면 고를 수가 없다', () => {
  const c = selCtx([{ uid: 'U2', name: '권형하', n: 16 }]);
  c.syncSharedWhoOptions(c._sel);
  const added = c._opts.filter(function (o) { return String(o.value).indexOf('from:') === 0; });
  assert.equal(added.length, 1, '★ 한 사람뿐이어도 이름 줄은 있어야 합니다(칩은 안 나옵니다)');
  assert.match(added[0].textContent, /권형하/, '★ 이름이 없으면 사람이 고를 수가 없습니다');
  assert.match(added[0].textContent, /16장/, '몇 장인지 함께 보여야 눌러 볼 값을 정합니다');
  assert.equal(added[0].value, 'from:U2');
});

test('★ 다시 불러도 줄이 겹치지 않는다 — 옛 줄을 걷어내고 붙인다', () => {
  const c = selCtx([{ uid: 'U2', name: '권형하', n: 16 }]);
  c.syncSharedWhoOptions(c._sel);
  c.sharedPeople = function () { return [{ uid: 'U2', name: '권형하', n: 17 }]; };
  c.syncSharedWhoOptions(c._sel);
  const added = c._opts.filter(function (o) { return String(o.value).indexOf('from:') === 0; });
  assert.equal(added.length, 1, '★ 겹쳐 붙이면 같은 이름이 여러 줄이 됩니다');
  assert.match(added[0].textContent, /17장/, '숫자가 안 따라가면 거짓이 됩니다');
});

test('★★ 고르개를 통째로 다시 만든 뒤에도 줄이 돌아온다 — 표만 믿으면 영영 안 돌아온다', () => {
  const c = selCtx([{ uid: 'U2', name: '권형하', n: 16 }]);
  c.syncSharedWhoOptions(c._sel);
  /* renderOwnerPick 이 innerHTML 로 통째로 다시 만든 상황 */
  c._opts.length = 0;
  c._opts.push({ value: '', textContent: '내 사진' });
  c.syncSharedWhoOptions(c._sel);
  assert.equal(c._opts.filter(function (o) { return String(o.value).indexOf('from:') === 0; }).length, 1,
    '★ 「바뀐 것 없음」으로 건너뛰면 사람 줄이 사라진 채로 남습니다');
});

test('★ 남을 골라 보는 화면에는 안 넣는다 — 거기에는 받은 사진이 없다', () => {
  const c = selCtx([{ uid: 'U2', name: '권형하', n: 16 }], { gridOwner: 'OTHER' });
  c.syncSharedWhoOptions(c._sel);
  assert.equal(c._opts.filter(function (o) { return String(o.value).indexOf('from:') === 0; }).length, 0);
});

test('★ 골라 둔 사람 줄로 고르개를 되돌린다 — 줄을 지웠다 붙이면 첫 줄로 튄다', () => {
  const c = selCtx([{ uid: 'U2', name: '권형하', n: 16 }], { sharedWho: 'U2' });
  c.syncSharedWhoOptions(c._sel);
  assert.equal(c._sel.value, 'from:U2', '★ 고르개가 「내 사진」으로 튀면 무엇을 보는지 어긋납니다');
});

test('★★ 사람 줄을 고르면 «거르기»만 한다 — 목록을 다시 읽지 않는다', () => {
  const calls = { load: 0, grid: 0 };
  const ctx = {
    String,
    FROM_PREFIX: 'from:',
    gridOwner: null, sharedWho: '', sharedOnly: false,
    needOnly: true, failOnly: true, oldOnly: true,
    gridItems: [{ id: 'a' }],
    selected: { clear: function () {} },
    resetGridRenderLimit: function () {},
    renderGrid: function () { calls.grid++; },
    renderNeedBox: function () {}, renderOldBox: function () {}, renderPhSummary: function () {},
    loadGrid: function () { calls.load++; },
    _calls: calls
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'function pickOwner('), ctx);
  ctx.pickOwner('from:U2');
  assert.equal(ctx.sharedWho, 'U2');
  assert.equal(ctx.sharedOnly, true, '★ 안 켜면 내 사진이 섞여 나옵니다');
  assert.equal(ctx.needOnly, false);
  assert.equal(calls.load, 0,
    '★ 이미 「내 사진」인데 목록을 다시 읽으면 헛되이 클라우드를 두드립니다');
  assert.equal(ctx.gridItems.length, 1, '★ 목록을 비우면 화면이 한 번 깜빡입니다');
  assert.ok(calls.grid > 0, '다시 그리지 않으면 아무 일도 안 일어난 것처럼 보입니다');
});

test('★ 「받은 사진 — 다른 해까지」에서 사람을 고르면 «내 사진»으로 돌아온 뒤 거른다', () => {
  const calls = { load: 0 };
  const ctx = {
    String, Date, Set,
    FROM_PREFIX: 'from:',
    gridOwner: '__shared__', sharedWho: '', sharedOnly: false,
    needOnly: false, failOnly: false, oldOnly: false, gridQ: '',
    gridItems: [{ id: 'a' }], gridYear: '2026', gridYears: [],
    selected: { clear: function () {} },
    resetGridRenderLimit: function () {},
    renderGrid: function () {}, renderNeedBox: function () {}, renderOldBox: function () {},
    renderPhSummary: function () {}, renderYearSel: function () {}, renderGotCard: function () {},
    loadFolders: function () {}, refreshYears: function () {},
    viewingOnlyOther: function () { return false; },
    loadGrid: function () { calls.load++; },
    $: function () { return null; },
    _calls: calls
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'function pickOwner('), ctx);
  ctx.pickOwner('from:U2');
  assert.equal(ctx.gridOwner, null, '★ 그 화면에는 「누가 줬나」가 뜻이 없습니다 — 내 사진으로 돌아와야 합니다');
  assert.equal(calls.load, 1, '화면을 바꿨으면 목록은 다시 읽어야 합니다');
  assert.equal(ctx.sharedWho, 'U2');
  assert.equal(ctx.sharedOnly, true);
});

/* ══════ ④ 섞이면서 생긴 위험을 막는가 — 이 파일의 절반 ══════ */

test('★★ 공유받은 사진은 «손댈 수 없다» — 화면이 아니라 사진으로 가른다', () => {
  const fn = cutFn(app, 'function mayTouch(');
  assert.match(fn, /if \(list\.length\) return list\.every\(isMinePhoto\)/,
    '★ 고른 것이 있으면 그것들로 판단해야 합니다 — 화면으로 판단하면 이제 남의 사진이 섞입니다');
  const ctx = { Array, PuPhotoStore: { amAdmin: function () { return false; } } };
  ctx.isMinePhoto = function (id) { return id === 'mine'; };
  ctx.viewingOther = function () { return false; };   // 「내 사진」 화면
  vm.createContext(ctx);
  vm.runInContext(fn, ctx);
  assert.equal(ctx.mayTouch(['mine']), true);
  assert.equal(ctx.mayTouch(['mine', 'got']), false,
    '★ 「내 사진」 화면이라는 이유로 공유받은 사진까지 열리면, 눌러도 서버가 막습니다');
});

test('★★ 자동 판독이 «남의 사진을 안 읽는다» — 읽어도 못 쓰고 AI 한도만 나간다', () => {
  const fn = cutFn(app, 'function autoReadPending(');
  assert.match(fn, /const canRead = function \(it\) \{ return mayTouch\(it\.id\); \};/,
    '★ 판독은 읽고 «쓰는» 일입니다 — 쓸 수 없는 사진은 읽을 값이 없습니다');
  /* ⚠ 2026-09-07 — 거르개 «차례»를 글자 그대로 박아 두었다가, 사이에 거르개가 하나
     늘자 깨졌다(사진을 판독에 안 보내는 문지기 readSkipWhy 가 들어왔다).
     지킬 것은 차례가 아니라 규칙이다: **세 목록이 모두 canRead 로 시작한다.**
     ⚠ `[^)]*` 로 사이를 건너뛰지 «않는다» — 거르개 이름에 괄호가 들어 있어
       그 자리에서 끊긴다(이 저장소가 여러 번 밟은 함정이다). 길이로 끊는다. */
  const chain = function (name) {
    return new RegExp('gridItems\\.filter\\(canRead\\)[\\s\\S]{0,40}\\.filter\\(' + name + '\\)');
  };
  assert.match(fn, chain('neverRead'), '안 읽은 것에 안 걸립니다');
  assert.match(fn, chain('failedRead'), '실패해서 다시 거는 것에 안 걸립니다');
  assert.match(fn, chain('staleRead'), '다시 읽는 것에 안 걸립니다');
});

test('★ 업체관리 자동 보내기도 남의 사진을 건드리지 않는다', () => {
  assert.match(cutFn(app, 'function coWaiting('), /if \(!mayTouch\(it\.id\)\) return false;/,
    '★ 남의 사진에 「보냈음」 표를 그 사람 자리에 쓰려다 막힙니다');
});

test('★ 손댈 수 있는지 실제로 갈린다 — 자동 판독 거르개를 돌려 본다', () => {
  const ctx = { Array, PuPhotoStore: { amAdmin: function () { return false; } } };
  ctx.isMinePhoto = function (id) { return id === 'mine'; };
  ctx.viewingOther = function () { return false; };
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'function mayTouch('), ctx);
  const items = [{ id: 'mine' }, { id: 'got' }];
  const canRead = function (it) { return ctx.mayTouch(it.id); };
  assert.deepEqual(items.filter(canRead).map(function (x) { return x.id; }), ['mine']);
});
