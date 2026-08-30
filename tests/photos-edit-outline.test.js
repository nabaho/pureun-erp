/* 선으로 표시 · 붓 커서 · 요금 없이 가리는 길 (대표 지시 2026-08-29)

   "마우스 포인트 좀다양하게 해라 그리고 선으로 먼저 표시하게 한다.
    그릭 스마트폰에서는 무료로 자동으로 사진을 변경가능한데 왜 여기는 비용을 내야하나 …
    가급적 무료로 사용하고 싶은데"

   ■ ① 선으로 먼저
   꽉 찬 주황 덩어리로 덮으면 **지우려는 그것이 안 보인다.** 벽시계를 덮어 놓고
   「다 덮였나」를 볼 수가 없다(대표 캡처가 정확히 그 화면이었다).
   → 화면에는 **테두리 선 + 아주 옅은 속**. 밑이 비친다.
   ⚠⚠ **AI 에게 보내는 모양은 그대로 «꽉 찬» 것**이다 — 테두리만 보내면 그 자리를
     안 지운다. 둘이 «같은 자취»에서 나오되 모양만 다르다. 이 검사의 심장이 여기다.
   (실측: 꽉 찬 모양의 진한 화소 비율 200px 89.6% · 800px 97.3% · 2000px 98.7% —
    모자란 것은 가장자리를 부드럽게 그린 탓이고 속은 꽉 차 있다.)

   ■ ② 붓 커서
   굵기가 얼마인지는 커서로 봐야 안다. 그리고 **도구마다 달라야** 지금 무엇을 쥐고
   있는지 손끝에서 안다(2026-08-29 「지우개에 갇힌」 사고의 뒷마무리).

   ■ ③ 요금 없이 가리는 길
   AI 지우기는 한 군데 약 54원이다(구글이 이 모델에 **무료 한도를 안 준다** —
   2026-08-29 확인: $0.039/장, 무료 등급 없음). 그런데 «가리기만 하면 되는» 일이 많다.
   → 속을 채운 네모·동그라미로 **요금 없이** 끝낸다. 그 길을 화면이 일러 준다. */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* 붓 그리기를 «실제로» 돌려 무엇이 찍히는지 센다 */
function painter(over) {
  const calls = [];
  function fakeCtx(tag) {
    const c = {
      _tag: tag, canvas: { ownerDocument: null },
      beginPath: function () {}, moveTo: function () {}, lineTo: function () {},
      arc: function () {}, save: function () {}, restore: function () {},
      setLineDash: function (d) { calls.push([tag, 'dash', String(d)]); },
      stroke: function () { calls.push([tag, 'stroke', c.strokeStyle, c.lineWidth, c.globalCompositeOperation]); },
      fill: function () { calls.push([tag, 'fill', c.fillStyle]); },
      drawImage: function () { calls.push([tag, 'drawImage']); },
      strokeStyle: '', fillStyle: '', lineWidth: 0, lineCap: '', lineJoin: '',
      globalCompositeOperation: 'source-over'
    };
    return c;
  }
  const ctx = Object.assign({
    photoEd: { strokes: [{ pts: [{ x: .3, y: .3 }, { x: .5, y: .4 }], r: .05 }],
      brush: 2, erasing: false, hover: null },
    ED_BRUSH: JSON.parse(APP.match(/const ED_BRUSH = (\[[^\]]*\]);/)[1]),
    document: { createElement: function () {
      return { width: 0, height: 0, getContext: function () { return fakeCtx('숨은판'); } }; } },
    Math: Math, Number: Number, String: String
  }, over || {});
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(cutFn(APP, 'function edBandPath(') + '\n' + cutFn(APP, 'function edPaintTo(') + '\n' +
    cutFn(APP, 'function edBrushR(') + '\n' + cutFn(APP, 'function edDrawCursor('), ctx);
  ctx._calls = calls;
  ctx._ctx = fakeCtx('화면');
  return ctx;
}

/* ── ① 선으로 먼저 ── */

