'use strict';
/* 🔍 확대한 사진을 «끌어서» 본다 (대표 지시 2026-08-30)

   "확대이후에 마우스 움직임이 필요하다" · "화면이 한참 잘린채로 나온다"

   ■ 무엇이 문제였나
   확대하면 사진이 제 크기가 되어 **화면에는 한 귀퉁이만 든다.** 움직이는 길은
   굴림막대뿐이었는데 크게 보기는 **바탕이 검어서 막대가 거의 안 보인다** —
   그래서 사진이 잘린 채로 멈춰 있는 것처럼 보였다.

   ■ 두 가지를 고쳤다
   ① **누른 그 자리**가 가운데 오게 확대한다 (늘 왼쪽 위로 튀지 않는다)
   ② 확대한 뒤 **끌어서** 움직인다

   ■ 가장 위험한 자리
   ① **끈 것을 「누른 것」으로 세면 안 된다** — 손을 떼는 순간 확대가 풀려
      방금 찾아간 자리를 잃는다.
   ② **확대가 아닐 때는 손대지 않는다** — 그때 끄는 것은 「다른 프로그램으로
      끌어내기」다(2026-08-04 부터). 한 손짓에 두 뜻을 담으면 둘 다 망가진다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* 가짜 크게 보기 — 보이는 칸 800×600, 확대하면 사진은 2000×1500 */
function picCtx(over) {
  const cls = {};
  const pic = {
    scrollLeft: 0, scrollTop: 0, clientWidth: 800, clientHeight: 600,
    captured: null,
    setPointerCapture: function (id) { pic.captured = id; },
    releasePointerCapture: function () { pic.captured = null; },
    classList: {
      add: function (c) { cls[c] = 1; },
      remove: function (c) { delete cls[c]; },
      toggle: function (c) { if (cls[c]) { delete cls[c]; return false; } cls[c] = 1; return true; },
      contains: function (c) { return !!cls[c]; }
    }
  };
  const img = {
    id: 'viewerImg', offsetWidth: 2000, offsetHeight: 1500,
    /* 확대 «전» 자리 — 800×600 칸에 맞춰 800×600 으로 담겨 있다 */
    getBoundingClientRect: function () { return { left: 100, top: 50, width: 800, height: 600 }; }
  };
  const calls = { closed: 0 };
  const ctx = Object.assign({
    Math: Math,
    photoEditing: function () { return false; },
    closeViewer: function () { calls.closed++; },
    $: function (id) { return id === 'viewerPic' ? pic : id === 'viewerImg' ? img : null; },
    _pic: pic, _img: img, _cls: cls, _calls: calls
  }, over || {});
  vm.createContext(ctx);
  ['function picPanStart(', 'function picPanMove(', 'function picPanEnd(',
    'function zoomToPoint(', 'function picClick(']
    .forEach(function (f) { vm.runInContext(cutFn(app, f), ctx); });
  vm.runInContext('var _picPan = null; var _picPanned = false;', ctx);
  return ctx;
}

function down(x, y) {
  return { clientX: x, clientY: y, pointerId: 1, preventDefault: function () {} };
}

/* ══════ ① 누른 «그 자리»로 확대한다 ══════ */

test('★★ 누른 자리가 «가운데» 오게 확대한다 — 늘 왼쪽 위로 튀면 보려던 곳이 화면 밖이다', () => {
  const c = picCtx();
  /* 사진 한가운데(칸 기준 500,350)를 눌렀다 */
  c.picClick({ target: c._img, clientX: 500, clientY: 350 });
  assert.equal(c._cls.zoom, 1, '★ 확대가 안 켜졌습니다');
  /* 사진 안에서의 비 = (500-100)/800 = 0.5, (350-50)/600 = 0.5
     → 확대 뒤 그 점은 (1000, 750). 칸 가운데에 두려면 (1000-400, 750-300) */
  assert.equal(c._pic.scrollLeft, 600,
    '★★ 확대했더니 엉뚱한 데가 나옵니다 — 누른 자리가 화면 밖입니다');
  assert.equal(c._pic.scrollTop, 450);
});

