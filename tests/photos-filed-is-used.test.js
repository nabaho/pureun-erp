'use strict';
/* 회사 기록의 근거가 된 사진은 «증빙»이다 — 대표 결정 2026-08-28 「5년 보기」

   보유기준(2026-08-06)은 **증빙 5년 / 나머지 1년**이고, 그 갈림을 정하는 것은
   meta.used 표 하나다. 그런데 그 표를 남기는 것은 정부사업일정·푸른이알피 계약·
   근로복지기금 셋뿐이었다 — **기업정보함으로 보낸 명함·사업자등록증에는 안 붙었다.**

   그래서 그 원본들이 1년 뒤 「보유기간 지난 사진」으로 떠서, 모르고 지우면 회사 기록의
   근거가 사라진다. 대표께 여쭈니 「5년 보기」로 정하셨다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');

/* ══════ ① 표시하는 층 ══════ */

function markCtx() {
  const calls = [];
  const ctx = {
    console: { warn() {} }, Promise,
    photoYearOf: function () { return '2026'; },
    photoOwner: function () { return 'OWNER'; },
    PuPhotoStore: { markUsed: function (y, id, where, owner) {
      calls.push({ year: y, id: id, where: where, owner: owner });
      return Promise.resolve();
    } },
    _calls: calls
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'function markFiledUsed('), ctx);
  return ctx;
}

test('★ 주인 자리에 표시한다 — 안 넘기면 남이 올린 사진에는 영영 안 남는다', () => {
  const c = markCtx();
  c.markFiledUsed('p1', '2026', '기업정보함 — 가야엔지니어링');
  assert.equal(c._calls.length, 1);
  assert.equal(c._calls[0].owner, 'OWNER',
    '★ 주인을 안 넘기면 저장 층이 «내» 자리에 적어 아무 일도 안 일어납니다');
  assert.equal(c._calls[0].where, '기업정보함 — 가야엔지니어링',
    '어디에 썼는지 안 적으면 나중에 「이 사진 지워도 되나」에 답할 수 없습니다');
});

test('해를 안 주면 사진에 새겨진 해를 쓴다', () => {
  const c = markCtx();
  c.markFiledUsed('p1', '', '기업정보함 — 가');
  assert.equal(c._calls[0].year, '2026');
});

test('★ 표시가 막혀도 «보낸 것을 되돌리지 않는다» — 보관이 짧아질 뿐이다', () => {
  const c = markCtx();
  c.PuPhotoStore.markUsed = function () { return Promise.reject(new Error('PERMISSION_DENIED')); };
  assert.doesNotThrow(function () { c.markFiledUsed('p1', '2026', 'x'); },
    '★ 여기서 터지면 다 된 등록이 오류로 보입니다');
});

test('저장 층에 그 길이 없어도 안 넘어진다 — 옛 판을 쓰는 화면이 있을 수 있다', () => {
  const c = markCtx();
  c.PuPhotoStore = {};
  assert.doesNotThrow(function () { c.markFiledUsed('p1', '2026', 'x'); });
});

/* ══════ ② 세 길이 다 부른다 — 하나만 빠져도 그 사진은 1년이다 ══════ */

/* ⚠ 「markFiledUsed 라는 글자가 있나」로는 못 잡는다 — `0 && markFiledUsed(...)` 로
   막아도 통과한다(2026-08-28 되돌림에서 실제로 새어 나갔다). **돌려서** 본다. */
function sendCtx(kind) {
  const used = [];
  const ctx = {
    Promise, Object, String, Date, console: { warn() {} },
    gridItems: [{ id: 'p1', meta: { read: { kind: 'card', fields: { company: '가야엔지니어링' } } } }],
    gridYear: '2026', viewerId: null,
    photoOwner: function () { return 'OWNER'; },
    photoYearOf: function () { return '2026'; },
    photoTime: function () { return 0; },
    safeSrc: function (v) { return v || ''; },
    canSendCards: function () { return true; },
    renderReadPanel: function () {}, renderUp: function () {},
    dropRedundant: function () { return Promise.resolve(); },
    firebase: { auth: function () { return { currentUser: { email: 'a@b' } }; } },
    PuDocFile: {
      sendToCards: function () { return Promise.resolve({ id: 'c1', message: 'ok' }); },
      sendToCoInfo: function () { return Promise.resolve({ filled: ['ceo'], message: '1칸' }); }
    },
    PuPhotoStore: {
      myName: function () { return '권형하'; },
      loadFull: function () { return Promise.resolve('data:image/jpeg;base64,AA'); },
      saveRead: function () { return Promise.resolve(); },
      markUsed: function (y, id, where, owner) {
        used.push({ year: y, id: id, where: where, owner: owner });
        return Promise.resolve();
      }
    },
    _used: used
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'function markFiledUsed(') + '\n' +
    cutFn(app, 'function ' + kind + '('), ctx);
  return ctx;
}
const settle = function () { return new Promise(function (r) { setTimeout(r, 20); }); };

