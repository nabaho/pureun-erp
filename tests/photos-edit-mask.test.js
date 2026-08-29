'use strict';
/* ✏ 사진 편집 — 특정 부분을 «없앤다» (대표 지시 2026-08-29)

   "사진첩에 사진편집기능도 만들수 있나 특정부분 없어지게하거나 만들고 싶은데"
   "그리고 편집기능에 최소 비용이 들게 만들어야한다."

   ■ 왜 이렇게 만들었나
   **요금이 0원이다.** 브라우저 안에서 캔버스로 칠하고 끝난다 — 사진이 밖으로
   안 나가고 AI 도 안 부른다. 「최소 비용」 지시에 가장 곧은 답이다.

   ■ 새로 만들지 않고 «있는 것»을 쓴다
   네모 긋기는 「🔒 가리고 판독」이 이미 갖고 있다. 새로 만들면 좌표 계산·끌기
   가로채기·폰 손가락 자리를 한 벌 더 갖게 되고 한쪽만 고쳐지는 날이 온다.
   같은 화면에 **나가는 문만 둘**이다 — 「가리고 판독」과 「가려서 저장」.

   ■ 가장 위험한 자리
   ① 「가리고 판독」은 **반드시 까맣게**여야 한다. 모자이크·흐리게는 밑이 비쳐
      AI 가 읽어 낼 수 있다 — 가린 셈 치고 주민번호를 그대로 내보내게 된다.
   ② 못 만들었으면 **아무것도 안 쓴다.** 조용히 넘어가면 안 가려진 원본이 그대로
      남는데 사람은 가린 줄 안다.
   ③ **미리보기를 다시 만든다.** 안 그러면 격자에는 가리기 전 그림이 계속 보인다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const maskJs = fs.readFileSync(path.join(R, 'js', 'pu-rrn-mask.js'), 'utf8');
const maskUi = fs.readFileSync(path.join(R, 'js', 'pu-rrn-mask-ui.js'), 'utf8');

/* ══════ ① 칠하는 결 — 까맣게 · 모자이크 · 흐리게 ══════
   가짜 캔버스로 «무엇을 했는지»를 적어 두고 본다. */
function fakeCanvas(w, h, log) {
  const ctx = {
    fillStyle: '', filter: '', imageSmoothingEnabled: true,
    fillRect: function (x, y, ww, hh) { log.push(['fill', x, y, ww, hh]); },
    /* ⚠ **그리는 그 순간의** 매끄럽게 하기 값을 함께 적는다. 나중에 캔버스를 들여다보면
       save/restore 뒤라 되돌아가 있어, 「매끄럽게 늘렸다」를 못 잡는다
       (2026-08-29 되돌림에서 실제로 새어 나갔다). */
    drawImage: function () {
      log.push(['draw', ctx.imageSmoothingEnabled].concat(Array.prototype.slice.call(arguments, 1)));
    },
    save: function () {}, restore: function () {}
  };
  return { width: w, height: h, getContext: function () { return ctx; },
    toDataURL: function () { return 'data:image/jpeg;base64,OUT'; }, _ctx: ctx };
}
function runMask(style, opts) {
  const log = [];
  const ctx = { Math, Number, isFinite, Error };
  vm.createContext(ctx);
  vm.runInContext('var global = this; var MIN_SIDE = 0.01;\n' +
    maskJs.match(/function clamp01[\s\S]*?\n  \}/)[0] + '\n' +
    maskJs.match(/function toPixels[\s\S]*?\n  \}/)[0] + '\n' +
    maskJs.match(/function maskToDataUrl[\s\S]*?\n  \}/)[0] + '\n' +
    maskJs.match(/function mosaic[\s\S]*?\n  \}/)[0] + '\n' +
    maskJs.match(/function blurBox[\s\S]*?\n  \}/)[0], ctx);
  const img = { naturalWidth: 1000, naturalHeight: 800 };
  const boxes = [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }];
  const made = [];
  const out = ctx.maskToDataUrl(img, boxes, Object.assign({
    style: style,
    makeCanvas: function (w, h) { const c = fakeCanvas(w, h, log); made.push(c); return c; }
  }, opts || {}));
  return { out: out, log: log, made: made };
}

