/* 🗑 끌어서 휴지통에 넣기 (대표 승인 목업 2026-09-06)
   docs/mockups/photos-trash-drop.html
   「마우스 드래그로 휴지통에 바로 넣을 수 있게 해달라. 여러개 선택해도 넣을 수 있게 해라」

   ■ 새로 만든 것은 «받을 자리» 하나뿐이다
     격자 사진은 이미 끌 수 있고(다른 앱으로 내보내기), 「고른 것이 있으면 고른 전부,
     아니면 끈 한 장」 규칙도 이미 있다(photoDragIds — 폴더로 끌 때와 같다).

   ■ 지키는 규칙
     ① 지우는 길은 «하나»다 — 끌어 놓기도 deleteSelected 를 그대로 부른다.
        길이 둘이면 안내(30일·기업정보함·증빙)와 지운 기록이 갈린다.
     ② 놓을 수 없으면 «켜지지 않는다» — 남의 사진, 휴지통 화면.
        그때 preventDefault 를 안 불러야 브라우저가 「금지」 커서를 보여 준다.
     ③ 끌어 놓기는 «고른 것»을 안 건드린다 — 취소해도 골라 둔 것이 남아야 한다.
     ④ 다른 앱으로 끌어내기는 그대로 산다.
   실행: node --test tests/photos-trash-drop.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn.js');
const { stripComments } = require('./strip-comments.js');

const ROOT = path.join(__dirname, '..');
const 읽기 = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const RAW = 읽기('pu-photos.html');
const APP = stripComments(RAW);

/* ── 진짜 손잡이를 붙인 «작은 휴지통 단추» ── */
function 판(over) {
  const o = Object.assign({ view: 'photos', may: true, ids: ['a', 'b'] }, over || {});
  const cls = new Set();
  const btn = {
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), has: (c) => cls.has(c) },
    _h: {},
    addEventListener(ev, fn) { this._h[ev] = fn; }
  };
  const ctx = {
    console: { warn() {}, log() {} },
    $: function (id) { return id === 'trashBtn' ? btn : null; },
    view: o.view,
    photoDragIds: o.ids,
    mayTouch: function (ids) { ctx.saw = ids; return o.may; },
    deleteSelected: function (ids) { ctx.지운것 = ids; },
    cls: cls, btn: btn
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(APP, 'function canTrashDrop('), ctx);
  /* 손잡이를 다는 즉시실행 덩이를 그대로 오려 온다 — 가짜로 다시 쓰면 아무것도 안 지킨다 */
  const i = APP.indexOf("const tb = $('trashBtn');");
  assert.ok(i > 0, '휴지통 손잡이를 다는 자리를 못 찾았습니다');
  const s = APP.lastIndexOf('(function () {', i);
  vm.runInContext(APP.slice(s, APP.indexOf('})();', i) + 5), ctx);
  return ctx;
}
const 사건 = () => { let p = 0; return { preventDefault() { p++; }, get 막았나() { return p > 0; } }; };

/* ── ① 지우는 길은 하나 ── */
test('★★ 끌어 놓기도 «지금 삭제 단추와 같은 함수»를 부른다 — 안내·기록이 갈리면 안 된다', () => {
  const c = 판();
  const e = 사건();
  c.btn._h.drop(e);
  assert.deepEqual(Array.prototype.slice.call(c.지운것 || []), ['a', 'b'],
    '★★ 놓았는데 안 지우거나, 다른 길로 지웁니다');
  assert.ok(e.막았나, '브라우저 기본 동작을 안 막았습니다');
});

