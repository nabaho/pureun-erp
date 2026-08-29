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
/* ══════ ② 「🔒 가리고 판독」은 반드시 까맣게 ══════

   ⚠ 2026-08-29 대표 지시 「이 세가지 기능 없애고 자유롭게 편집할 수 있게」로
     화면의 결 고르개(까맣게·모자이크·흐리게)를 걷었다. 그래서 이제 **고를 것이 없다** —
     가리기는 늘 까맣게다. 위 ①의 층 검사는 그대로 둔다(급여데이터함과 함께 쓰는
     층이고, 언젠가 다시 필요할 때 «어떻게 그려야 하는지»가 그 안에 적혀 있다).
   ⚠ 여기서 지키는 것은 **모자이크·흐리게가 판독 길로 새지 않는 것**이다 —
     밑이 비쳐 AI 가 읽어 내면 가린 셈 치고 주민번호가 그대로 나간다. */

test('★★ 판독으로 보내는 길은 «늘 까맣게»다 — 모자이크는 밑이 비쳐 AI 가 읽는다', () => {
  const fn = cutFn(app, 'function maskPanelHtml(');
  ['mosaic', 'blur', '모자이크', '흐리게', 'photoMaskStyle'].forEach(function (w) {
    assert.ok(fn.indexOf(w) < 0,
      '★★ 가리기 화면에 「' + w + '」가 있습니다 — 가린 셈 치고 주민번호가 그대로 나갑니다');
  });
  /* 실제로 넘기는 것도 없어야 한다 */
  assert.match(cutFn(app, 'function photoMaskConfirm('), /PuRrnMaskUi\.maskedDataUrl\(\)/,
    '★★ 판독 길에 결을 넘기면 안 됩니다');
});

test('★ 가림 층은 «안 주면 까맣게» 그대로다 — 옛 부르는 자리가 안 바뀐다', () => {
  const fn = cutFn(maskUi, 'function maskedDataUrl(');
  assert.match(fn, /maskToDataUrl\(el\('maskImg'\), s\.boxes, opts \|\| \{\}\)/,
    '결을 넘길 길이 없으면 「가리기」가 늘 까맣게만 됩니다');
});

/* ══════ ③ 가리기 화면에 «나가는 문이 하나»다 ══════

   ⚠ 예전에는 이 한 화면에 문이 둘이었다 — 「가리고 판독」과 「가려서 저장」.
     편집하러 온 사람에게 판독 단추가, 판독하러 온 사람에게 저장 단추가 함께 보였다.
     대표가 여러 번 「편집을 갈라 달라」고 하신 것이 이것이고, 2026-08-29 에 갈랐다.
     편집기 쪽 검사는 tests/photos-editor-free.test.js 에 있다. */

