'use strict';
/* 👥 공유 창 — «단추 바로 옆»에 띄우고 마우스로 옮긴다 (대표 지시 2026-08-30)

   "팝업창 마우스로 움직이게 해라 그리고 이 창은 대시보드 위에 나오게 해라"
   "단추바로옆 공유창"

   ■ 왜
   가운데 모달은 **누구에게 열어 줄지 고르는 동안 정작 그 사진을 가린다.**
   누른 단추(대시보드의 「고른 N장 공유하기」) 바로 옆에 띄우고, 마음에 안 들면
   제목줄을 잡아 옮긴다.

   ■ 가장 위험한 자리
   ① **한 창을 예닐곱 가지 일에 돌려 쓴다**(분류·폴더·업체·여러 쪽 서류·공유…).
      여는 자리마다 저마다 켜면 «공유 아닌 창에 손잡이가 남는 날»이 온다 —
      같은 병으로 「지우기」 단추가 남았던 적이 있다. 그래서 여는 문을 하나로 모았다.
   ② **화면 밖으로 나가면 안 된다.** 제목줄을 못 잡으면 영영 못 되돌린다.
   ③ **바깥 클릭으로 닫히면 안 된다.** 옮길 수 있게 되면 사진을 보려고 바깥을
      누르게 되는데, 그때 닫히면 골라 둔 체크가 통째로 날아간다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
/* 글로 견주는 검사는 **주석을 먼저 걷는다** — 잘 쓴 주석이 검사를 통과시킨다 */
const bare = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

/* ══════ ① 여는 문이 «하나»다 ══════ */

test('★★ 창을 여는 자리가 저마다 display 를 안 켠다 — 한 문으로만 연다', () => {
  const raw = (bare.match(/\$\('kindPopup'\)\.style\.display\s*=\s*'flex'/g) || []).length;
  assert.equal(raw, 0,
    '★★ 여는 자리마다 저마다 켜면 «공유 아닌 창에 손잡이가 남는 날»이 옵니다.\n' +
    '  같은 병으로 「지우기」 단추가 남았던 적이 있습니다 — showKindPopup() 으로 여십시오.');
  const doors = (bare.match(/showKindPopup\(/g) || []).length;
  assert.ok(doors >= 9, '여는 자리가 모자랍니다 (지금 ' + doors + ')');
});

test('★★ 옮길 수 있게 여는 것은 «공유 하나»뿐이다 — 요금도 위험도 없는 창까지 흔들 일이 아니다', () => {
  const withAnchor = bare.match(/showKindPopup\(\s*'[^']+'\s*\)/g) || [];
  assert.equal(withAnchor.length, 1,
    '★★ 옮길 수 있는 창이 둘 이상입니다 — 대표가 정한 것은 «공유창»뿐입니다');
  assert.match(withAnchor[0], /shareSideBtn/,
    '★ 붙일 단추가 「고른 N장 공유하기」가 아닙니다 (대표 지시 「단추바로옆」)');
  /* 그 자리가 실제로 공유 창을 여는 곳인가 */
  const fn = cutFn(app, 'function openSharePeople(');
  assert.match(fn, /showKindPopup\('shareSideBtn'\)/,
    '★★ 공유 창이 아닌 데에 손잡이를 달았습니다');
});

test('★★ 닫을 때 «옮기는 성질»을 끈다 — 안 끄면 다음에 연 분류 창이 손잡이를 달고 나온다', () => {
  const fn = cutFn(app, 'function closeKindPopup(');
  assert.match(fn, /classList\.remove\('move'\)/,
    '★★ 한 창을 여러 일에 돌려 씁니다 — 끄지 않으면 남습니다');
  assert.match(fn, /popDrop\(\)/,
    '★ 잡은 채로 닫으면 다음에 열 때 «잡힌 상태»로 뜹니다');
});

test('★★ 띄운 «뒤에» 자리를 잡는다 — 띄우기 전에는 창 너비가 0 이라 다 어긋난다', () => {
  const fn = cutFn(app, 'function showKindPopup(');
  const i = fn.indexOf("display = 'flex'");
  const j = fn.indexOf('popAnchor(');
  assert.ok(i > 0 && j > i,
    '★★ 자리를 먼저 잡으면 너비가 0 이라 단추 옆이 아니라 엉뚱한 데 뜹니다');
});

/* ══════ ② 바깥을 눌러도 안 닫힌다 ══════ */

test('★★ 옮길 수 있는 창은 «바깥 클릭으로 안 닫힌다» — 골라 둔 체크가 통째로 날아간다', () => {
  const tag = /<div id="kindPopup"[^>]*onclick="([^"]*)"/.exec(app);
  assert.ok(tag, '바깥 클릭을 받는 자리가 없습니다');
  const h = tag[1];
  assert.match(h, /classList\.contains\('move'\)/,
    '★★ 옮길 수 있게 되면 사진을 보려고 바깥을 누르게 됩니다 —\n' +
    '  그때 닫히면 사람 여덟을 다시 골라야 합니다');
  /* 붙박이 창에서는 예전처럼 닫혀야 한다 — 새로 배울 손짓을 만들지 않는다 */
  assert.match(h, /closeKindPopup\(\)/);

  /* 실제로 돌려서 본다 — 글자만 보면 조건을 뒤집어도 안 걸린다 */
  function click(isMove) {
    let closed = 0;
    const self = { classList: { contains: function (c) { return c === 'move' && isMove; } } };
    const ctx = { event: { target: self }, closeKindPopup: function () { closed++; } };
    ctx.self = self;
    vm.createContext(ctx);
    vm.runInContext(h.replace(/\bthis\b/g, 'self').replace(/&amp;/g, '&'), ctx);
    return closed;
  }
  assert.equal(click(true), 0, '★★ 옮길 수 있는 창이 바깥 클릭에 닫혔습니다');
  assert.equal(click(false), 1, '★ 붙박이 창은 예전처럼 닫혀야 합니다');
});

