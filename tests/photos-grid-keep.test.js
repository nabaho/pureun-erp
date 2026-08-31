'use strict';
/* 🖼 사진이 «몇 초간 안 보이던» 것 (대표 보고 2026-08-30)

   "사진첩에서 가끔씩 사진이 다 안 보이는 부분이 몇초간 발생한다"

   ■ 왜 그랬나 — 둘이 겹쳤다
   ① **되읽기가 미리보기를 버렸다.** loadGrid 가 목록을 «새 객체»로 갈아 끼우면서
      앞서 받아 둔 it.thumb 이 통째로 사라졌다. 그 상태로 격자를 그리면 칸에
      **그림 자체가 안 들어가고**, 그때부터 주소를 다시 받아 온다 —
      그 사이가 「몇 초간 빈 화면」이다.
   ② **바뀐 게 없어도 격자를 통째로 다시 그렸다.** innerHTML 을 다시 넣으면
      사진 백 장이 지워졌다 다시 만들어져 번쩍인다.

   ■ 되읽기는 «자주» 일어난다 — 그래서 자주 겪으셨다
   · 다른 직원이 사진을 올릴 때마다(watchUploadIndex)
   · **탭을 다시 볼 때마다**(focus · visibilitychange)

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* ══════ ① 되읽어도 미리보기를 들고 넘어간다 ══════ */

function loadCtx(over) {
  const seeded = [];
  const ctx = Object.assign({
    Object: Object, Promise: Promise, console: { warn: function () {} },
    gridItems: [
      { id: 'a', meta: { w: 1 }, thumb: 'URL-A' },
      { id: 'b', meta: { w: 1 }, thumb: 'URL-B' },
      { id: 'c', meta: { w: 1 }, thumb: null }
    ],
    gridYear: '2026', gridOwner: null,
    SHARED_OWNER: '__shared', ALL_OWNERS: '__all',
    window: {},
    PuPhotoStore: {},
    listMineAndShared: function () {
      /* 되읽기 — a·b 는 그대로, c 는 사라지고 d 가 새로 생겼다 */
      return Promise.resolve({ a: { w: 1 }, b: { w: 1 }, d: { w: 1 } });
    },
    comparePhotosNewest: function (x, y) { return x.id < y.id ? -1 : 1; },
    resetGridRenderLimit: function () {}, showGridError: function () {},
    renderGrid: function () {}, fillThumbs: function () {},
    openAskedPhoto: function () {}, resumeCollectIfAny: function () {},
    autoReadPending: function () {}, coSweep: function () {},
    /* 씨앗 층 — 여기서는 «담기만» 본다(그리는 쪽은 아래 따로 본다) */
    gridSeedKey: function () { return 'K'; },
    drawGridSeed: function () { seeded.push('draw'); },
    gridSeedPut: function (k, items) { seeded.push({ key: k, n: Object.keys(items).length }); },
    _seeded: seeded
  }, over || {});
  vm.createContext(ctx);
  vm.runInContext('var _gridLoadToken = 0; var _gridSeeded = false;', ctx);
  /* 목록을 만드는 «같은 손»을 그대로 쓴다 — 대역을 넣으면 화면과 다른 것을 보게 된다 */
  vm.runInContext(cutFn(app, 'function itemsToGrid('), ctx);
  vm.runInContext(cutFn(app, 'function loadGrid('), ctx);
  return ctx;
}

test('★★ 되읽어도 «이미 받아 둔 미리보기»를 들고 넘어간다 — 안 그러면 몇 초간 빈 칸이다', async () => {
  const c = loadCtx();
  await c.loadGrid();
  const by = {};
  c.gridItems.forEach(function (it) { by[it.id] = it; });
  assert.equal(by.a.thumb, 'URL-A',
    '★★ 되읽으면서 미리보기를 버렸습니다 — 칸에 그림이 아예 안 들어갑니다');
  assert.equal(by.b.thumb, 'URL-B');
});

test('★ 새로 생긴 사진은 미리보기가 «없는 채»로 온다 — 남의 그림을 붙이면 안 된다', async () => {
  const c = loadCtx();
  await c.loadGrid();
  const d = c.gridItems.find(function (it) { return it.id === 'd'; });
  assert.ok(d, '새 사진이 목록에 없습니다');
  assert.ok(!d.thumb, '★★ 새 사진에 옛 그림이 붙었습니다');
});

test('★★ 그리기 «전»에 들고 넘어간다 — 뒤에 하면 이미 빈 칸으로 그려진 뒤다', () => {
  const fn = cutFn(app, 'function loadGrid(');
  const keep = fn.indexOf('keepThumb');
  const draw = fn.indexOf('renderGrid()');
  assert.ok(keep > 0, '★ 미리보기를 들고 넘어가지 않습니다');
  assert.ok(keep < draw,
    '★★ 격자를 먼저 그리면 그 순간 칸이 비고, 채우는 것은 그 뒤입니다 — 번쩍임이 남습니다');
});

/* ══════ ② 바뀐 게 없으면 화면을 안 건드린다 ══════ */

