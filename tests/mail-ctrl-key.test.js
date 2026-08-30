/* 대표 2026-08-30 — 「담당자 옆에 점 세 개 무슨 의미냐, 그리고 왜 메일쓰기 누른 것도
   아닌데 왜 자꾸 메일 쓰기 창으로 열리냐. 어떤 오류 있는지 검토해달라」

   찾아보니 둘 다 오류였다.

   ① 담당자 줄의 ⋮ 는 «자리맞춤용 빈 칸»이다(업무 칸 줄에는 진짜 메뉴가 그 자리에
      있다). 안 보여야 하는데, «고른 줄»에서만 파랗게 떠올랐다 — 눌러도 아무 일이
      없는데 단추처럼 보인다.
   ② 메일 목록에서 Ctrl+C(복사)를 누르면 「C = 새 메일」 단축키에 걸려 편지 쓰기
      창이 열리고, 정작 복사는 안 됐다(preventDefault). 회사 이름·주소를 목록에서
      복사하는 것은 하루에도 여러 번 하는 일이다.

   ⚠ ②는 여기서 끝나지 않았다 — 그렇게 열린 빈 창이 「마지막 본 화면」으로 적혀,
     그 뒤로는 «들어올 때마다» 편지 쓰기가 열렸다. 그 자리는
     cards-last-screen.test.js 가 지킨다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceFn } = require('./fnslice.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-cards.html'), 'utf8');

/* 주석을 걷어 낸 몸통 — 「그렇게 하지 말라」고 적어 둔 주석이 검사를 통과시키면 안 된다 */
const code = app.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* ── 진짜로 눌러 본다 ── */
function boot() {
  const done = [];
  const ctx = {
    Number, Math, String, RegExp,
    state: { view: 'mail', mailSent: 'box', mbOpen: null, mbCursor: -1 },
    document: { getElementById: () => null },
    mbBack() { done.push('back'); },
    openMailPage() { done.push('편지쓰기'); },
    openMailSetPage() { done.push('설정'); },
    mbVisibleRows() { return [{ _key: 'k1', _slug: 'INBOX', u: 1 }, { _key: 'k2', _slug: 'INBOX', u: 2 }]; },
    pickToggleAll(kind) { done.push('모두고르기:' + kind); },
    pickHit(kind, k) { done.push('고르기:' + k); },
    mbOpenMsg(s, u) { done.push('열기:' + u); },
    mbToggleRead(s, u) { done.push('읽음:' + u); },
    mbStar(s, u) { done.push('중요:' + u); },
    renderMailPage() {},
    done: done
  };
  vm.createContext(ctx);
  vm.runInContext(sliceFn(app, 'function mbKeyNav('), ctx);
  return ctx;
}

/* 눌린 키 하나 — 막혔는지(preventDefault) 도 함께 본다 */
function press(ctx, key, mods) {
  let blocked = false;
  const e = Object.assign(
    { key: key, target: { tagName: 'DIV' }, preventDefault() { blocked = true; } },
    mods || {});
  ctx.mbKeyNav(e);
  return blocked;
}

/* ══════ ② Ctrl 이 눌린 키는 우리 것이 아니다 ══════ */

test('★ Ctrl+C 는 «복사»다 — 편지 쓰기 창이 열리면 안 된다', () => {
  const c = boot();
  const blocked = press(c, 'c', { ctrlKey: true });
  assert.deepEqual(Array.from(c.done), [],
    '목록에서 Ctrl+C 를 눌렀는데 ' + JSON.stringify(c.done) + ' 이(가) 일어납니다');
  assert.equal(blocked, false, '복사를 막고 있습니다 — 회사 이름을 복사할 수 없습니다');
});

test('★ ⌘+C(맥) 도 마찬가지다', () => {
  const c = boot();
  assert.equal(press(c, 'c', { metaKey: true }), false);
  assert.deepEqual(Array.from(c.done), []);
});

test('★ Ctrl+S(저장)·Ctrl+U(소스보기) 가 메일을 건드리면 안 된다', () => {
  /* 짚어 둔 줄이 있을 때가 위험하다 — 그때만 s·u 가 먹는다. */
  const c = boot();
  c.state.mbCursor = 0;
  press(c, 's', { ctrlKey: true });
  press(c, 'u', { ctrlKey: true });
  assert.deepEqual(Array.from(c.done), [],
    '브라우저 단축키가 메일을 건드립니다: ' + JSON.stringify(c.done));
});

test('★ Alt 가 눌린 것도 넘긴다 — 창 전환·메뉴는 윈도우 몫이다', () => {
  const c = boot();
  press(c, 'c', { altKey: true });
  assert.deepEqual(Array.from(c.done), []);
});