test('★★ 왼쪽 위 귀퉁이를 누르면 «그 귀퉁이»가 나온다 — 음수로 밀지 않는다', () => {
  const c = picCtx();
  c.picClick({ target: c._img, clientX: 100, clientY: 50 });   /* 사진의 (0,0) */
  assert.ok(c._pic.scrollLeft <= 0 && c._pic.scrollTop <= 0,
    '★ 왼쪽 위를 눌렀는데 오른쪽으로 밀렸습니다');
});

test('★ 다시 누르면 확대가 풀리고 «처음 자리»로 돌아온다', () => {
  const c = picCtx();
  c.picClick({ target: c._img, clientX: 500, clientY: 350 });
  c.picClick({ target: c._img, clientX: 500, clientY: 350 });
  assert.equal(c._cls.zoom, undefined, '★ 확대가 안 풀립니다');
  assert.equal(c._pic.scrollLeft, 0, '★ 풀었는데 옛 자리에 머물면 다음 사진이 밀려 보입니다');
  assert.equal(c._pic.scrollTop, 0);
});

test('★ 사진 «바깥»을 누르면 예전처럼 닫힌다', () => {
  const c = picCtx();
  c.picClick({ target: { id: 'viewerPic' }, clientX: 10, clientY: 10 });
  assert.equal(c._calls.closed, 1, '★ 바깥을 눌러 닫는 길이 사라졌습니다');
});

/* ══════ ② 끌어서 움직인다 ══════ */

test('★★ 확대한 뒤 끌면 사진이 «따라온다» — 실제로 돌려 본다', () => {
  const c = picCtx();
  c.picClick({ target: c._img, clientX: 500, clientY: 350 });   /* 600,450 에서 시작 */
  c.picPanStart(down(500, 350));
  c.picPanMove({ clientX: 380, clientY: 260 });                 /* 왼쪽·위로 끌었다 */
  /* 사진을 왼쪽으로 끌면 «오른쪽»이 보여야 한다 — 굴림값은 커진다 */
  assert.equal(c._pic.scrollLeft, 600 + 120,
    '★★ 끄는 방향과 사진이 움직이는 방향이 반대입니다');
  assert.equal(c._pic.scrollTop, 450 + 90);
  assert.equal(c._pic.captured, 1,
    '★ 손가락을 안 붙잡으면 빨리 끌 때 사진이 그 자리에 멈춥니다');
  c.picPanEnd();
  assert.equal(c._cls.panning, undefined);
  assert.equal(c._pic.captured, null);
});

test('★★ 끈 것을 «누른 것으로 세지 않는다» — 손을 떼는 순간 확대가 풀린다', () => {
  const c = picCtx();
  c.picClick({ target: c._img, clientX: 500, clientY: 350 });
  c.picPanStart(down(500, 350));
  c.picPanMove({ clientX: 380, clientY: 260 });
  c.picPanEnd();
  /* 브라우저는 끌기가 끝난 뒤 click 도 함께 보낸다 */
  c.picClick({ target: c._img, clientX: 380, clientY: 260 });
  assert.equal(c._cls.zoom, 1,
    '★★ 움직이고 손을 떼자마자 확대가 풀립니다 — 방금 찾아간 자리를 잃습니다');
});

test('★ 안 움직이고 눌렀다 떼면 «누른 것»이다 — 확대가 풀려야 한다', () => {
  const c = picCtx();
  c.picClick({ target: c._img, clientX: 500, clientY: 350 });
  c.picPanStart(down(500, 350));
  c.picPanMove({ clientX: 501, clientY: 351 });   /* 손떨림 — 끈 것이 아니다 */
  c.picPanEnd();
  c.picClick({ target: c._img, clientX: 501, clientY: 351 });
  assert.equal(c._cls.zoom, undefined,
    '★ 손떨림까지 「끌었다」로 세면 확대를 영영 못 풉니다');
});

test('★★ 확대가 «아닐 때»는 안 잡는다 — 그때 끄는 것은 다른 프로그램으로 끌어내기다', () => {
  const c = picCtx();
  c.picPanStart(down(500, 350));
  c.picPanMove({ clientX: 300, clientY: 200 });
  assert.equal(c._pic.scrollLeft, 0, '★★ 파일을 끌어내려는데 사진이 움직였습니다');
  assert.equal(c._cls.panning, undefined);
});