test('★★ 같은 글자가 또 오면 «격자를 다시 안 그린다» — 사진 백 장이 지워졌다 생긴다', () => {
  const fn = cutFn(app, 'function renderGrid(');
  assert.match(fn, /if \(_gridHtml !== html\) \{ el\.innerHTML = html; _gridHtml = html; \}/,
    '★★ 조건 없이 넣으면, 바뀐 게 없는 되읽기마다 화면이 번쩍입니다');
  /* 조건 없이 넣는 자리가 남아 있으면 안 된다 */
  assert.ok(!/(^|[^!])\bel\.innerHTML = html;(?! _gridHtml)/.test(fn.replace(/if \(_gridHtml[^\n]*\n?/g, '')),
    '★ 그냥 넣는 자리가 아직 있습니다');
});

test('★★ «화면에서 읽어» 견주지 않는다 — 브라우저가 다시 적어 주므로 절대 안 맞는다', () => {
  const fn = cutFn(app, 'function renderGrid(');
  assert.ok(!/el\.innerHTML !== html|el\.innerHTML ===/.test(fn),
    '★★ 화면에서 읽은 글자와 견주면 따옴표·차례가 달라 «늘 다르다»가 되고,\n' +
    '  백 KB 짜리 글자를 쓸데없이 한 번 더 만듭니다 — 고치기 전보다 느려집니다');
});

test('★★ 격자에 글을 쓰는 곳이 «하나»다 — 딴 데서 비우면 빈 화면이 그대로 남는다', () => {
  /* 기억해 두고 건너뛰는 것이 참이려면, 격자를 renderGrid 만 써야 한다.
     딴 데서 비워 놓고 여기서 「같으니 건너뛰자」 하면 빈 화면이 안 돌아온다. */
  const bare = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  const writes = bare.match(/\$\('grid'\)\s*\.\s*innerHTML/g) || [];
  assert.deepEqual(writes, [],
    '★★ renderGrid 밖에서 격자에 글을 씁니다 — 그러면 _gridHtml 도 함께 비워야 합니다');
});

/* ══════ ③ 되읽기를 부르는 자리 — 왜 자주 겪으셨나 ══════ */

/* ══════ ④ 창을 다시 봤다고 «다시 읽지 않는다» (대표 지시 2026-08-31) ══════
   "쓸데없이 창을 연 것만으로 비용이 나가면 사용 의미가 없다."
   「전체 근로자」는 되읽을 때마다 직원 아홉 사람의 한 해 치 정보를 통째로 받는다.
   탭을 스물쯤 띄워 두고 오가시므로 하루에 수십~수백 번 그 값을 치르고 있었다. */

test('★★ 창에 다시 눈이 갔다고 «되읽지 않는다» — 여기가 새던 자리다', () => {
  const bare = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!/addEventListener\('focus',\s*scheduleRemotePhotoRefresh\)/.test(bare),
    '★★ 창을 다시 볼 때마다 아홉 사람 몫을 처음부터 다시 읽습니다');
  assert.ok(!/visibilitychange[\s\S]{0,120}scheduleRemotePhotoRefresh/.test(bare),
    '★★ 창을 다시 보이게 할 때마다 같은 값을 치릅니다');
});

test('★★ 대신 «바뀌었다는 신호»로 읽는다 — 안 그러면 남이 올린 사진이 영영 안 보인다', () => {
  const bare = app.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(bare, /watchUploadIndex\(scheduleRemotePhotoRefresh\)/,
    '★★ 되읽는 길을 «전부» 없애면 남이 올린 사진이 안 들어옵니다');
  /* 되읽기는 몰아서 한 번만 — 여러 장이 한꺼번에 올라와도 한 번이다 */
  const fn = cutFn(app, 'function scheduleRemotePhotoRefresh(');
  assert.match(fn, /clearTimeout\(remoteRefreshTimer\)/,
    '★ 몰아 주지 않으면 열 장이 올라올 때 열 번 되읽습니다');
});

/* ══════ ⑤ 씨앗 — 열면 곧바로 그린다 (0원) ══════ */

test('★★ 최신본이 오면 «씨앗으로 담는다» — 다음에 열 때 기다림이 없다', async () => {
  const c = loadCtx();
  await c.loadGrid();
  const put = c._seeded.find(function (x) { return x && x.key; });
  assert.ok(put, '★★ 담지 않으면 다음에 열 때 또 처음부터 읽습니다');
  assert.equal(put.n, 3, '★ 받은 것을 그대로 담아야 합니다');
});

test('★★ 씨앗은 «보기마다 따로» 담는다 — 섞으면 남의 사진이 내 화면에 뜬다', () => {
  const fn = cutFn(app, 'function gridSeedKey(');
  assert.match(fn, /gridYear/, '★★ 해를 안 가르면 작년 사진이 올해에 뜹니다');
  assert.match(fn, /gridOwner/, '★★ 사람을 안 가르면 남의 사진이 내 화면에 뜹니다');
});

test('★★ 씨앗으로 그린 것을 «다시 담지 않는다» — 지워진 사진이 영영 살아남는다', () => {
  const fn = cutFn(app, 'function drawGridSeed(');
  assert.ok(fn.indexOf('gridSeedPut') < 0,
    '★★ 씨앗을 다시 담으면, 그 사이 지운 사진이 되살아나 영영 안 사라집니다');
  assert.match(fn, /if \(gridItems\.length\) return/,
    '★★ 최신본이 이미 왔는데 옛것으로 덮으면 안 됩니다');
});

test('★★ «늦게 온 옛 답»이 새 답을 덮지 않는다 — 해를 바꾸면 남의 목록이 그려진다', () => {
  const fn = cutFn(app, 'function loadGrid(');
  assert.match(fn, /const want = \+\+_gridLoadToken/, '★ 읽기를 가릴 표가 없습니다');
  assert.match(fn, /if \(want !== _gridLoadToken\) return;/,
    '★★ 늦게 온 답을 안 버리면, 해를 바꾼 뒤 옛 해 사진이 그려집니다');
});