test('★★ 화면에는 «테두리 선»으로 그린다 — 꽉 채우면 지우려는 그것이 안 보인다', () => {
  const c = painter();
  c.edPaintTo(c._ctx, 400, 300, false);
  const colors = c._calls.filter(function (x) { return x[1] === 'stroke'; })
    .map(function (x) { return String(x[2]); });
  /* 옅은 속이 있어야 «어디를 칠했는지»는 보인다 */
  assert.ok(colors.some(function (s) { return /rgba\(249,115,22,\.1\d\)/.test(s); }),
    '★★ 속이 아직 진합니다 — 밑이 안 비칩니다 (지금 색: ' + colors.join(' / ') + ')');
  assert.ok(!colors.some(function (s) { return /rgba\(249,115,22,\.4/.test(s); }),
    '★★ 예전의 «꽉 찬 덩어리» 색이 남아 있습니다');
  /* 테두리는 「굵게 칠한 뒤 안쪽을 파내는」 방법으로 만든다 */
  const punch = c._calls.filter(function (x) { return x[4] === 'destination-out'; });
  assert.ok(punch.length > 0,
    '★★ 안쪽을 파내지 않습니다 — 테두리가 아니라 또 하나의 덩어리가 됩니다');
  /* ⚠ 파내는 붓이 «더 가늘어야» 테두리가 남는다. 같은 굵기로 파내면 아무것도 안 남고
     화면이 텅 빈다 — 「어디를 칠했는지」를 통째로 잃는다(돌연변이에서 살아남던 자리). */
  const outer = c._calls.filter(function (x) {
    return x[0] === '숨은판' && x[1] === 'stroke' && x[4] !== 'destination-out'; });
  assert.ok(outer.length && punch[0][3] < outer[0][3],
    '★★ 파내는 붓이 더 가늘지 않습니다 — 테두리가 통째로 사라집니다 (' +
    (outer[0] || [])[3] + ' → ' + punch[0][3] + ')');
  assert.ok(c._calls.some(function (x) { return x[1] === 'drawImage'; }),
    '★ 따로 그린 테두리를 화면에 안 올립니다');
});

test('★★ AI 에게 보내는 모양은 «꽉 찬» 것이다 — 테두리만 보내면 안 지운다', () => {
  const c = painter();
  c.edPaintTo(c._ctx, 400, 300, true);
  const colors = c._calls.map(function (x) { return String(x[2]); });
  assert.ok(colors.some(function (s) { return s === '#fff'; }), '★★ 꽉 찬 흰색이 아닙니다');
  assert.ok(!c._calls.some(function (x) { return x[4] === 'destination-out'; }),
    '★★ 보내는 모양에서도 안쪽을 파냅니다 — 그 자리를 안 지웁니다');
  assert.ok(!c._calls.some(function (x) { return x[1] === 'drawImage'; }),
    '★ 보내는 모양에 테두리 판을 얹습니다');
});

test('★ 화면용과 보내는 것이 «같은 자취»에서 나온다 — 두 벌이면 어긋난다', () => {
  const band = cutFn(APP, 'function edBandPath(');
  assert.match(band, /photoEd && photoEd\.strokes/, '★ 자취를 안 봅니다');
  const paint = cutFn(APP, 'function edPaintTo(');
  assert.ok((paint.match(/edBandPath\(/g) || []).length >= 3,
    '★ 한 자취에서 «꽉 찬 것»과 «테두리»를 함께 만들지 않습니다');
  assert.match(cutFn(APP, 'function edShapeCanvas('), /edPaintTo\([\s\S]*?true\)/,
    '★★ 보낼 모양을 꽉 찬 것으로 안 만듭니다');
});

/* ── ② 붓 커서 ── */

test('★★ 붓 굵기가 «커서 동그라미»로 보인다 — 커서 모양만으로는 굵기를 모른다', () => {
  const c = painter({ photoEd: { strokes: [], brush: 2, erasing: false, hover: { x: .5, y: .5 } } });
  c.edDrawCursor(c._ctx, 400, 300);
  const drew = c._calls.filter(function (x) { return x[0] === '화면'; });
  assert.ok(drew.length >= 2, '★★ 커서를 안 그립니다');
  assert.ok(drew.some(function (x) { return x[2] === '#f97316'; }),
    '★ 칠하기일 때 주황이 아닙니다');
  assert.ok(!drew.some(function (x) { return x[1] === 'dash'; }),
    '★ 칠하기인데 점선입니다 — 지우개와 안 갈립니다');
});

test('★★ 도구마다 커서가 «다르다» — 지금 무엇을 쥐고 있는지 손끝에서 안다', () => {
  const c = painter({ photoEd: { strokes: [], brush: 1, erasing: true, hover: { x: .5, y: .5 } } });
  c.edDrawCursor(c._ctx, 400, 300);
  const drew = c._calls.filter(function (x) { return x[0] === '화면'; });
  assert.ok(drew.some(function (x) { return x[1] === 'dash'; }),
    '★★ 지우개인데 칠하기와 똑같이 보입니다 — 갇혔는지 알 길이 없습니다');
  assert.ok(drew.some(function (x) { return x[2] === '#64748b' || x[2] === '#64748b'; }),
    '★ 지우개 색이 안 갈립니다');
  /* 꾸밈에서도 갈라 둔다 */
  const css = APP.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.edwrap\.mode-ai canvas\{cursor:crosshair\}/);
  assert.match(css, /\.edwrap\.mode-erase canvas\{cursor:cell\}/, '★ 지우개 커서가 안 갈립니다');
});

test('★ 손이 판 밖으로 나가면 커서를 지운다 — 남아 있으면 유령이 된다', () => {
  const c = painter({ photoEd: { strokes: [], brush: 1, erasing: false, hover: null } });
  c.edDrawCursor(c._ctx, 400, 300);
  assert.deepEqual(c._calls.filter(function (x) { return x[0] === '화면'; }), []);
  assert.match(cutFn(APP, 'function edHoverOut('), /photoEd\.hover = null/);
  assert.match(APP, /onpointerleave="edHoverOut\(\)"/, '★ 판을 벗어나는 것을 안 받습니다');
});

test('★★ 그리지 «않을 때»도 커서가 따라온다 — 굵기를 보고 고르려면 있어야 한다', () => {
  assert.match(APP, /onpointermove="edMove\(event\);edHover\(event\)"/,
    '★★ 누르고 있을 때만 따라옵니다 — 굵기를 미리 볼 수가 없습니다');
  assert.match(cutFn(APP, 'function edRepaint('), /edDrawCursor\(ctx, w, h\)/,
    '★★ 다시 그릴 때 커서를 안 그립니다');
  /* 굵기를 바꾸면 그 자리에서 커진다 */
  assert.match(cutFn(APP, 'function setEdBrush('), /edRepaint\(\)/,
    '★ 굵기를 바꿔도 커서가 그대로입니다 — 골라 보고 정할 수가 없습니다');
  assert.match(cutFn(APP, 'function setEdErase('), /edRepaint\(\)/,
    '★ 도구를 바꿔도 커서가 그대로입니다');
});

/* ── ③ 요금 없이 가리는 길 ── */

test('★★ 속을 채운 도형으로 «요금 없이» 가릴 수 있다', () => {
  const add = cutFn(APP, 'function edMarkAdd(');
  assert.match(add, /fill: edMarkFill\(\) \? c : 'transparent'/,
    '★★ 속을 채울 길이 없습니다 — 가리려면 늘 요금을 내야 합니다');
  const p = cutFn(APP, 'function edPanelHtml(');
  assert.match(p, /■ 속 채움/, '★ 속을 채우는 단추가 없습니다');
  assert.match(p, /요금 없이 가려집니다/, '★ 요금이 안 든다는 것을 안 알려 줍니다');
  assert.match(p, /덮는 것이라 자국이 남습니다/,
    '★★ 지우는 것과 다르다는 것을 안 말하면 「지운 줄」 아십니다');
});

test('★★ 요금이 드는 화면에서 «요금 없이 하는 길»을 일러 준다', () => {
  const p = cutFn(APP, 'function edPanelHtml(');
  assert.match(p, /요금 없이 하려면/, '★★ 왜 돈이 드는지만 말하고 길은 안 알려 줍니다');
  assert.match(p, /「■ 속 채움」 네모를 덮으세요/, '★ 이 화면 안에서 되는 길을 안 알려 줍니다');
  assert.match(p, /공유 → 푸른사진첩/,
    '★★ 폰에서 고쳐 보내는 길을 안 알려 줍니다 — 그게 진짜 0원입니다');
  /* 얼마인지 숫자로 말한다 — 「요금이 듭니다」만으로는 크기를 모른다 */
  assert.match(p, /한 군데 약 50원/, '★ 얼마인지 안 적으면 크고 작음을 못 잽니다');
});

test('★ 골라 둔 도형의 속도 함께 바뀐다 — 넣고 나서 「채워」가 자연스럽다', () => {
  const fn = cutFn(APP, 'function setEdMarkFill(');
  assert.match(fn, /o\.type === 'rect' \|\| o\.type === 'ellipse'/,
    '★ 글자에까지 속을 채우려 듭니다');
  assert.match(fn, /o\.set\('fill', photoEd\.mfill \? edMarkColor\(\) : 'transparent'\)/);
  /* 색을 바꿔도 채운 속이 따라온다 */
  assert.match(cutFn(APP, 'function setEdMarkColor('),
    /if \(edMarkFill\(\) && \(o\.type === 'rect' \|\| o\.type === 'ellipse'\)\) o\.set\('fill', c\)/,
    '★ 색만 바뀌고 채운 속은 옛 색으로 남습니다');
});