test('★★ 가리기 화면에는 «가리고 판독» 하나만 있다', () => {
  const fn = cutFn(app, 'function maskPanelHtml(');
  assert.match(fn, /photoMaskConfirm\(\)/, '★★ 판독으로 나가는 문이 없어졌습니다');
  /* ⚠ **주석을 먼저 걷는다** — 「예전에는 「가려서 저장」이 함께 보였다」 같은 «설명»까지
     세면, 다음 사람이 그 기록을 지우게 된다(저장소 규칙). */
  const code = fn.replace(/\/\*[\s\S]*?\*\//g, '');
  ['photoEditSave', 'photoEditAi', 'edRun', '가려서 저장'].forEach(function (w) {
    assert.ok(code.indexOf(w) < 0, '★★ 가리기 화면에 편집 갈래가 돌아왔습니다: ' + w);
  });
  /* 편집은 제 화면을 갖는다 */
  assert.match(app, /function edPanelHtml\(/, '★★ 편집기 화면이 없어졌습니다');
});

test('★★ 가리기는 «옆 칸에서» 긋는다 — 그 길을 건드리면 08-17 보안 고침이 흔들린다', () => {
  const fn = cutFn(app, 'function maskPanelHtml(');
  assert.match(fn, /maskWrapHtml\(ms, maskBoxesHtml\(ms\)\)/,
    '★★ 가리기가 긋는 판을 안 그립니다 — 주민번호를 가릴 자리가 없어집니다');
  /* 긋기 층이 찾는 id 는 화면에 «하나»여야 한다 */
  assert.equal((app.match(/id="maskImg"/g) || []).length, 1,
    '★★ maskImg 가 둘이면 긋기 층이 어느 쪽을 잡을지 몰라 좌표가 엉뚱해집니다');
  assert.equal((app.match(/id="maskWrap"/g) || []).length, 1);
});

test('★★ 무엇을 하러 들어왔는지를 «잃지 않는다» — 사진을 받은 뒤에도 이어진다', () => {
  /* ⚠ 갈래(purpose)는 2026-08-29 에 없어졌다 — 가리기는 이제 판독 하나뿐이다.
     그래도 «칠하는 결»은 사진을 받은 뒤에도 이어져야 한다(blank() 로 새로 만들면서
     잃으면 조용히 딴 값이 된다). */
  const fn = cutFn(app, 'function startPhotoMask(');
  assert.match(fn, /style: photoMask\.style/,
    '★ 사진을 다 받은 뒤 blank() 로 새로 만들면서 잃어버립니다');
  assert.ok(fn.indexOf('purpose') < 0,
    '★ 없어진 갈래가 되돌아왔습니다 — 가리기는 판독 하나뿐입니다');
});

/* ══════ ④ 편집 중에는 사진을 안 넘긴다 ══════
   ⚠ 그리는 중에 사진이 바뀌면 칠한 것이 **엉뚱한 사진에** 얹힌다.
     세 자리(넘기기·닫기·돌리기)가 저마다 재면 한 곳이 꼭 빠진다 — 한 곳에서만 판단한다. */

test('★★ 편집 중인지 판단하는 곳이 «하나»다', () => {
  const fn = cutFn(app, 'function photoEditing(');
  assert.match(fn, /photoEd/, '★★ 편집 중인지를 가리기 상태로 재고 있습니다');
  /* 부르는 자리가 셋 이상이어야 한다(넘기기·닫기·돌리기) */
  const uses = (app.match(/photoEditing\(\)/g) || []).length;
  assert.ok(uses >= 3, '★★ 막는 자리가 ' + uses + '군데뿐입니다 — 한 곳이 빠졌습니다');
});

test('★★ 편집 중에는 사진을 «안 넘긴다» — 칠한 것이 엉뚱한 사진에 얹힌다', () => {
  assert.match(cutFn(app, 'function gotoPhoto('), /photoEditing\(\)/);
});

test('★★ 편집 중에는 사진 자리를 눌러도 «창이 안 닫힌다»', () => {
  /* 안 막으면 한 획 그을 때마다 「사진 바깥을 눌렀다」로 읽혀 창이 닫히고
     칠한 것이 통째로 사라진다. */
  assert.match(app, /photoEditing\(\)/);
  const at = app.indexOf('function viewerBackdrop');
  const near = at > 0 ? cutFn(app, 'function viewerBackdrop(') : app;
  assert.ok(near.indexOf('photoEditing()') > 0 || app.indexOf('photoEditing()') > 0);
});

test('★★ 가리기·편집 모두 «밖으로 아무것도 안 보내지 않는다»는 것을 갈라 둔다', () => {
  /* 가리기(🔒 가리고 판독)는 브라우저 안에서 칠하고 끝난다 — 요금 0원.
     편집(🖍)은 AI 를 부르므로 요금이 든다. 둘을 헷갈리면 헛돈이 나간다. */
  const confirm = cutFn(app, 'function photoMaskConfirm(');
  assert.ok(confirm.indexOf('callEdit') < 0 && confirm.indexOf('fetch') < 0,
    '★★ 가리기가 밖으로 보냅니다 — 요금 0원이 아니게 됩니다');
  const run = cutFn(app, 'async function edRun(');
  assert.match(run, /요금이 ' \+ areas\.length \+ '번/,
    '★★ 편집은 요금이 든다는 것을 «수까지» 말해야 합니다');
});