test('★★ 폰(손가락)은 «안 잡는다» — 브라우저가 이미 굴리고 있어 두 배로 튄다', () => {
  const c = picCtx();
  c.picClick({ target: c._img, clientX: 500, clientY: 350 });
  const was = c._pic.scrollLeft;
  const t = down(500, 350); t.pointerType = 'touch';
  c.picPanStart(t);
  c.picPanMove({ clientX: 300, clientY: 200 });
  assert.equal(c._pic.scrollLeft, was,
    '★★ 손가락 굴리기 위에 우리가 한 번 더 굴리면 두 배로 튀고,\n' +
    '  브라우저가 굴리기 시작하는 순간 pointercancel 이 와서 덜컥 멈춥니다');
  assert.equal(c._cls.panning, undefined);
});

test('★ 마우스·펜은 그대로 잡는다 — 폰만 비켜 가야지 다 비키면 안 된다', () => {
  ['mouse', 'pen', undefined].forEach(function (kind) {
    const c = picCtx();
    c.picClick({ target: c._img, clientX: 500, clientY: 350 });
    const d = down(500, 350); if (kind) d.pointerType = kind;
    c.picPanStart(d);
    c.picPanMove({ clientX: 400, clientY: 350 });
    assert.equal(c._pic.scrollLeft, 700,
      '★ ' + (kind || '(안 알려 주는 브라우저)') + ' 에서 끌기가 안 됩니다');
  });
});

test('★★ 편집 중에는 «안 잡는다» — 네모를 긋는 손짓과 겹친다', () => {
  const c = picCtx({ photoEditing: function () { return true; } });
  c._cls.zoom = 1;
  c.picPanStart(down(500, 350));
  c.picPanMove({ clientX: 300, clientY: 200 });
  assert.equal(c._pic.scrollLeft, 0, '★★ 네모를 그으려는데 사진이 밀립니다');
});

/* ══════ ③ 손짓이 서로 안 밟는다 ══════ */

test('★★ 확대 중에는 «끌어내기»를 막는다 — 안 막으면 움직일 때마다 파일이 딸려 나간다', () => {
  const fn = cutFn(app, 'function viewerDragOut(');
  const i = fn.indexOf("classList.contains('zoom')");
  const j = fn.indexOf('dataTransfer');
  assert.ok(i > 0, '★★ 확대 중인지 안 봅니다');
  assert.ok(i < j, '★ 막는 것은 «맨 앞»이어야 합니다 — 뒤에 두면 이미 실려 나갑니다');
  assert.match(fn, /preventDefault\(\)/);
  /* 실제로 돌려서 본다 — 글자만 보면 조건을 뒤집어도 안 걸린다 */
  let stopped = 0;
  const ctx = {
    $: function () { return { classList: { contains: function () { return true; } } }; },
    e: { preventDefault: function () { stopped++; }, dataTransfer: {} }
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'function viewerDragOut(') + '\nviewerDragOut(e);', ctx);
  assert.equal(stopped, 1, '★★ 확대 중인데 끌어내기가 그대로 나갔습니다');
});

test('★★ 잡는 손짓이 사진 «칸»에 달려 있다 — 사진에만 달면 여백에서 놓친다', () => {
  const m = /<div id="viewerPic"[^>]*>/.exec(app);
  assert.ok(m, '크게 보기 사진 칸을 찾을 수 없습니다');
  ['onpointerdown="picPanStart', 'onpointermove="picPanMove',
    'onpointerup="picPanEnd', 'onpointercancel="picPanEnd'].forEach(function (h) {
    assert.ok(m[0].indexOf(h) >= 0, '★ ' + h + ' 가 없습니다');
  });
  assert.ok(m[0].indexOf('onclick="picClick') >= 0, '★ 누르는 길이 사라졌습니다');
});

test('★ 손 모양으로 «끌 수 있다»고 알린다 — 안 알리면 아무도 안 끈다', () => {
  assert.match(app, /#viewerPic\.zoom img\{[^}]*cursor:grab/,
    '★★ 커서가 그대로면 끌 수 있다는 것을 모릅니다 — 「잘린 채로 나온다」가 됩니다');
  assert.match(app, /#viewerPic\.zoom\.panning img\{cursor:grabbing\}/);
  assert.match(app, /#viewerPic\.zoom\.panning\{user-select:none\}/,
    '★ 끄는 동안 파랗게 덮이면 사진이 안 보입니다');
});