test('★ 안 주면 «까맣게» — 옛 길(가리고 판독)의 동작이 안 바뀐다', () => {
  const r = runMask(undefined);
  assert.ok(r.log.some(function (x) { return x[0] === 'fill'; }),
    '★ 까맣게 칠하지 않으면 주민번호가 그대로 남습니다');
  assert.equal(r.made.length, 1, '조각 캔버스를 만들 일이 없습니다');
});

test('★★ 모자이크는 «작게 줄였다 도로 키운다» — 매끄럽게 늘리면 알갱이가 안 생긴다', () => {
  const r = runMask('mosaic');
  assert.equal(r.made.length, 2, '조각을 뜰 캔버스가 하나 더 있어야 합니다');
  const tmp = r.made[1];
  assert.ok(tmp.width < 200 && tmp.height < 80, '★ 안 줄이면 모자이크가 아닙니다');
  /* 줄일 때도, **도로 키울 때도** 매끄럽게 하면 안 된다 — 둘 중 하나만 꺼도 뭉개진다 */
  const draws = r.log.filter(function (x) { return x[0] === 'draw'; });
  assert.ok(draws.length >= 3, '원본 그리기 + 조각 뜨기 + 도로 키우기');
  assert.equal(draws[1][1], false, '★ 줄일 때 매끄럽게 하면 알갱이가 안 생깁니다');
  assert.equal(draws[2][1], false,
    '★ 도로 키울 때 매끄럽게 하면 흐릿해질 뿐이라 글자가 읽힙니다');
  assert.ok(!r.log.some(function (x) { return x[0] === 'fill'; }), '까맣게 칠하면 안 됩니다');
});

test('★ 흐리게는 «그 자리만» 흐린다 — 캔버스 filter 는 그리는 전체에 걸린다', () => {
  const r = runMask('blur');
  assert.equal(r.made.length, 2);
  assert.match(r.made[1]._ctx.filter, /blur\(\d+px\)/,
    '★ 조각 캔버스에 안 걸면 사진 «전체»가 흐려집니다');
});

test('★★ filter 를 못 쓰는 브라우저에서는 «모자이크로 떨어진다» — 조용히 안 가리면 안 된다', () => {
  /* 가짜 캔버스가 filter 를 안 받는 척한다(오래된 웹뷰). */
  const log = [];
  const ctx = { Math, Number, isFinite, Error };
  vm.createContext(ctx);
  vm.runInContext('var global = this; var MIN_SIDE = 0.01;\n' +
    maskJs.match(/function clamp01[\s\S]*?\n  \}/)[0] + '\n' +
    maskJs.match(/function toPixels[\s\S]*?\n  \}/)[0] + '\n' +
    maskJs.match(/function maskToDataUrl[\s\S]*?\n  \}/)[0] + '\n' +
    maskJs.match(/function mosaic[\s\S]*?\n  \}/)[0] + '\n' +
    maskJs.match(/function blurBox[\s\S]*?\n  \}/)[0], ctx);
  const made = [];
  ctx.maskToDataUrl({ naturalWidth: 1000, naturalHeight: 800 },
    [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }], {
      style: 'blur',
      makeCanvas: function (w, h) {
        const c = fakeCanvas(w, h, log);
        Object.defineProperty(c._ctx, 'filter', { get: function () { return undefined; }, set: function () {} });
        made.push(c); return c;
      }
    });
  assert.ok(made.length >= 2);
  assert.equal(made[made.length - 1]._ctx.imageSmoothingEnabled, false,
    '★ 흐리게를 못 하면 «안 가려진 채로» 저장됩니다 — 모자이크로라도 가려야 합니다');
});

