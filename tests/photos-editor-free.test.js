/* 🖍 사진 편집 — 가리기에서 갈라낸 «제 화면» (대표 지시 2026-08-29)

   "왜 자꾸 편집기능 분리하라고 하는데 안되나 이 세가지 기능 없애고
    자유롭게 편집할 수 있게 기능 만들어달라" · 「둘 다」
   "원본은 두고 변경한것을 다시 저장하게 만들어라"

   ■ 그동안 무엇이 잘못돼 있었나
   편집이 **주민번호 가리기 화면을 제목만 바꿔** 쓰고 있었다. 그래서 도구가
   「까맣게·모자이크·흐리게」(가리는 결)였고, **네모밖에** 못 그었고,
   「저장하면 되돌릴 수 없습니다 — 원본을 덮어씁니다」였다.

   ■ 이 검사가 지키는 것 다섯 — 다섯 다 «조용히» 되돌아갈 수 있는 것들이다
     ① 편집과 가리기가 **다른 길**이다 (한 화면에 나가는 문이 둘이면 안 된다)
     ② 세 가지 결이 **없다** (편집은 가리는 일이 아니다)
     ③ **칠한 모양 그대로** 지운다 (네모로 덮으면 멀쩡한 배경까지 지우라고 시킨다)
     ④ **떨어진 군데마다 한 번씩** 부른다 — 그 수가 곧 요금이고, 화면이 그 수를 말한다
     ⑤ **원본을 안 덮는다.** 새 사진으로 담고 정보를 이어받는다 */

'use strict';
const test = require('node:test');
const { stripComments } = require('./strip-comments');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const PAINT = fs.readFileSync(path.join(R, 'js', 'pu-photo-paint.js'), 'utf8');

/* ── ① 갈라졌는가 ── */

