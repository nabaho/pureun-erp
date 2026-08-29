/* 「마우스가 전혀 작동 안 한다」 — 도구를 모른 채 갇히지 않게
   (대표 보고 2026-08-29: "마우스 전혀 작도안한다 시계지우려고 하는데 어떤 동표시도 안나온다")

   ■ 무엇이었나 — 코드는 멀쩡했다
   실제로 그어 보니 자취 1개·점 3개·화소 3,614개가 그려졌다. 캔버스도 제대로 잡혔다
   (elementFromPoint 로 재 봄). **켜져 있던 것은 「🧽 칠한 것 지우기」였다.**

   ★ 뿌리: 시계를 «지우려고» 그 단추를 누르신 것이다. 그런데 그것은 사진이 아니라
     **칠한 표시**를 지우는 도구다. 켜 두면 아무리 그어도 아무 일이 없고,
     **화면은 왜 안 되는지 한 마디도 안 했다.** 그러면 마우스가 고장 난 것처럼 보인다.

   ■ 고침 넷 — 「갇힐 수 없게」가 기준이다
     ① 두 갈래를 **모드로 나란히**(✏️ 칠하기 / 🧽 지우개) — 어느 쪽인지 늘 보인다
     ② 칠한 것이 없으면 지우개를 **못 켠다** — 처음부터 갇힐 수가 없다
     ③ 지우개일 때 **무엇을 지우는 도구인지** 그 자리에 적는다
     ④ 지우개로 그었는데 아무것도 안 지워지면 **그 사실을 말한다**

   ⚠ 이 검사가 지키는 것은 「그려지는가」가 아니라 **「막혔을 때 그 까닭을 아는가」**다. */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

function box() {
  const said = [];
  const el = {};
  const ctx = {
    photoEd: null, edDrag: null, window: {},
    ED_BRUSH: JSON.parse(APP.match(/const ED_BRUSH = (\[[^\]]*\]);/)[1]),
    toast: function (m) { said.push(m); },
    renderReadPanel: function () {}, maskItem: function () { return null; },
    esc: function (s) { return String(s); },
    $: function (id) {
      return el[id] || (el[id] = {
        width: 0, height: 0, style: {},
        getBoundingClientRect: function () { return { left: 0, top: 0, width: 800, height: 600 }; },
        getContext: function () {
          return { clearRect: function () {}, beginPath: function () {}, moveTo: function () {},
            lineTo: function () {}, stroke: function () {}, arc: function () {}, fill: function () {},
            set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {},
            set lineCap(v) {}, set lineJoin(v) {} };
        }
      });
    },
    Math: Math, Object: Object, String: String, Number: Number, Uint8Array: Uint8Array, JSON: JSON
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  /* ⚠ 이 층은 window 가 있으면 window 에 붙는다 — 덮어쓰면 통째로 사라진다 */
  vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-photo-paint.js'), 'utf8'), ctx);
  ['function edBrushR(', 'function setEdBrush(', 'function setEdErase(', 'function edUndo(',
   'function edClear(', 'function edPoint(', 'function edDown(', 'function edMove(',
   'function edUp(', 'function edEraseAt(', 'function edPaintTo(', 'function edRepaint(',
   'function edAreas(', 'function edPanelHtml('].forEach(function (n) {
    vm.runInContext(cutFn(APP, n), ctx);
  });
  ctx.photoEd = { status: 'ready', id: 'p1', url: 'ORIG', strokes: [], brush: 1, erasing: false, done: null };
  ctx._said = said;
  return ctx;
}
function at(x, y) {
  return { clientX: x * 800, clientY: y * 600, preventDefault: function () {},
    currentTarget: { setPointerCapture: function () {} } };
}
function draw(c, x, y) { c.edDown(at(x, y)); c.edMove(at(x + .04, y + .02)); c.edUp(); }

/* ── ② 처음부터 갇힐 수 없다 ── */

test('★★ 칠한 것이 없으면 지우개를 «못 켠다» — 그 자리가 곧 「마우스가 안 먹는」 자리다', () => {
  const c = box();
  c.setEdErase(true);
  assert.equal(c.photoEd.erasing, false,
    '★★ 아무것도 안 칠한 채 지우개로 갈 수 있습니다 — 그러면 아무리 그어도 아무 일이 없고\n' +
    '  사람은 마우스가 고장 난 줄 압니다(2026-08-29 대표 보고).');
  assert.ok(c._said.some(function (m) { return /먼저 고칠 곳을 칠해/.test(m); }),
    '★★ 왜 안 되는지 말해 주지 않습니다');
  /* 그리고 그으면 그려져야 한다 */
  draw(c, .5, .3);
  assert.equal(c.photoEd.strokes.length, 1, '★★ 막아 놓고 칠하기까지 안 됩니다');
});

test('★ 칠한 뒤에는 지우개를 쓸 수 있다 — 막기만 하면 도구를 잃는다', () => {
  const c = box();
  draw(c, .2, .2);
  draw(c, .8, .8);
  c.setEdErase(true);
  assert.equal(c.photoEd.erasing, true, '★ 칠했는데도 지우개를 못 씁니다');
  c.edDown(at(.8, .8)); c.edUp();
  assert.equal(c.photoEd.strokes.length, 1, '★ 지우개가 안 지웁니다');
});