test('★ 사진 크기를 모르면 던진다 — 조용히 원본을 돌려주면 안 가려진 사진이 나간다', () => {
  const ctx = { Math, Number, isFinite, Error };
  vm.createContext(ctx);
  vm.runInContext('var global = this;\n' + maskJs.match(/function maskToDataUrl[\s\S]*?\n  \}/)[0], ctx);
  assert.throws(function () { ctx.maskToDataUrl({}, [{ x: 0, y: 0, w: 1, h: 1 }], {}); });
});

/* ══════ ② 「가리고 판독」은 반드시 까맣게 ══════ */

test('★★ 판독으로 보내는 길에는 «결 고르개를 안 준다» — 모자이크는 밑이 비쳐 AI 가 읽는다', () => {
  const fn = app.match(/function maskPanelHtml\(\)[\s\S]*?\n\}/)[0];
  assert.match(fn, /const styles = edit\s*\r?\n?\s*\?/,
    '★ 「가리고 판독」에도 결을 고르게 하면, 가린 셈 치고 주민번호가 그대로 나갑니다');
  assert.match(fn, /photoMaskStyle\(/, '고르개가 아예 없습니다');
});

test('★ 가림 층은 «안 주면 까맣게» 그대로다 — 옛 부르는 자리가 안 바뀐다', () => {
  const fn = cutFn(maskUi, 'function maskedDataUrl(');
  assert.match(fn, /maskToDataUrl\(el\('maskImg'\), s\.boxes, opts \|\| \{\}\)/,
    '결을 넘길 길이 없으면 「가리기」가 늘 까맣게만 됩니다');
});

/* ══════ ③ 저장 — 되돌릴 수 없는 일이다 ══════ */

test('★★ 저장이 «원본과 미리보기를 함께» 바꾼다 — 미리보기를 두면 격자에 가리기 전 그림이 남는다', () => {
  const fn = cutFn(app, 'async function photoEditSave(');
  assert.match(fn, /shrinkDataUrl\(full, 240/,
    '★ 미리보기를 다시 안 만들면 격자에서는 계속 가리기 전 사진이 보입니다');
  assert.match(fn, /PuPhotoStore\.replaceImage\(photoYearOf\(id\), id, full, thumb, photoOwner\(id\)\)/,
    '★ 주인을 안 넘기면 저장 층이 내 자리에 씁니다');
});

/* ⚠ 「confirm( 이라는 글자가 있나」로는 못 잡는다 — `if (false && !confirm(...))` 로
   막아도 글자는 그대로 남는다(2026-08-29 되돌림에서 실제로 새어 나갔다). **돌려서** 본다. */
function saveCtx(over) {
  const calls = { replace: [], alert: [], toast: [] };
  const ctx = Object.assign({
    Promise, Object, Array, document: { querySelector: function () { return null; } },
    console: { warn() {} },
    viewerId: 'p1',
    photoMask: { status: 'ready', style: 'black', boxes: [{ x: 0, y: 0, w: .2, h: .1 }] },
    gridItems: [{ id: 'p1', meta: {} }],
    blockedIfOther: function () { return false; },
    confirm: function () { return true; },
    alert: function (m) { calls.alert.push(m); },
    toast: function (m) { calls.toast.push(m); },
    photoYearOf: function () { return '2026'; },
    photoOwner: function () { return 'OWNER'; },
    shrinkDataUrl: function () { return Promise.resolve('THUMB'); },
    renderReadPanel: function () {}, renderGrid: function () {}, maskItem: function () { return null; },
    $: function () { return null; },
    PuRrnMaskUi: {
      maskedDataUrl: function () { return 'FULL'; },
      blank: function () { return { status: 'idle', boxes: [] }; }
    },
    PuPhotoStore: {
      replaceImage: function (y, id, full, thumb, owner) {
        calls.replace.push({ y: y, id: id, full: full, thumb: thumb, owner: owner });
        return Promise.resolve();
      }
    },
    _calls: calls
  }, over || {});
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'async function photoEditSave('), ctx);
  return ctx;
}