test('★★ 편집과 가리기가 «다른 길»이다 — 한 화면에 나가는 문이 둘이면 안 된다', () => {
  /* 편집은 제 상태(photoEd)를 갖는다. 가리기 상태(photoMask)에 얹혀 있으면 안 된다. */
  assert.match(APP, /\nlet photoEd = null;/, '★★ 편집이 제 상태를 안 갖습니다');
  /* ⚠ `/photoEd/` 로 보면 안 된다 — **함수 이름(photoEditing) 자체에 그 글자가 들어 있어**
     몸통을 가리기 상태로 바꿔 놓아도 통과한다(되돌림에서 실제로 새어 나갔다). */
  const pe = cutFn(APP, 'function photoEditing(');
  assert.match(pe, /photoEd\s*&&\s*photoEd\.status/,
    '★★ 편집 중인지를 가리기 상태로 재고 있습니다');
  assert.ok(pe.indexOf('photoMask') < 0, '★★ 가리기 상태를 보고 있습니다');
  /* 가리기 화면에는 편집 갈래가 남아 있으면 안 된다 */
  const mp = cutFn(APP, 'function maskPanelHtml(');
  ['photoEditSave', 'photoEditAi', 'purpose', '사진 편집'].forEach(function (w) {
    assert.ok(mp.indexOf(w) < 0, '★★ 가리기 화면에 편집 갈래가 남았습니다: ' + w);
  });
  /* 편집으로 들어가는 문은 편집기를 연다 */
  assert.match(cutFn(APP, 'function startPhotoEdit('), /photoEd = \{/,
    '★★ 편집 단추가 아직 가리기 화면을 엽니다');
  assert.ok(cutFn(APP, 'function startPhotoEdit(').indexOf('startPhotoMask') < 0,
    '★★ 편집 단추가 가리기를 부릅니다 — 이것이 「분리 안 됐다」의 정체입니다');
});

test('★★ 세 가지 결이 없다 — 편집은 «가리는 일»이 아니다', () => {
  /* 주석에 「걷었다」고 적는 것은 괜찮다 — 코드에 남으면 안 된다 */
  const code = stripComments(APP);
  /* 이름은 그대로 못 박는다 — 다른 뜻으로 쓰일 일이 없는 말이다 */
  ['photoMaskStyle', '.maskstyle'].forEach(function (w) {
    assert.ok(code.indexOf(w) < 0, '★★ 「' + w + '」가 아직 살아 있습니다');
  });
  /* ⚠ 「모자이크」·「흐리게」는 **낱말로 찾으면 안 된다**(2026-08-30).
     둘 다 예사로 쓰는 우리말이라, 「고친 자리가 흐리게 나올 수 있습니다」 같은
     **전혀 다른 뜻의 안내문**에도 걸린다 — 실제로 걸렸다.
     막으려는 것은 «도구 이름표»다. 그래서 이름표로 쓰인 꼴만 본다:
       단추 글자( >흐리게< ) · 값( '흐리게' ) · 이름( style: "흐리게" ) */
  ['모자이크', '흐리게'].forEach(function (w) {
    const re = new RegExp('[\'">]\\s*' + w + '\\s*[\'"<]');
    const hit = re.exec(code);
    assert.ok(!hit, '★★ 「' + w + '」가 도구 이름표로 아직 살아 있습니다: ' +
      (hit ? code.slice(Math.max(0, hit.index - 40), hit.index + 30) : ''));
  });
});

test('★ 「🔒 가리고 판독」은 그대로다 — 그 길은 보안 고침이 걸려 있다', () => {
  assert.match(APP, /function photoMaskConfirm\(/, '★★ 가리고 판독이 없어졌습니다');
  const mp = cutFn(APP, 'function maskPanelHtml(');
  assert.match(mp, /가리고 판독/, '★★ 가리고 판독으로 나가는 문이 없어졌습니다');
  assert.match(mp, /주민번호 자리만/, '★ 왜 좁게 그으라는지 안내가 없어졌습니다');
});

/* ── ② 붓 ── */

function fakeCtx() {
  return { clearRect: function () {}, beginPath: function () {}, moveTo: function () {},
    lineTo: function () {}, stroke: function () {}, arc: function () {}, fill: function () {},
    save: function () {}, restore: function () {}, setLineDash: function () {},
    drawImage: function () {}, canvas: null,
    set fillStyle(v) {}, get fillStyle() { return ''; },
    set strokeStyle(v) {}, get strokeStyle() { return ''; },
    set lineWidth(v) {}, set lineCap(v) {}, set lineJoin(v) {},
    set globalCompositeOperation(v) {} };
}

function ed(over) {
  const el = {};
  const ctx = {
    console: { warn: function () {} },
    photoEd: null, edDrag: null,
    /* ⚠ 붓 굵기는 **원본에서 떠 온다** — 여기 손으로 적으면 원본의 값을 바꿔도
       검사가 제 값만 보고 통과한다(되돌림에서 실제로 새어 나갔다). */
    ED_BRUSH: JSON.parse(APP.match(/const ED_BRUSH = (\[[^\]]*\]);/)[1]),
    window: {},
    /* 테두리는 «따로 그린 판»을 얹어 만든다 — 그 판을 내줄 곳이 있어야 돈다 */
    document: { querySelector: function () { return null; },
      createElement: function () { return { width: 0, height: 0, getContext: fakeCtx }; } },
    $: function (id) {
      return el[id] || (el[id] = {
        src: '', style: {}, width: 0, height: 0, naturalWidth: 2000, naturalHeight: 1500,
        classList: { toggle: function () {}, add: function () {}, remove: function () {} },
        getBoundingClientRect: function () { return { left: 0, top: 0, width: 800, height: 600 }; },
        getContext: fakeCtx
      });
    },
    renderReadPanel: function () {}, maskItem: function () { return null; },
    Math: Math, Object: Object, Number: Number, String: String, Uint8Array: Uint8Array
  };
  ctx.globalThis = ctx;
  Object.assign(ctx, over || {});
  vm.createContext(ctx);
  /* ⚠ 이 층은 window 가 있으면 window 에 붙는다 — 덮어쓰면 통째로 사라진다 */
  vm.runInContext(PAINT, ctx);
  ['function edBrushR(', 'function setEdBrush(', 'function setEdErase(',
   'function edUndo(', 'function edClear(', 'function edPoint(', 'function edDown(',
   'function edMove(', 'function edUp(', 'function edEraseAt(', 'function edBandPath(',
   'function edPaintTo(', 'function edDrawCursor(', 'function edRepaint(',
   'function edMarkWrapMode(', 'function edAreas('].forEach(function (n) {
    vm.runInContext(cutFn(APP, n), ctx);
  });
  ctx.photoEd = { status: 'ready', id: 'p1', url: 'ORIG', strokes: [], brush: 1, erasing: false, done: null };
  ctx._el = el;
  return ctx;
}
function at(x, y) {
  return { clientX: x * 800, clientY: y * 600, preventDefault: function () {},
    currentTarget: { setPointerCapture: function () {} } };
}

test('★★ 붓으로 «자유롭게» 칠한다 — 네모가 아니다', () => {
  const c = ed();
  c.edDown(at(.2, .2)); c.edMove(at(.25, .24)); c.edMove(at(.3, .2)); c.edUp();
  assert.equal(c.photoEd.strokes.length, 1);
  assert.equal(c.photoEd.strokes[0].pts.length, 3,
    '★★ 지나간 자리를 안 따라갑니다 — 그러면 결국 두 점(=네모)입니다');
  assert.ok(c.photoEd.strokes[0].r > 0, '★ 붓 굵기가 안 실렸습니다');
});

test('★★ 떨어진 여러 군데를 한꺼번에 — 그 수가 곧 요금 횟수다', () => {
  const c = ed();
  c.edDown(at(.15, .15)); c.edUp();
  c.edDown(at(.85, .85)); c.edUp();
  assert.equal(c.edAreas().length, 2, '★★ 떨어진 두 곳을 한 군데로 셉니다');
  /* 가까이 있는 것은 하나로 — 따로 부르면 두 번 요금인데 어차피 한 조각에 든다.
     ⚠ **붓이 서로 닿지 않을 만큼** 떨어뜨려 놓고 재야 한다. 닿아 있으면 어차피 한
       덩어리라 「가까운 것을 묶는가」를 하나도 안 본다(되돌림에서 실제로 새어 나갔다). */
  const d = ed();
  d.setEdBrush(0);
  d.edDown(at(.50, .50)); d.edUp();
  d.edDown(at(.545, .50)); d.edUp();
  assert.equal(d.edAreas().length, 1, '★ 붙어 있는 두 획을 두 번 부릅니다 — 요금이 두 배입니다');
});

test('★★ 미끄러져 찍힌 «점 하나»에는 요금을 안 물린다', () => {
  const c = ed();
  /* 아주 작은 붓으로 톡 — 지울 뜻이 없는 자국이다 */
  c.photoEd.strokes.push({ pts: [{ x: .9, y: .1 }], r: 0.0015 });
  assert.equal(c.edAreas().length, 0,
    '★★ 손이 미끄러진 점 하나에 요금이 한 번 더 나갑니다');
  /* 제대로 칠한 것은 그대로 센다 */
  c.edDown(at(.4, .4)); c.edUp();
  assert.equal(c.edAreas().length, 1);
});

test('★★ 붓이 «동그랗다» — 세로 사진에서 찌그러지면 지울 자리가 딴 모양이 된다', () => {
  const c = ed();
  /* 같은 굵기로 톡 찍었을 때, 가로 사진과 세로 사진에서 «실제 픽셀 크기»가 같아야 한다.
     가로세로를 저마다 제 변으로 재면 세로 사진에서 납작해진다. */
  const P = c.window.PuPhotoPaint;
  const one = [{ pts: [{ x: .5, y: .5 }], r: 0.05 }];
  const land = P.areas(one, 2000, 1500)[0];
  const port = P.areas(one, 1500, 2000)[0];
  const lw = land.w * 2000, lh = land.h * 1500;
  const pw = port.w * 1500, ph = port.h * 2000;
  assert.ok(Math.abs(lw - lh) <= 12, '★★ 가로 사진에서 붓이 찌그러졌습니다 (' + Math.round(lw) + '×' + Math.round(lh) + ')');
  assert.ok(Math.abs(pw - ph) <= 12, '★★ 세로 사진에서 붓이 찌그러졌습니다 (' + Math.round(pw) + '×' + Math.round(ph) + ')');
  assert.ok(Math.abs(lw - pw) <= 12,
    '★★ 사진 방향에 따라 붓 크기가 달라집니다 (' + Math.round(lw) + ' vs ' + Math.round(pw) + ')');
});

test('★ 붓 굵기를 고를 수 있다', () => {
  const c = ed();
  c.setEdBrush(0); const thin = c.edBrushR();
  c.setEdBrush(2); const thick = c.edBrushR();
  assert.ok(thick > thin * 2, '★ 굵기가 사실상 안 바뀝니다');
});

test('★★ 지우개는 «칠한 것»을 지운다 — 사진을 지우는 것이 아니다', () => {
  const c = ed();
  c.edDown(at(.2, .2)); c.edUp();
  c.edDown(at(.8, .8)); c.edUp();
  c.setEdErase(true);
  c.edDown(at(.8, .8)); c.edUp();
  assert.equal(c.photoEd.strokes.length, 1, '★★ 칠한 것이 안 지워집니다');
  assert.equal(c.photoEd.strokes[0].pts[0].x, .2, '★★ 엉뚱한 것을 지웠습니다');
  assert.equal(c.photoEd.url, 'ORIG', '★★ 사진을 건드렸습니다 — 지우개는 칠한 것만 지웁니다');
});

test('★ 되돌리기·다 지우기', () => {
  const c = ed();
  c.edDown(at(.2, .2)); c.edUp();
  c.edDown(at(.8, .8)); c.edUp();
  c.edUndo();
  assert.equal(c.photoEd.strokes.length, 1);
  c.edClear();
  assert.equal(c.photoEd.strokes.length, 0);
});

test('★ 결과를 보고 있을 때는 더 못 칠한다 — 보낸 것과 상관없는 자국이 된다', () => {
  const c = ed();
  c.photoEd.done = { full: 'ERASED', before: 'ORIG', n: 1 };
  c.edDown(at(.2, .2));
  assert.equal(c.photoEd.strokes.length, 0);
});

/* ── ③ 칠한 모양 그대로 ── */

test('★★ 칠한 «모양 그대로» 보낸다 — 네모로 덮으면 멀쩡한 배경까지 지우라고 시킨다', () => {
  const fn = cutFn(APP, 'async function edRun(');
  assert.match(fn, /\{ shape: shape \}/,
    '★★ 모양을 안 보냅니다 — 의자에 걸린 옷 하나를 지우려는데 네모 안의 벽·바닥까지 새로 그려집니다');
  assert.match(cutFn(APP, 'function edShapeCanvas('), /edPaintTo\([\s\S]*?true\)/,
    '★ 보낼 모양을 «불투명»으로 안 그립니다 — 옅으면 모델이 지울 곳으로 안 봅니다');
  /* 자르기 층이 그 모양을 실제로 쓴다 */
  const cli = fs.readFileSync(path.join(R, 'js', 'pu-photo-edit.js'), 'utf8');
  assert.match(cli, /if \(opts\.shape\)/, '★★ 자르기 층이 모양을 안 받습니다');
  assert.match(cli, /globalCompositeOperation = 'source-in'/,
    '★ 칠한 자리에만 색을 남기는 길이 없습니다');
});

test('★ 화면에 보이는 것과 보내는 모양을 «한 함수»가 그린다', () => {
  /* 두 벌로 두면 화면에 보이는 자리와 실제로 지워지는 자리가 어긋난다.
     ⚠ 2026-08-29: 화면은 «테두리», 보내는 것은 «꽉 찬 것»으로 갈렸다. 그래도
     **자취를 그리는 붓질은 한 벌**(edBandPath)이어야 어긋나지 않는다 — 그것을 본다. */
  const paint = cutFn(APP, 'function edPaintTo(');
  assert.match(paint, /opaque/, '★ 한 함수가 둘 다 그리지 않습니다');
  assert.match(paint, /edBandPath\(/, '★★ 자취를 그리는 붓질이 두 벌입니다 — 어긋납니다');
  assert.match(cutFn(APP, 'function edBandPath('), /photoEd && photoEd\.strokes/);
  assert.match(cutFn(APP, 'function edRepaint('), /edPaintTo\(/);
  assert.match(cutFn(APP, 'function edShapeCanvas('), /edPaintTo\(/);
});

/* ── ④ 군데마다 한 번 ── */

test('★★ 군데마다 한 번씩 부르고, 그 수를 «먼저 말하고» 묻는다', () => {
  const fn = cutFn(APP, 'async function edRun(');
  assert.match(fn, /for \(let i = 0; i < areas\.length; i\+\+\)/, '★★ 한 번만 부릅니다');
  assert.match(fn, /요금이 ' \+ areas\.length \+ '번/,
    '★★ 몇 번 요금이 드는지 안 말하고 묻습니다');
  assert.match(fn, /confirm\(/, '★★ 안 묻고 부르면 잘못 눌러도 그대로 요금입니다');
  /* 한 군데가 실패해도 나머지는 살린다 */
  assert.match(fn, /failed\+\+/, '★ 하나가 실패하면 다섯을 다 잃습니다');
});

test('★ 몇 군데인지 화면이 늘 말한다 — 요금을 누르기 전에 알아야 한다', () => {
  const fn = cutFn(APP, 'function edPanelHtml(');
  /* ⚠ 2026-08-29 부터 「지우기」가 아니라 «고치기»다 — 한글로 무엇을 할지 시킬 수
     있게 되었다(대표 지시 "지울곳이 아니라 편집할 곳으로"). 지키는 뜻은 그대로:
     **누르기 전에 몇 번 요금이 드는지 안다.** */
  assert.match(fn, /n \+ '군데 고치기 \(요금 ' \+ n \+ '번\)'/,
    '★ 단추에 몇 번 요금이 드는지 안 적혀 있습니다');
  assert.match(fn, /칠한 곳 없음/, '★ 아무것도 안 칠했을 때를 안 알려 줍니다');
});

/* ── ⑤ 원본은 그대로 ── */

test('★★ 원본을 «안 덮는다» — 새 사진으로 담는다 (대표 지시 2026-08-29)', () => {
  const fn = cutFn(APP, 'async function edKeep(');
  assert.match(fn, /PuPhotoStore\.newId\(\)/, '★★ 새 자리를 안 만듭니다');
  assert.match(fn, /PuPhotoStore\.savePhoto\(/, '★★ 새 사진으로 안 담습니다');
  assert.ok(fn.indexOf('replaceImage') < 0,
    '★★ 아직 원본을 덮어씁니다 — 증빙 사진에서 원본이 사라지면 되돌릴 길이 없습니다');
  assert.match(fn, /editedFrom: photoEd\.id/, '★ 어느 사진에서 나왔는지 안 적습니다');
});

test('★ 사본의 «실제» 크기를 적는다', () => {
  const fn = cutFn(APP, 'async function edKeep(');
  assert.match(fn, /w: size\.w, h: size\.h/,
    '★ 사본의 크기를 안 적으면 「원본이 작습니다」 판정이 사본을 못 잽니다');
});

/* ── 물려받는 것과 «떼는» 것 ──────────────────────────────────────────
   이어받는 쪽이 옳다(찍은 날·종류·판독 결과) — 계약서처럼 «민감»으로 밝혀진 것은
   사본도 민감해야 한다. 떼는 것은 **「이 사진이 무엇을 겪었나」의 기록**이다.
   새 사진은 아직 아무것도 안 겪었는데, 물려받으면 겪은 척이 된다.
   ⚠ 이 자리가 이 일에서 가장 «조용히» 틀리는 곳이다 — 화면에 아무 표시가 없고,
     보유기간·공유·묶음 쪽수에서 나중에 드러난다. */
function copyMeta(srcMeta) {
  const ctx = { Object: Object };
  vm.createContext(ctx);
  vm.runInContext(cutFn(APP, 'function edCopyMeta('), ctx);
  return ctx.edCopyMeta(srcMeta);
}

test('★★ 물려받는 것 — 안 이어받으면 사본만 «아무나» 볼 수 있게 된다', () => {
  const m = copyMeta({ at: 111, kind: 'doc', company: '가야', note: '실태조사',
    read: { kind: 'contract', secret: true, fields: { a: 1 } } });
  assert.equal(m.at, 111, '★★ 찍은 날을 떼면 사본이 딴 날에 담겨 못 찾습니다');
  assert.equal(m.kind, 'doc');
  assert.equal(m.company, '가야');
  assert.equal(m.note, '실태조사');
  assert.equal(m.read.secret, true,
    '★★ 계약서처럼 «민감»으로 밝혀진 것은 사본도 민감해야 합니다 — 떼면 사본만 열립니다');
  assert.deepEqual(m.read.fields, { a: 1 }, '★ 판독 값까지 떼면 사본을 다시 판독해야 합니다');
});

test('★★ 떼는 것 — 새 사진은 아직 아무것도 «안 겪었다»', () => {
  const src = {
    at: 111,
    used: { at: 1, where: '일자리도약장려금' },
    doc: { group: 'g1', page: 2, taken: 3, collecting: true },
    shareWith: { U2: true }, shareBy: { U2: '권형하' },
    read: { kind: 'bizreg', secret: false,
      filed: { id: 'c1', at: 5 }, filedError: '어쩌고',
      filedInfo: { at: 5, by: '권형하' }, filedInfoError: '어쩌고',
      filedCo: { at: 5, filled: true }, filedCoError: '어쩌고' }
  };
  const m = copyMeta(src);
  assert.equal(m.used, undefined,
    '★★ used 가 **보유기준을 정합니다**(증빙 5년/나머지 1년).\n' +
    '  안 쓴 사본이 증빙으로 잡혀 5년을 남고, 쓰지도 않은 사업 이름이 화면에 뜹니다');
  assert.equal(m.doc, undefined,
    '★★ 사본이 같은 묶음에 같은 쪽 번호로 끼어 「모으는 중」이 안 끝나고 쪽수가 어긋납니다');
  assert.equal(m.shareWith, undefined,
    '★★ 원본에 걸린 공유입니다 — 물려받으면 새 사진이 «말없이» 남에게 열립니다');
  assert.equal(m.shareBy, undefined);
  ['filed', 'filedError', 'filedInfo', 'filedInfoError', 'filedCo', 'filedCoError']
    .forEach(function (k) {
      assert.equal(m.read[k], undefined,
        '★★ read.' + k + ' 는 «보냈다는 표»입니다 — 사본은 아직 아무 데도 안 갔는데\n' +
        '  보낸 날짜와 보낸 사람이 찍혀 나옵니다');
    });
  assert.equal(m.read.kind, 'bizreg', '★ 보낸 표만 떼야지 판독까지 떼면 안 됩니다');
});

test('★★ 떼면서 «원본을 안 건드린다» — 원본에서 보낸 표가 사라진다', () => {
  const read = { kind: 'bizreg', filed: { id: 'c1' } };
  const src = { read: read, used: { at: 1 } };
  copyMeta(src);
  assert.deepEqual(src.used, { at: 1 }, '★★ 원본 meta 를 그 자리에서 고쳤습니다');
  assert.deepEqual(read.filed, { id: 'c1' },
    '★★ 원본의 read 를 그 자리에서 고쳤습니다 — 원본이 「안 보낸 것」이 되어 두 번 갑니다');
});

/* 저장하는 걸음을 «실제로» 돌린다 — 읽어서 보는 것으로는 다음 둘을 못 잡는다 */
function keeper(over) {
  const saved = [];
  const said = [];
  const ctx = {
    console: { warn: function () {} },
    photoEd: { status: 'ready', id: 'p1', url: 'ORIG', strokes: [], brush: 1, erasing: false,
      done: { full: 'ERASED', before: 'ORIG', n: 2 } },
    /* 원본에는 «겪은 기록»이 붙어 있다 — 사본이 그대로 물려받으면 안 된다 */
    gridItems: [{ id: 'p1', full: 'ORIG', thumb: 'ORIG_T',
      meta: { w: 2000, h: 1500, at: 111, used: { at: 1, where: '일자리도약장려금' },
        doc: { group: 'g1', page: 2 }, shareWith: { U2: true } } }],
    PuPhotoStore: {
      newId: function () { return 'p2'; },
      savePhoto: function (p) { saved.push(p); return Promise.resolve(); }
    },
    document: { querySelector: function () { return null; } },
    $: function () { return { src: '', style: {} }; },
    shrinkDataUrl: function (s) { return Promise.resolve(s + '_T'); },
    imgSize: function () { return Promise.resolve({ w: 1900, h: 1400 }); },
    toast: function (m) { said.push(m); }, alert: function (m) { said.push(m); },
    maskItem: function () { return null; },
    renderReadPanel: function () {}, renderViewerEdit: function () {}, renderGrid: function () {},
    Object: Object, Date: Date, Promise: Promise, Error: Error
  };
  ctx.globalThis = ctx;
  Object.assign(ctx, over || {});
  vm.createContext(ctx);
  vm.runInContext(cutFn(APP, 'function edCopyMeta('), ctx);
  vm.runInContext(cutFn(APP, 'async function edKeep('), ctx);
  ctx._saved = saved; ctx._said = said;
  return ctx;
}

test('★★ 저장이 실패해도 «지운 그림을 안 버린다» — 요금을 치른 결과다', async () => {
  const c = keeper({ PuPhotoStore: {
    newId: function () { return 'p2'; },
    savePhoto: function () { return Promise.reject(new Error('네트워크')); } } });
  await c.edKeep();
  assert.ok(c.photoEd && c.photoEd.done && c.photoEd.done.full === 'ERASED',
    '★★ 실패했다고 지운 그림을 버리면 요금을 다시 치러야 합니다');
  assert.ok(c._said.some(function (m) { return /저장하지 못했습니다/.test(m); }),
    '★★ 조용히 넘어가면 담긴 줄 아십니다');
  assert.ok(c._said.some(function (m) { return /그대로 있습니다/.test(m); }),
    '★ 다시 누르면 된다는 것을 안 알리면 창을 닫아 잃으십니다');
});

test('★★ 저장을 누르면 그때 «새 사진»으로 담는다 — 원본은 손대지 않는다', async () => {
  const c = keeper();
  await c.edKeep();
  assert.equal(c._saved.length, 1);
  assert.equal(c._saved[0].id, 'p2', '★★ 원본 자리에 덮어씁니다');
  assert.equal(c._saved[0].full, 'ERASED');
  assert.equal(c._saved[0].thumb, 'ERASED_T', '★★ 미리보기를 고친 사진에서 다시 안 만듭니다');
  assert.equal(c._saved[0].meta.editedFrom, 'p1');
  assert.equal(c._saved[0].meta.at, 111, '★★ 찍은 날을 안 이어받으면 사본이 딴 날에 담깁니다');
  assert.equal(c._saved[0].meta.w, 1900, '★ 사본의 «실제» 크기를 적어야 합니다');
  /* ⚠ 「떼는 규칙」을 담는 걸음이 **실제로 부르는지** — 규칙만 있고 안 부르면 소용없다 */
  assert.equal(c._saved[0].meta.used, undefined,
    '★★ 담는 걸음이 edCopyMeta 를 안 부릅니다 — 안 쓴 사본이 증빙으로 잡혀 5년을 남습니다');
  assert.equal(c._saved[0].meta.doc, undefined);
  assert.equal(c._saved[0].meta.shareWith, undefined,
    '★★ 새 사진이 «말없이» 남에게 열립니다');
  assert.deepEqual(c.gridItems.find(function (x) { return x.id === 'p1'; }).meta.used,
    { at: 1, where: '일자리도약장려금' }, '★★ 원본의 기록을 그 자리에서 지웠습니다');
  assert.equal(c.gridItems.find(function (x) { return x.id === 'p1'; }).full, 'ORIG',
    '★★ 원본이 바뀌었습니다');
  assert.equal(c.gridItems[0].id, 'p2', '★ 새 사진이 목록 맨 앞에 안 옵니다');
  assert.equal(c.photoEd, null, '★ 담은 뒤에도 편집기가 남으면 다음 사진에 얹힙니다');
});

test('★★ 지운 결과를 «저장 전에» 보여 준다 — 그 걸음은 그대로 지킨다', () => {
  const fn = cutFn(APP, 'async function edRun(');
  ['savePhoto', 'replaceImage', 'edKeep'].forEach(function (w) {
    assert.ok(fn.indexOf(w) < 0,
      '★★ 지우자마자 저장합니다(' + w + ') — 보고 고르실 틈이 없습니다');
  });
  assert.match(fn, /photoEd\.done = \{/, '★★ 결과를 안 들고 있습니다');
  const p = cutFn(APP, 'function edPanelHtml(');
  ['새 사진으로 저장', '버리기', '고치기 전 보기'].forEach(function (t) {
    assert.ok(p.indexOf(t) >= 0, '★ 「' + t + '」가 없습니다');
  });
  assert.match(p, /원본은 그대로 둡니다/, '★ 원본이 남는다는 것을 안 알려 줍니다');
});

test('★ 버리면 칠한 것은 남는다 — 다시 지울 수 있게', () => {
  const fn = cutFn(APP, 'function edDrop(');
  assert.match(fn, /photoEd\.done = null;/);
  assert.ok(fn.indexOf('strokes = []') < 0, '★ 칠한 것까지 지우면 처음부터 다시 칠해야 합니다');
  /* 버릴 때 사진에는 손대지 않는다 */
  assert.ok(fn.indexOf('savePhoto') < 0 && fn.indexOf('replaceImage') < 0,
    '★★ 버리는 길에서 저장합니다');
});

test('★ 눌러서 «고치기 전»을 본다 — 실제로 돌려 본다', () => {
  const el = { src: '' };
  const ctx = { photoEd: { done: { full: 'ERASED', before: 'ORIG' } }, $: function () { return el; } };
  vm.createContext(ctx);
  vm.runInContext(cutFn(APP, 'function edPeek('), ctx);
  ctx.edPeek(true);
  assert.equal(el.src, 'ORIG');
  ctx.edPeek(false);
  assert.equal(el.src, 'ERASED', '★ 떼도 옛 그림이 남으면 무엇을 저장하는지 모릅니다');
  /* 끌다가 단추 밖에서 떼는 길도 있어야 한다 */
  const btn = APP.match(/onpointerdown="edPeek\(true\)"[\s\S]{0,180}?>/)[0];
  assert.match(btn, /onpointerleave="edPeek\(false\)"/,
    '★ 단추 밖에서 떼면 옛 그림이 그대로 남습니다');
});

test('★★ 「한 번 더」를 안 만든다 — 다시 부르는 것이 곧 요금이다', () => {
  const p = cutFn(APP, 'function edPanelHtml(');
  const done = p.slice(p.indexOf('if (e.done)'), p.indexOf('if (e.busy)'));
  assert.ok(done.indexOf('edRun(') < 0,
    '★★ 결과 화면에 다시 부르는 단추가 있습니다 — 누를 때마다 요금이 또 듭니다');
});

test('★★ 결과를 보고 있는 동안에는 또 안 부른다', () => {
  assert.match(cutFn(APP, 'async function edRun('),
    /if \(!photoEd \|\| photoEd\.status !== 'ready' \|\| photoEd\.done\) return;/,
    '★★ 결과를 보는 중에 또 부르면 그대로 두 배가 나갑니다');
});

test('★★ 창을 닫거나 다른 사진으로 가면 편집기를 비운다', () => {
  /* ⚠ 안 비우면 **앞 사진에 칠한 것**이 다음 사진에 얹히고, 저장하면 엉뚱한 사진에서
     나온 그림이 «새 사진»으로 담긴다 — 가리기와 같은 병인데 결과가 더 나쁘다. */
  assert.match(cutFn(APP, 'function closeViewer('), /photoEd = null/,
    '★★ 창을 닫아도 편집기가 남습니다');
  assert.match(cutFn(APP, 'function photoEdCancel('), /photoEd = null/);
  assert.match(cutFn(APP, 'async function edKeep('), /photoEd = null/,
    '★★ 담은 뒤에도 편집기가 남으면 다음 사진에 얹힙니다');
});

test('★ 부르는 층을 «한 이름»으로 찾는다 — 두 이름이면 한쪽만 고쳐진다', () => {
  /* 브라우저에서는 window.X 와 맨 X 가 같지만, 검사·다른 세상에서는 갈린다.
     실제로 이 검사를 쓰다가 「막는 곳은 window, 부르는 곳은 맨 이름」이라 헛돌았다. */
  const fn = cutFn(APP, 'async function edRun(');
  assert.ok(fn.indexOf('window.PuPhotoEdit') > 0, '막는 곳과 부르는 곳이 갈렸습니다');
  assert.ok(!/[^.]\bPuPhotoEdit\./.test(fn.replace(/window\.PuPhotoEdit\./g, 'window.OK.')),
    '★ 아직 맨 이름으로 부르는 자리가 있습니다');
  assert.match(cutFn(APP, 'function edAreas('), /window\.PuPhotoPaint\.areas/);
});

/* ── 칸과 사진이 같은 자리인가 (08-29 에 겪은 그 병) ── */

test('★★ 칠하는 판이 사진과 «똑같은 자리»다 — 어긋나면 칠한 곳과 지워지는 곳이 다르다', () => {
  const css = APP.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.edwrap\{[^}]*height:100%/,
    '★★ 칸 높이가 auto 면 사진의 100% 가 «없는 것»이 됩니다(2026-08-29 그 사고)');
  assert.match(css, /\.edwrap img\{[^}]*width:100%;height:100%/, '★★ 사진이 칸을 안 채웁니다');
  assert.ok(!/\.edwrap img\{[^}]*max-height:\s*\d+%/.test(css),
    '★★ 백분율 max-height 가 돌아왔습니다 — 어미 높이가 auto 면 없는 것이 됩니다');
  assert.match(css, /\.edwrap canvas\{[^}]*inset:0[^}]*width:100%;height:100%/,
    '★★ 칠하는 판이 사진을 그대로 덮지 않습니다');
  assert.match(cutFn(APP, 'function edFitWrap('), /aspectRatio = im\.naturalWidth/,
    '★★ 칸에 사진의 본디 비를 안 박습니다');
});