/* ══════ ③ 끌어 옮기기 ══════ */

/* 가짜 화면 — 창은 340×300, 화면은 1000×600 */
function dragCtx(over) {
  const box = { offsetLeft: 310, offsetTop: 100, offsetWidth: 340, style: {} };
  const pop = {
    _cls: {},
    style: { display: 'flex' },
    classList: {
      add: function (c) { pop._cls[c] = 1; },
      remove: function (c) { delete pop._cls[c]; },
      contains: function (c) { return !!pop._cls[c]; }
    }
  };
  const head = { captured: null, setPointerCapture: function (id) { head.captured = id; },
    releasePointerCapture: function () { head.captured = null; } };
  const ctx = Object.assign({
    Math: Math, parseFloat: parseFloat, window: { innerWidth: 1000, innerHeight: 600,
      addEventListener: function () {} },
    $: function (id) {
      return id === 'kindPopupBox' ? box : id === 'kindPopup' ? pop : id === 'kindPopupHead' ? head : null;
    },
    _box: box, _pop: pop, _head: head
  }, over || {});
  vm.createContext(ctx);
  ['function popPlace(', 'function popGrab(', 'function popMove(', 'function popDrop(']
    .forEach(function (f) { vm.runInContext(cutFn(app, f), ctx); });
  vm.runInContext('var _popDrag = null;', ctx);
  /* let 로 선언된 것을 vm 에서 쓰려면 위처럼 다시 만들어야 한다 */
  return ctx;
}

test('★ 제목줄을 잡고 끌면 창이 따라온다 — 실제로 돌려 본다', () => {
  const c = dragCtx();
  c._pop.classList.add('move');
  c.popGrab({ clientX: 350, clientY: 110, target: { id: 'kindPopupHead' }, pointerId: 1,
    preventDefault: function () {} });
  c.popMove({ clientX: 550, clientY: 260 });
  assert.equal(c._box.style.left, '510px', '★ 잡은 자리와 창 자리의 차이를 안 지켰습니다');
  assert.equal(c._box.style.top, '250px');
  assert.equal(c._head.captured, 1,
    '★ 손가락을 안 붙잡으면 빨리 끌 때 창이 그 자리에 붙어 버립니다');
  c.popDrop();
  assert.equal(c._pop.classList.contains('grabbing'), false);
});

test('★★ 옮길 수 있는 창이 «아니면» 안 잡힌다 — 붙박이 창이 끌려 다니면 안 된다', () => {
  const c = dragCtx();
  c.popGrab({ clientX: 350, clientY: 110, target: {}, pointerId: 1, preventDefault: function () {} });
  c.popMove({ clientX: 900, clientY: 400 });
  assert.equal(c._box.style.left, undefined, '★★ 붙박이 창이 끌렸습니다');
});

test('★★ 닫기 단추는 «잡는 곳이 아니다» — 닫으려다 창만 끌린다', () => {
  const c = dragCtx();
  c._pop.classList.add('move');
  c.popGrab({ clientX: 350, clientY: 110, target: { id: 'kindPopupX' }, pointerId: 1,
    preventDefault: function () {} });
  c.popMove({ clientX: 900, clientY: 400 });
  assert.equal(c._box.style.left, undefined, '★★ ✕ 를 눌렀는데 창이 끌렸습니다');
});