test('★★ 「아니오」를 누르면 «아무것도 안 쓴다» — 되돌릴 수 없는 일이다', async () => {
  const c = saveCtx({ confirm: function () { return false; } });
  await c.photoEditSave();
  assert.equal(c._calls.replace.length, 0,
    '★ 안 묻고 덮으면 잘못 그은 채로 원본이 사라집니다 — 되돌릴 길이 없습니다');
});

test('★ 「예」면 원본과 미리보기를 함께 바꾼다 — 실제로 돌려 본다', async () => {
  const c = saveCtx();
  await c.photoEditSave();
  assert.equal(c._calls.replace.length, 1);
  assert.equal(c._calls.replace[0].full, 'FULL');
  assert.equal(c._calls.replace[0].thumb, 'THUMB', '★ 미리보기를 안 바꾸면 격자에 옛 그림이 남습니다');
  assert.equal(c._calls.replace[0].owner, 'OWNER');
});

test('★ 되돌릴 수 없다는 것을 말하고 묻는다', () => {
  assert.match(cutFn(app, 'async function photoEditSave('), /되돌릴 수 없습니다/);
});

test('★★ 못 만들었으면 «아무것도 안 쓴다» — 원본은 그대로', () => {
  const fn = cutFn(app, 'async function photoEditSave(');
  const i = fn.indexOf('maskedDataUrl');
  const j = fn.indexOf('replaceImage');
  assert.ok(i > 0 && j > i, '가린 사진을 먼저 만들고 나서 써야 합니다');
  assert.match(fn, /원본은 그대로입니다/,
    '★ 실패했는데 아무 말이 없으면 사람은 가린 줄 압니다');
});

test('★ 그은 곳이 없으면 저장하지 않는다 — 아무것도 안 바꾸면서 원본만 다시 굽는다', () => {
  const fn = cutFn(app, 'async function photoEditSave(');
  assert.match(fn, /if \(!n\) \{ alert\(/,
    '★ 0군데로 저장하면 화질만 한 번 더 깎입니다');
});

test('★★ 남의 사진은 못 고친다 — 「내 사진」에 공유받은 것이 섞여 있다', () => {
  assert.match(cutFn(app, 'function startPhotoEdit('), /blockedIfOther\(id\)/);
  assert.match(cutFn(app, 'async function photoEditSave('), /blockedIfOther\(id\)/,
    '★ 들어오는 문만 막으면, 열어 둔 창에서 그대로 저장할 수 있습니다');
});

test('★ 판독해 둔 값은 «가리기 전»의 것이라고 말해 준다', () => {
  assert.match(cutFn(app, 'async function photoEditSave('), /다시 판독/,
    '★ 가린 자리가 읽힌 곳이면 저장된 값과 사진이 어긋납니다');
});

test('★★ 무엇을 하러 들어왔는지를 «잃지 않는다» — 잃으면 가리기가 판독으로 나간다', () => {
  const fn = cutFn(app, 'function startPhotoMask(');
  assert.match(fn, /purpose: photoMask\.purpose, style: photoMask\.style/,
    '★ 사진을 다 받은 뒤 blank() 로 새로 만들면서 잃어버리면,\n' +
    '  「가리기」로 들어왔는데 확인 단추가 「가리고 판독」으로 나옵니다 —\n' +
    '  누르면 원본은 안 고쳐지고 AI 만 불립니다(요금이 나갑니다).');
});

/* ══════ ④ 요금 — 「최소 비용」 지시 ══════ */

test('★★ 가리기는 «밖으로 아무것도 안 보낸다» — 요금이 0원이다', () => {
  const fn = cutFn(app, 'async function photoEditSave(');
  assert.ok(!/fetch\(|readPhoto\(|PuDocRead/.test(fn),
    '★ 편집에 AI 를 부르면 장마다 요금이 나갑니다(대표 지시: 최소 비용).');
});
