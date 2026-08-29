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
  assert.match(cutFn(app, 'function pickOwner('), /sharedOnly = false/);
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
  assert.match(fn, /gridItems\.filter\(canRead\)\.filter\(neverRead\)/, '안 읽은 것에 안 걸립니다');
  assert.match(fn, /gridItems\.filter\(canRead\)\.filter\(staleRead\)/, '다시 읽는 것에 안 걸립니다');
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