test('★★ 화면 밖으로 «못 나간다» — 나가면 제목줄을 못 잡아 영영 못 되돌린다', () => {
  const c = dragCtx();
  c.popPlace(-9000, -9000);
  assert.equal(c._box.style.left, '8px');
  assert.equal(c._box.style.top, '8px');

  c.popPlace(9000, 9000);
  assert.equal(c._box.style.left, (1000 - 340 - 8) + 'px', '★ 창이 오른쪽으로 잘려 나갔습니다');
  assert.equal(c._box.style.top, (600 - 40) + 'px',
    '★★ 아래로 넘기면 «제목줄»이 화면 밖으로 나가 다시 못 잡습니다');
});

test('★★ 창보다 좁은 화면에서도 «음수 자리»로 안 밀린다 — 폰 가로에서 왼쪽이 잘린다', () => {
  const c = dragCtx({ window: { innerWidth: 300, innerHeight: 200, addEventListener: function () {} } });
  c.popPlace(500, 500);
  assert.equal(c._box.style.left, '0px');
  assert.equal(c._box.style.top, (200 - 40) + 'px');
});

/* ══════ ④ 붙는 자리 — 단추 바로 옆 ══════ */

test('★★ 누른 단추 «바로 옆»에 뜬다 (대표 지시 「단추바로옆」)', () => {
  const c = dragCtx();
  c.$ = (function (orig) {
    return function (id) {
      if (id === 'shareSideBtn') {
        return { getBoundingClientRect: function () { return { right: 286, top: 214 }; } };
      }
      return orig(id);
    };
  })(c.$);
  vm.runInContext(cutFn(app, 'function popAnchor('), c);
  c.popAnchor('shareSideBtn');
  assert.equal(c._box.style.left, '296px',
    '★★ 단추 오른쪽 끝에 안 붙었습니다 — 눈이 단추에서 창으로 못 넘어갑니다');
  assert.equal(c._box.style.top, '214px', '★ 단추와 «같은 높이»여야 눈이 안 헤맵니다');
});

test('★ 단추를 못 찾아도 «창은 뜬다» — 안 뜨면 공유를 아예 못 한다', () => {
  const c = dragCtx();
  vm.runInContext(cutFn(app, 'function popAnchor('), c);
  c.popAnchor('없는단추');
  assert.equal(c._box.style.left, '8px', '★ 자리를 못 잡아 창이 화면 밖에 있습니다');
});

/* ══════ ⑤ 꾸밈 — 손잡이는 옮길 수 있는 창에만 ══════ */

test('★★ 손잡이와 ✕ 는 «옮길 수 있는 창»에만 나온다 — 붙박이 창에 있으면 「왜 안 움직이지」가 된다', () => {
  assert.match(app, /#kindPopupGrip,#kindPopupX\{display:none\}/,
    '★★ 붙박이 창에도 손잡이가 보입니다');
  assert.match(app, /#kindPopup\.move #kindPopupGrip\{display:block/);
  assert.match(app, /#kindPopup\.move #kindPopupX\{display:block/);
  assert.match(app, /#kindPopup\.move \.h\{cursor:grab/,
    '★ 커서가 안 바뀌면 «잡을 수 있다»는 것을 아무도 모릅니다');
});

test('★★ 덮개를 «옅게라도» 남긴다 — 아주 지우면 뒤가 눌리는 줄 알고 누른다', () => {
  const m = /#kindPopup\.move\{background:rgba\(16,24,40,\.(\d+)\)/.exec(app);
  assert.ok(m, '★★ 덮개를 통째로 지웠습니다');
  const a = Number('0.' + m[1]);
  assert.ok(a > 0, '★★ 뒤가 눌리는 줄 알고 누르면, 고르기가 바뀌어도 열리는 사진은 그대로입니다');
  assert.ok(a < 0.3, '★ 너무 진하면 정작 그 사진이 안 보입니다 (지금 ' + a + ')');
});

test('★ 폰에서는 «가운데 붙박이»로 되돌린다 — 좁은 화면은 옮길 자리가 없다', () => {
  const m = /@media \(max-width:760px\)\{\s*#kindPopup\.move[\s\S]*?\n\}/.exec(app);
  assert.ok(m, '★ 폰 규칙이 없습니다');
  const blk = m[0];
  assert.match(blk, /#kindPopup\.move \.pop\{position:static\}/,
    '★ 폰에서 창이 절대 자리에 남으면 화면 밖으로 밀립니다');
  assert.match(blk, /#kindPopup\.move #kindPopupGrip\{display:none\}/,
    '★ 못 옮기는데 손잡이가 보이면 잡아 끌다 「고장났나」 하십니다');
});