test('★ 기업정보함으로 보내면 «실제로» 증빙 표시가 남는다', async () => {
  const c = sendCtx('sendCards');
  c.sendCards('p1', '2026', null);
  await settle();
  assert.equal(c._used.length, 1,
    '★ 명함·사업자등록증 원본이 1년 뒤 「지난 사진」으로 뜹니다');
  assert.match(c._used[0].where, /^기업정보함 —/);
  assert.equal(c._used[0].owner, 'OWNER', '★ 주인 자리에 안 적으면 남의 사진에는 안 남습니다');
  assert.equal(c._used[0].year, '2026');
});

test('★ 기업 상세로 보내면 «실제로» 증빙 표시가 남는다', async () => {
  const c = sendCtx('sendCoInfoWith');
  c.sendCoInfoWith('p1', '2026', null,
    c.gridItems[0], c.gridItems[0].meta.read, { company: '가야엔지니어링' });
  await settle();
  assert.equal(c._used.length, 1, '★ 서식·신청서 원본이 1년 뒤 「지난 사진」으로 뜹니다');
  assert.match(c._used[0].where, /^기업 상세 —/);
  assert.equal(c._used[0].owner, 'OWNER');
});

test('★★ 업체관리는 «실제로 넣었을 때만» — 업체가 없어 못 넣은 것은 근거가 아니다', () => {
  const fn = cutFn(app, 'function sendCompany(');
  assert.match(fn, /if \(res\.found\) \{[\s\S]{0,180}markFiledUsed\(id, year, '업체관리 — '/,
    '★ 못 넣은 것까지 5년을 잡으면 안 지워도 될 사진이 쌓입니다');
});

test('★ 세 길이 «같은 함수»를 쓴다 — 세 벌로 두면 한 곳이 꼭 빠진다', () => {
  /* 이번에 빠졌던 것이 바로 그런 자리다. */
  const n = (app.match(/markFiledUsed\(/g) || []).length;
  assert.ok(n >= 4, '★ 부르는 곳이 ' + n + '곳입니다 (정의 1 + 세 길)');
  /* 세 길 안에서 markUsed 를 직접 부르지 않는다 — 그러면 다시 세 벌이 된다 */
  ['sendCards', 'sendCoInfoWith', 'sendCompany'].forEach(function (f) {
    assert.ok(!/PuPhotoStore\.markUsed\(/.test(cutFn(app, 'function ' + f + '(')),
      '★ ' + f + ' 이 저장 층을 직접 부릅니다 — 주인 넘기기를 또 빠뜨리게 됩니다');
  });
});

/* ══════ ③ 그 표가 실제로 5년을 만든다 ══════ */

test('★ 표가 붙으면 5년, 없으면 1년 — 이 갈림이 이 결정의 전부다', () => {
  const ctx = { Date, Number, isFinite };
  vm.createContext(ctx);
  vm.runInContext(
    (app.match(/const KEEP_USED_YEARS = \d+;/) || [''])[0].replace('const', 'var') + '\n' +
    (app.match(/const KEEP_PLAIN_YEARS = \d+;/) || [''])[0].replace('const', 'var') + '\n' +
    cutFn(app, 'function isUsed('), ctx);
  assert.equal(ctx.KEEP_USED_YEARS, 5, '★ 증빙은 5년입니다');
  assert.equal(ctx.KEEP_PLAIN_YEARS, 1);
  assert.equal(ctx.isUsed({ used: { at: 1 } }), true);
  assert.equal(ctx.isUsed({ used: {} }), false, '때가 없으면 쓴 것이 아니다');
  assert.equal(ctx.isUsed({}), false);
});

test('저장 층이 주인 자리를 실제로 받는다 — 넘겨도 안 받으면 소용없다', () => {
  assert.match(cutFn(store, 'function markUsed('), /function markUsed\(year, id, where, owner\)/);
  assert.match(cutFn(store, 'function markUsed('), /metaPath\(year, id, owner\)/);
});

/* ══════ ④ 복사 — 초점을 잃어도 되게 ══════ */

test('★★ 클립보드 쓰기를 «누른 그 순간»에 건다 — 사진을 기다리다 초점을 잃으면 거절당한다', () => {
  const fn = cutFn(app, 'function copyPhotoImage(');
  assert.match(fn, /new ClipboardItem\(\{ 'image\/png': blobP \}\)/,
    '★ Blob 을 다 받은 뒤에 쓰면, 그 사이 한글 창으로 옮겨 간 사람에게는 그냥 안 됩니다');
  /* 쓰기가 사진 받기 «뒤»에 매달려 있으면 안 된다 */
  /* ⚠ 「navigator.clipboard.write」만 찾으면 맨 위의 «되는 브라우저인가» 확인줄
     (typeof …write === 'function')을 먼저 집는다 — 실제로 부르는 자리로 겨눈다. */
  assert.ok(fn.indexOf('navigator.clipboard.write([') > fn.indexOf('const blobP'),
    '약속을 먼저 만들어 두고 곧바로 걸어야 합니다');
  assert.ok(!/\.then\(function \(blob\) \{[\s\S]{0,120}clipboard\.write/.test(fn),
    '★ 아직도 다 받은 뒤에 걸고 있습니다');
});