test('★★ 「✏️ 칠하기」를 누르면 «반드시» 칠하기로 돌아온다 — 빠져나갈 길이다', () => {
  /* ⚠ 나가는 길이 막히면 그때부터가 진짜 갇힌 것이다. 되돌림에서 이 자리가 새어 나갔다. */
  const c = box();
  draw(c, .3, .3);
  c.setEdErase(true);
  assert.equal(c.photoEd.erasing, true);
  c.setEdErase(false);
  assert.equal(c.photoEd.erasing, false,
    '★★ 「✏️ 칠하기」를 눌러도 지우개에서 못 빠져나옵니다 — 그때부터 정말 갇힙니다');
  /* 그리고 그으면 그려져야 한다 */
  const n = c.photoEd.strokes.length;
  draw(c, .6, .6);
  assert.equal(c.photoEd.strokes.length, n + 1, '★★ 돌아왔는데도 안 그려집니다');
});

/* ── ④ 헛일이면 그 사실을 말한다 ── */

test('★★ 지우개로 «빈 곳»을 그으면 왜 아무 일이 없는지 말한다', () => {
  const c = box();
  draw(c, .2, .2);
  c.setEdErase(true);
  c._said.length = 0;
  c.edDown(at(.9, .9)); c.edMove(at(.92, .9)); c.edUp();
  assert.ok(c._said.some(function (m) { return /칠한 표시/.test(m) && /칠하기/.test(m); }),
    '★★ 아무 말이 없으면 「마우스가 고장 났다」로 읽힙니다');
});

test('★★ 지웠으면 «헛말을 안 한다» — 아무 때나 말하면 그 말을 안 믿는다', () => {
  const c = box();
  draw(c, .3, .3);
  c.setEdErase(true);
  c._said.length = 0;
  c.edDown(at(.3, .3)); c.edUp();          // 칠한 자리를 정확히 눌렀다
  assert.equal(c.photoEd.strokes.length, 0, '지워져야 합니다');
  assert.deepEqual(c._said, [], '★★ 지웠는데도 「안 지워졌다」고 말합니다');
});

test('★★ 자취표를 «먼저» 만든다 — 지우고 나서 만들면 지웠다는 표시가 덮인다', () => {
  /* 실제로 이 차례가 뒤바뀌어 있었고, 한 번 눌러 지울 때마다 헛말이 나왔다. */
  const fn = cutFn(APP, 'function edDown(');
  const mk = fn.indexOf("edDrag = { erase: true");
  const er = fn.indexOf('edEraseAt(p)');
  assert.ok(mk > 0 && er > mk,
    '★★ edEraseAt 이 edDrag 보다 먼저입니다 — 「지웠다」는 표시가 덮여 사라집니다');
});

/* ── ①③ 지금 무슨 도구인지 늘 보인다 ── */

test('★★ 두 갈래를 «모드로» 세운다 — 어느 쪽인지 늘 보여야 한다', () => {
  const c = box();
  const off = c.edPanelHtml();
  assert.match(off, /class="on" title="칠하기/, '★★ 평소에 ✏️ 칠하기가 켜져 보이지 않습니다');
  assert.match(off, /disabled[^>]*title="칠한 표시/, '★★ 칠한 것이 없는데 지우개가 눌립니다');
  draw(c, .3, .3);
  c.setEdErase(true);
  const on = c.edPanelHtml();
  assert.match(on, /class="on"[^>]*title="칠한 표시/, '★★ 지우개일 때 그것이 켜져 보이지 않습니다');
  assert.ok(!/class="on" title="칠하기/.test(on), '★ 둘이 함께 켜져 보입니다');
});

test('★★ 지우개일 때 «무엇을 지우는지» 그 자리에 적는다', () => {
  const c = box();
  draw(c, .3, .3);
  c.setEdErase(true);
  const h = c.edPanelHtml();
  assert.match(h, /지금은 <b>칠한 표시<\/b>를 지웁니다/,
    '★★ 사진을 지우는 줄 알고 계속 긋게 됩니다');
  assert.match(h, /사진은 안 지워집니다/);
  assert.match(h, /✏️ 칠하기<\/b>를 눌러 주세요/, '★★ 빠져나가는 길을 안 알려 줍니다');
  /* 평소에는 이 경고가 없어야 한다 — 늘 떠 있으면 아무도 안 읽는다 */
  const c2 = box();
  assert.ok(c2.edPanelHtml().indexOf('지금은 <b>칠한 표시</b>') < 0,
    '★ 칠하기일 때도 경고가 떠 있습니다');
  /* 눈에 띄는 꾸밈이어야 한다 */
  const css = APP.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.note\.edmode\{[^}]*background:#fff7ed/, '★ 그냥 흐린 글씨면 안 읽힙니다');
});

test('★ 붓 굵기는 모드와 «따로» 산다 — 지우개일 때도 크기를 고른다', () => {
  const c = box();
  draw(c, .3, .3);
  c.setEdBrush(2);
  c.setEdErase(true);
  const h = c.edPanelHtml();
  /* ⚠ 「지우는 크기」는 단추의 title 에도 들어 있다 — «눈에 보이는 이름표»를 따로 본다.
     처음에 그냥 글자만 찾다가, 이름표를 떼도 안 걸렸다. */
  assert.match(h, /<span class="lb">지우는 크기<\/span>/,
    '★ 지우개일 때 무슨 크기인지 이름표가 없습니다');
  assert.match(h, /class="on"[^>]*title="지우는 크기"/,
    '★★ 지우개로 가면 고른 굵기가 안 보입니다 — 예전에는 셋 다 꺼져 보였습니다');
  /* 칠하기일 때는 「붓 굵기」다 */
  const c2 = box();
  assert.match(c2.edPanelHtml(), /<span class="lb">붓 굵기<\/span>/);
});