test('★ 읽는 화면에서도 Ctrl+? 로 목록이 튕겨 나가면 안 된다', () => {
  const c = boot();
  c.state.mbOpen = { slug: 'INBOX', uid: 3 };
  press(c, 'Escape', { ctrlKey: true });
  assert.deepEqual(Array.from(c.done), [],
    'Ctrl 을 짚은 채 Esc 를 눌렀는데 읽던 메일이 닫힙니다');
});

/* ── 여기서 «너무 많이» 막으면 단축키가 통째로 죽는다 ── */

test('★ 그냥 C 는 예전 그대로 새 메일이다', () => {
  const c = boot();
  assert.equal(press(c, 'c'), true, '단축키가 브라우저로 새 나갑니다');
  assert.deepEqual(Array.from(c.done), ['편지쓰기'], 'C 단축키가 죽었습니다');
});

test('★ Shift 는 막지 않는다 — Shift+A(모두 고르기)와 ?(단축키 안내)가 우리 것이다', () => {
  const a = boot();
  press(a, 'A', { shiftKey: true });
  assert.deepEqual(Array.from(a.done), ['모두고르기:mbox'], 'Shift+A 가 죽었습니다');

  const b = boot();
  press(b, '/', { shiftKey: true });
  assert.deepEqual(Array.from(b.done), ['설정'], '? 안내가 죽었습니다');
});

test('방향키·스페이스·엔터도 예전 그대로', () => {
  const c = boot();
  press(c, 'ArrowDown');
  assert.equal(c.state.mbCursor, 0, '방향키가 죽었습니다');
  press(c, ' ');
  press(c, 'Enter');
  assert.deepEqual(Array.from(c.done), ['고르기:k1', '열기:1']);
});

test('글자 칸에 손이 가 있으면 예전 그대로 아무것도 안 한다', () => {
  const c = boot();
  const e = { key: 'c', target: { tagName: 'INPUT' }, preventDefault() {} };
  c.mbKeyNav(e);
  assert.deepEqual(Array.from(c.done), []);
});

/* 붙어 있는 자리 — 「막는 줄」이 «단축키보다 앞»에 있어야 뜻이 있다 */
test('★ Ctrl 검사가 단축키«보다 앞»에 있다', () => {
  const f = sliceFn(app, 'function mbKeyNav(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const guard = f.search(/e\.ctrlKey/);
  const shortcut = f.indexOf("e.key==='c'");
  assert.ok(guard > 0, 'Ctrl 을 넘기는 줄이 없습니다');
  assert.ok(guard < shortcut,
    'Ctrl 검사가 단축키 뒤에 있습니다 — 뒤에 있으면 Ctrl+C 가 먼저 걸립니다');
});

/* ══════ ① 담당자 줄의 ⋮ 는 어떤 경우에도 안 보인다 ══════ */

test('★ «고른» 담당자 줄에서도 ⋮ 는 안 보인다 — 눌러도 아무 일 없는 점이 뜨면 안 된다', () => {
  /* .dm-f.on .fmenu{visibility:visible} 이 .dm-f .ghost 보다 세다.
     .on 을 함께 눌러 주지 않으면 고른 줄에만 파란 ⋮ 가 떠오른다. */
  assert.match(code, /\.dm-f\.on\s+\.ghost\s*(,[^{]*)?\{[^}]*visibility\s*:\s*hidden/,
    '고른 담당자 줄(.dm-f.on)의 ⋮ 를 안 눌렀습니다 — 파란 점이 떠오릅니다');
});

test('★ 손을 얹어도 안 보인다 (예전에 고친 자리 — 도로 열리면 안 된다)', () => {
  assert.match(code, /\.dm-f:hover\s+\.ghost\s*(,[^{]*)?\{[^}]*visibility\s*:\s*hidden/,
    '손을 얹으면 ⋮ 가 떠오릅니다');
});

test('★ 자리는 «차지한 채» 숨는다 — display:none 이면 담당자 줄이 어긋난다', () => {
  const m = code.match(/\.dm-f\s+\.ghost\s*\{([^}]*)\}/);
  assert.ok(m, '.dm-f .ghost 규칙이 없습니다');
  assert.match(m[1], /visibility\s*:\s*hidden/, 'visibility 로 숨기지 않습니다');
  assert.ok(!/display\s*:\s*none/.test(m[1]),
    'display:none 이면 자리를 안 차지해 담당자 줄의 글자가 오른쪽으로 밀립니다');
  assert.match(m[1], /pointer-events\s*:\s*none/, '눌리지 않게 막지 않았습니다');
});
