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

/* ★ 2026-08-30 — 대표 지시가 «한 걸음 더» 갔다.
     "공유하기 클릭하면 캡쳐3셀에 사람을 선택할 수 있게 해달라"
   그래서 격자에서 누를 때는 창을 띄우지 않고 **왼쪽 칸(대시보드) 안에서** 고른다 —
   「단추바로옆」이 바라던 것의 가장 센 꼴이다(옮길 것도 없이 늘 그 자리에 있다).
   ⚠ 창을 없애지는 «않았다» — 사진 한 장을 크게 보고 공유할 때는 왼쪽 칸이 화면에
     없으므로 그대로 창을 쓴다. 그때는 붙일 단추도 없어 손잡이(anchor)를 안 준다.
   ⚠⚠ 그래서 이 검사가 지키는 것은 「손잡이 붙은 창이 «하나뿐»인가」가 아니라
     **「공유 아닌 창에 손잡이가 새지 않는가」**다 — 원래 걱정하던 그 병 그대로다. */
test('★★ 손잡이가 «공유 아닌 창»에 새지 않는다 — 분류·폴더 창까지 흔들 일이 아니다', () => {
  const withAnchor = bare.match(/showKindPopup\(\s*'[^']+'\s*\)/g) || [];
  assert.ok(withAnchor.length <= 1,
    '★★ 옮길 수 있는 창이 둘 이상입니다 — 대표가 정한 것은 «공유창»뿐입니다: ' +
    withAnchor.join(', '));
  withAnchor.forEach(function (c) {
    assert.match(c, /shareSideBtn/,
      '★★ 공유 창이 아닌 데에 손잡이를 달았습니다: ' + c);
  });
  /* 분류·폴더·업체 창을 여는 자리에는 손잡이가 없어야 한다 */
  ['function openAssignKind(', 'function askPdfSplit('].forEach(function (n) {
    let fn = '';
    try { fn = cutFn(app, n); } catch (_) { return; }
    assert.ok(!/showKindPopup\(\s*'/.test(fn), '★★ ' + n + ' 에 손잡이가 붙었습니다');
  });
});

test('★★ 격자에서는 창이 아니라 «왼쪽 칸 안»에서 고른다 (대표 지시 2026-08-30)', () => {
  assert.match(cutFn(app, 'function openShareMany('),
    /openSharePeople\(Array\.from\(selected\), 'sharePickBox'\)/,
    '★★ 격자에서 누르면 아직 창이 뜹니다 — 대시보드 칸 안에서 고르셔야 합니다');
  assert.match(app, /<div id="sharePickBox"/, '★★ 고를 칸이 없습니다');
  /* 크게 보기(한 장)는 그 칸이 화면에 없으므로 창 그대로 */
  assert.match(cutFn(app, 'function openSharePick('), /openSharePeople\(\[viewerId\]\)/,
    '★ 크게 보기에서 있지도 않은 칸에 그리려 합니다');
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

/* 기억 칸 이름은 소스가 정한다 — 검사에 글자로 박지 않는다 */
const POS_KEY = (/const SHARE_POP_POS = '([^']+)'/.exec(app) || [])[1];

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
  /* 가짜 기억 칸 — 사생활 모드도 흉내 낼 수 있게 */
  const mem = { v: {}, fail: false };
  const localStorage = {
    getItem: function (k) { if (mem.fail) throw new Error('막힘'); return mem.v[k] === undefined ? null : mem.v[k]; },
    setItem: function (k, s) { if (mem.fail) throw new Error('막힘'); mem.v[k] = String(s); }
  };
  const ctx = Object.assign({
    Math: Math, parseFloat: parseFloat, JSON: JSON, isFinite: isFinite, Error: Error,
    window: { innerWidth: 1000, innerHeight: 600, addEventListener: function () {} },
    localStorage: localStorage,
    $: function (id) {
      return id === 'kindPopupBox' ? box : id === 'kindPopup' ? pop : id === 'kindPopupHead' ? head : null;
    },
    _box: box, _pop: pop, _head: head, _mem: mem
  }, over || {});
  vm.createContext(ctx);
  ['function popPlace(', 'function popGrab(', 'function popMove(', 'function popDrop(',
    'function popSavedPos(', 'function popSavePos(', 'function popAnchor(']
    .forEach(function (f) { vm.runInContext(cutFn(app, f), ctx); });
  /* let / const 로 선언된 것은 vm 에서 다시 만들어 준다.
     ⚠ 기억 칸 이름은 «소스에서» 읽는다 — 여기에 글자로 박으면 이름을 고칠 때
       검사가 「기능이 망가져서가 아니라」 깨진다. */
  vm.runInContext('var _popDrag = null; var SHARE_POP_POS = ' + JSON.stringify(POS_KEY) + ';', ctx);
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
  c.popAnchor('없는단추');
  assert.equal(c._box.style.left, '8px', '★ 자리를 못 잡아 창이 화면 밖에 있습니다');
});

/* ══════ ⑤ 옮겨 둔 자리를 기억한다 (대표 지시 2026-08-30 「기억하게」) ══════ */

test('★★ 이름을 소스가 정한다 — 검사에 글자로 박지 않는다', () => {
  assert.ok(POS_KEY, '★ 기억 칸 이름을 못 찾았습니다');
});

test('★★ 끌어서 옮기면 «그 자리를 적는다», 다음에 열면 그리로 뜬다', () => {
  const c = dragCtx();
  c._pop.classList.add('move');
  c.popGrab({ clientX: 350, clientY: 110, target: {}, pointerId: 1, preventDefault: function () {} });
  c.popMove({ clientX: 550, clientY: 260 });
  c.popDrop();
  assert.deepEqual(JSON.parse(c._mem.v[POS_KEY]), { x: 510, y: 250 },
    '★★ 옮긴 자리를 안 적으면 열 때마다 다시 끌어야 합니다');

  /* 다음에 열 때 — 단추가 어디에 있든 «적어 둔 자리»가 이긴다 */
  const d = dragCtx();
  d._mem.v[POS_KEY] = JSON.stringify({ x: 510, y: 250 });
  d.$ = (function (o) {
    return function (id) {
      if (id === 'shareSideBtn') return { getBoundingClientRect: function () { return { right: 286, top: 214 }; } };
      return o(id);
    };
  })(d.$);
  vm.runInContext(cutFn(app, 'function popAnchor('), d);
  d.popAnchor('shareSideBtn');
  assert.equal(d._box.style.left, '510px', '★★ 적어 둔 자리를 안 씁니다 — 늘 단추 옆으로 되돌아갑니다');
  assert.equal(d._box.style.top, '250px');
});

test('★★ 열고 닫기만 해서는 «안 적는다» — 자리가 스멀스멀 밀린다', () => {
  const c = dragCtx();
  c._pop.classList.add('move');
  /* 잡았다 놓기만 — 끌지 않았다 */
  c.popGrab({ clientX: 350, clientY: 110, target: {}, pointerId: 1, preventDefault: function () {} });
  c.popDrop();
  assert.equal(c._mem.v[POS_KEY], undefined,
    '★★ 안 옮겼는데 적으면, 가두기가 고쳐 놓은 값이 다시 적혀 자리가 밀립니다');
  /* 아예 잡지도 않았을 때도 마찬가지 */
  c.popDrop();
  assert.equal(c._mem.v[POS_KEY], undefined);
});

test('★★ 적어 둔 자리가 «화면 밖»이면 도로 가둔다 — 큰 화면에서 작은 화면으로 옮겨 앉는다', () => {
  const c = dragCtx();
  c._mem.v[POS_KEY] = JSON.stringify({ x: 3000, y: 2000 });   /* 넓은 모니터에서 적어 둔 자리 */
  c.popAnchor('shareSideBtn');
  assert.equal(c._box.style.left, (1000 - 340 - 8) + 'px',
    '★★ 적어 둔 대로만 두면 창이 화면 밖에 뜹니다 — 아예 못 씁니다');
  assert.equal(c._box.style.top, (600 - 40) + 'px');
});

test('★★ 기억 칸이 막혀 있어도 «공유는 된다» — 사생활 모드', () => {
  const c = dragCtx();
  c._mem.fail = true;
  c.$ = (function (o) {
    return function (id) {
      if (id === 'shareSideBtn') return { getBoundingClientRect: function () { return { right: 286, top: 214 }; } };
      return o(id);
    };
  })(c.$);
  vm.runInContext(cutFn(app, 'function popAnchor('), c);
  assert.doesNotThrow(function () { c.popAnchor('shareSideBtn'); },
    '★★ 자리를 못 외운다고 창이 안 뜨면 공유 자체가 막힙니다');
  assert.equal(c._box.style.left, '296px', '★ 못 외웠으면 예전처럼 단추 옆입니다');

  c._pop.classList.add('move');
  c.popGrab({ clientX: 350, clientY: 110, target: {}, pointerId: 1, preventDefault: function () {} });
  c.popMove({ clientX: 550, clientY: 260 });
  assert.doesNotThrow(function () { c.popDrop(); }, '★★ 적다 막히면 끌기가 통째로 터집니다');
});

test('★★ 적힌 것이 «망가져 있어도» 창은 뜬다 — 남이 손댔거나 옛 모양일 수 있다', () => {
  [null, '{', '{"x":"저쪽","y":3}', '{"y":3}', '[]'].forEach(function (bad) {
    const c = dragCtx();
    if (bad !== null) c._mem.v[POS_KEY] = bad;
    c.$ = (function (o) {
      return function (id) {
        if (id === 'shareSideBtn') return { getBoundingClientRect: function () { return { right: 286, top: 214 }; } };
        return o(id);
      };
    })(c.$);
    vm.runInContext(cutFn(app, 'function popAnchor('), c);
    assert.doesNotThrow(function () { c.popAnchor('shareSideBtn'); }, '터짐: ' + bad);
    assert.equal(c._box.style.left, '296px',
      '★★ 「' + bad + '」 이 적혀 있을 때 창이 엉뚱한 데 떴습니다');
  });
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

/* ── 좌우 넓이 (대표 지시 2026-08-30 「좌우 넓이 1/3 줄여라」) ──
   ⚠ **227 이라는 숫자가 아니라 «⅔ 라는 비»를 못박는다.** 붙박이 창 넓이를 나중에
     고치면 공유 창도 함께 따라와야 한다 — 숫자로 박으면 그때 검사가
     「기능이 망가져서가 아니라」 깨진다(CLAUDE.md 검사 규칙).
   ⚠ 제목이 한 줄에 드는지는 브라우저에서 실제로 재어 확인했다(161/161px). */
test('★★ 공유 창 좌우가 붙박이 창의 «⅔»다 — 대표 지시 「1/3 줄여라」', () => {
  const base = Number(/#kindPopup \.pop\{[^}]*max-width:(\d+)px/.exec(app)[1]);
  const m = /@media \(min-width:761px\)\{[\s\S]*?#kindPopup\.move \.pop\{[^}]*max-width:(\d+)px/.exec(app);
  assert.ok(m, '★★ 공유 창을 안 좁혔습니다');
  const narrow = Number(m[1]);
  const r = narrow / base;
  assert.ok(Math.abs(r - 2 / 3) < 0.03,
    '★★ 좌우를 ⅓ 줄이라 하셨습니다 — 지금은 ' + base + 'px 의 ' +
    Math.round(r * 100) + '% (' + narrow + 'px) 입니다');
});

test('★★ 좁히는 것은 «넓은 화면에서만» — 폰에서 더 좁히는 것은 거꾸로다', () => {
  /* ⚠ 이 파일에는 폰 규칙 묶음이 여럿이고, 한 줄짜리도 있다 — 「공유 창으로 시작하는」
     묶음에 딱 붙여 찾는다. 안 그러면 엉뚱한 묶음부터 수백 줄을 통째로 집는다. */
  const phone = /@media \(max-width:760px\)\{\r?\n\s*#kindPopup\.move[\s\S]*?\r?\n\}/.exec(app);
  assert.ok(phone, '★ 공유 창의 폰 규칙이 없습니다');
  /* ⚠ 묶음의 «조건»(max-width:760px)이 아니라 «안의 규칙»만 본다 */
  const inner = phone[0].replace(/^@media[^{]*\{/, '');
  assert.ok(!/max-width:\d+px/.test(inner),
    '★★ 폰에서까지 좁히면 한 손으로 짚기 어려워집니다 — 좁은 화면은 원래 가운데 붙박이입니다');
  /* 좁히는 규칙이 넓은 화면 쪽 안에 «들어 있어야» 한다 */
  const wide = /@media \(min-width:761px\)\{\r?\n\s*#kindPopup\.move[\s\S]*?\r?\n\}/.exec(app);
  assert.ok(wide && /#kindPopup\.move \.pop\{[^}]*max-width/.test(wide[0]),
    '★★ 좁히는 규칙이 넓은 화면 밖에 있습니다 — 폰까지 따라 좁아집니다');
});

test('★ 좁아진 만큼 «여백과 글씨»도 줄인다 — 안 줄이면 제목이 두 줄이 된다', () => {
  const wide = /@media \(min-width:761px\)\{\r?\n\s*#kindPopup\.move[\s\S]*?\r?\n\}/.exec(app)[0];
  assert.match(wide, /#kindPopup\.move \.h\{[^}]*font-size:/,
    '★ 제목 글씨를 그대로 두면 「이 사진을 같이 볼 사람」이 접힙니다');
  ['\\.h\\{', '\\.b\\{', '\\.btns\\{'].forEach(function (sel) {
    assert.match(wide, new RegExp('#kindPopup\\.move ' + sel + '[^}]*padding:'),
      '★ 좌우 여백이 그대로면 좁힌 만큼이 여백에 먹힙니다 (' + sel + ')');
  });
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