test('★ 삭제 단추가 부르는 함수와 «같은 이름»이다', () => {
  const i = APP.indexOf("const tb = $('trashBtn');");
  const seg = APP.slice(i, APP.indexOf('})();', i));
  assert.match(seg, /deleteSelected\(/, '★ 끌어 놓기가 따로 지웁니다 — 길이 둘이 됩니다');
  /* 삭제 단추도 같은 함수여야 한다 */
  assert.match(RAW, /onclick="deleteSelected\(\)"|deleteSelected\(\)/, '삭제 단추가 그 함수를 안 부릅니다');
});

test('★★ 놓은 것은 «고른 것»을 안 건드린다 — 취소해도 골라 둔 것이 남아야 한다', () => {
  const fn = cutFn(APP, 'function deleteSelected(');
  assert.match(fn, /idsIn/, '끌어 놓은 것을 받지 않습니다');
  assert.match(fn, /if \(dropped\) dropped\.forEach/,
    '★★ 끌어 놓고 나면 골라 두신 것이 통째로 풀립니다');
  assert.match(fn, /else selected\.clear\(\)/, '단추로 지운 뒤에는 지금처럼 다 풀려야 합니다');
});

/* ── 진짜 deleteSelected 를 돌려 본다 ──
   ⚠ 「idsIn 이라는 글자가 있나」로는 부족하다 — dropped 를 늘 null 로 만들어도
     그 글자는 남아 있어 검사가 통과했다(뮤테이션에서 확인). 그래서 «무엇을 지우려
     드는지»를 실제로 본다. */
function 지우개판(sel) {
  const ctx = {
    console: { warn() {}, log() {} },
    selected: new Set(sel || []),
    gridItems: [],
    blockedIfOther: function () { return false; },
    usedWarnText: function () { return ''; },
    confirm: function (m) { ctx.물음 = m; return true; },
    alert: function () {},
    $: function () { return { disabled: false, textContent: '' }; },
    removeMany: function (ids) { ctx.지운것 = ids; return Promise.resolve([]); },
    refreshTrashCount: function () {},
    renderGridBar: function () {}, renderGrid: function () {},
    PuPhotoStore: { TRASH_DAYS: 30 }
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(APP, 'function deleteSelected('), ctx);
  return ctx;
}

test('★★ 놓은 것을 «그대로» 지운다 — 고른 것으로 바꿔치지 않는다', async () => {
  const c = 지우개판(['가', '나', '다']);          // 세 장 골라 둔 상태
  c.deleteSelected(['라']);                        // 안 고른 한 장을 끌어다 놓았다
  await new Promise(function (r) { setTimeout(r, 0); });
  assert.deepEqual(Array.prototype.slice.call(c.지운것 || []), ['라'],
    '★★ 놓은 것이 아니라 골라 둔 것을 지웁니다');
  assert.match(c.물음 || '', /1장/, '몇 장인지 틀리게 묻습니다');
  /* ⚠ Set 은 «배열처럼» 자를 수 없다 — slice.call 로는 늘 빈 배열이 나온다 */
  assert.deepEqual(Array.from(c.selected).sort(), ['가', '나', '다'],
    '★★ 놓기만 했는데 골라 두신 것이 풀렸습니다');
});

test('단추로 지우면 지금처럼 «고른 것»을 지우고 다 푼다', async () => {
  const c = 지우개판(['가', '나']);
  c.deleteSelected();                              // 단추 — 인자 없음
  await new Promise(function (r) { setTimeout(r, 0); });
  assert.deepEqual(Array.prototype.slice.call(c.지운것 || []).sort(), ['가', '나'],
    '단추로 지우는 길이 바뀌었습니다');
  assert.equal(c.selected.size, 0, '단추로 지운 뒤에는 고른 것이 다 풀려야 합니다');
});

test('끌어 놓은 것과 고른 것이 다르면 «놓은 것만» 지운다', () => {
  const c = 판({ ids: ['x'] });
  c.btn._h.drop(사건());
  assert.deepEqual(Array.prototype.slice.call(c.지운것 || []), ['x'],
    '놓지 않은 사진까지 지웁니다');
});

/* ── ② 놓을 수 없으면 안 켜진다 ── */
test('★★ 남의 사진은 휴지통이 «안 켜진다» — 놓기 전에 알아야 한다', () => {
  const c = 판({ may: false });
  const e = 사건();
  c.btn._h.dragover(e);
  assert.equal(c.cls.has('drop'), false, '★ 못 지우는데 켜집니다 — 놓아 보고서야 압니다');
  assert.equal(e.막았나, false,
    '★★ preventDefault 를 불렀습니다 — 놓을 수 있는 것처럼 보이고 아무 일도 안 납니다');
  c.btn._h.drop(사건());
  assert.equal(c.지운것, undefined, '★★ 남의 사진을 지웠습니다');
});

test('★ 휴지통 화면에서는 안 켜진다 — 이미 버린 것을 또 버릴 수 없다', () => {
  ['trash', 'settings'].forEach(function (v) {
    const c = 판({ view: v });
    c.btn._h.dragover(사건());
    assert.equal(c.cls.has('drop'), false, v + ' 화면에서 휴지통이 켜집니다');
    c.btn._h.drop(사건());
    assert.equal(c.지운것, undefined, v + ' 화면에서 지웠습니다');
  });
});

test('끄는 것이 없으면 안 켜진다 — 딴것을 끌 때 휴지통이 번쩍이면 안 된다', () => {
  [null, []].forEach(function (v) {
    const c = 판({ ids: v });
    c.btn._h.dragover(사건());
    assert.equal(c.cls.has('drop'), false, '끄는 것이 없는데 켜집니다: ' + JSON.stringify(v));
  });
});

test('★ 놓을 수 있으면 켜지고, 벗어나면 꺼진다', () => {
  const c = 판();
  c.btn._h.dragover(사건());
  assert.equal(c.cls.has('drop'), true, '★ 놓을 수 있는데 안 켜집니다 — 어디 놓을지 모릅니다');
  c.btn._h.dragleave();
  assert.equal(c.cls.has('drop'), false, '벗어났는데 계속 켜져 있습니다');
  /* 놓은 뒤에도 꺼져야 한다 — 안 끄면 빨갛게 남는다 */
  c.btn._h.dragover(사건());
  c.btn._h.drop(사건());
  assert.equal(c.cls.has('drop'), false, '놓은 뒤에도 켜져 있습니다');
});

test('★ 판정은 «사진마다»의 권한을 본다 — 화면 주인만 보면 내 사진도 막힌다', () => {
  const c = 판();
  c.btn._h.dragover(사건());
  assert.deepEqual(Array.prototype.slice.call(c.saw || []), ['a', 'b'],
    '★ 끌고 있는 사진들을 넘겨 묻지 않습니다');
  assert.match(cutFn(APP, 'function canTrashDrop('), /mayTouch\(/,
    '★ 「전체 근로자」 화면에서 내가 찍은 사진까지 막힙니다');
});

/* ── ③ 들고 있던 것을 놓는다 ── */
test('놓고 나면 들고 있던 것을 비운다 — 취소해도 다음 끌기가 깨끗하다', () => {
  const c = 판();
  c.btn._h.drop(사건());
  assert.equal(c.photoDragIds, null, '들고 있던 것이 남아 다음 끌기에 섞입니다');
  /* 비우는 것이 지우기 «앞»이어야 한다 — 확인창에서 취소해도 비워져 있다 */
  const i = APP.indexOf("const tb = $('trashBtn');");
  const seg = APP.slice(i, APP.indexOf('})();', i));
  assert.ok(seg.indexOf('photoDragIds = null') < seg.indexOf('deleteSelected('),
    '지운 뒤에 비웁니다 — 확인창에서 취소하면 들고 있던 것이 남습니다');
});

/* ── ④ 있던 것을 안 깨뜨렸나 ── */
test('★ 폴더로 끌어다 놓기가 그대로 산다', () => {
  const i = APP.indexOf("$('foldList').addEventListener('drop'");
  assert.ok(i > 0, '★ 폴더 놓기가 사라졌습니다');
  assert.match(APP.slice(i, i + 400), /moveToFolder\(/, '★ 폴더로 옮기지 않습니다');
});

test('★ 다른 앱으로 끌어내기가 그대로 산다 — 한글·탐색기로 끌던 것', () => {
  const fn = APP.slice(APP.indexOf("$('grid').addEventListener('dragstart'"));
  assert.match(fn.slice(0, 1200), /PuDrag\.set/, '★ 앱 사이 끌어놓기 표식이 사라졌습니다');
  assert.match(fn.slice(0, 1200), /attachFileDragOut\(/, '★ 밖으로 파일이 안 나갑니다');
  /* 「고른 전부 / 끈 한 장」 규칙은 그대로 — 우리가 손댈 자리가 아니다 */
  assert.match(fn.slice(0, 700), /photoDragIds = \(selected\.size && selected\.has\(id\)\) \? Array\.from\(selected\) : \[id\]/,
    '★ 「고른 전부 / 끈 한 장」 규칙이 바뀌었습니다 — 폴더 놓기와 어긋납니다');
});

test('휴지통 단추가 «켜지는 모양»을 갖고 있다', () => {
  assert.match(RAW, /#trashBtn\.drop\{/, '켜져도 눈에 안 보입니다');
  /* 폴더(파랑)와 «다른 색»이라야 옮기는 것과 지우는 것이 안 헷갈린다 */
  /* ⚠ «그 한 규칙 안»만 본다 — 넉넉히 자르면 바로 아래 뱃지 규칙의 색이 걸려
     본문 색을 파랗게 바꿔도 검사가 통과한다(뮤테이션에서 실제로 그랬다). */
  const at = RAW.indexOf('#trashBtn.drop{');
  const seg = RAW.slice(at, RAW.indexOf('}', at));
  assert.match(seg, /#dc2626/, '지우는 자리인데 폴더와 같은 색입니다');
  assert.ok(!/var\(--blue\)/.test(seg), '폴더로 옮기는 것과 같은 색이라 헷갈립니다');
});
