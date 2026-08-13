const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

function load(names, over) {
  const ctx = Object.assign({ Set, Object, Array }, over || {});
  vm.createContext(ctx);
  names.forEach(n => {
    const m = html.match(new RegExp('function ' + n + '\\([\\s\\S]*?\\n\\}'));
    assert.ok(m, n + ' 함수가 없습니다.');
    vm.runInContext(m[0], ctx);
  });
  return ctx;
}

const D1 = '2026-8-7', D2 = '2026-8-6';
const shown = [
  { id: 'a', meta: { takenAt: 1 } },
  { id: 'b', meta: { takenAt: 1 } },
  { id: 'c', meta: { takenAt: 2 } }
];
function context(selected) {
  return {
    selected, shownItems: () => shown,
    dayKey: ts => ts === 1 ? D1 : D2,
    renderGrid() {}, $() { return null; }
  };
}

test('날짜 머리를 누르면 그 날짜 사진만 고른다', () => {
  const selected = new Set();
  const c = load(['dayItems', 'idsOf', 'toggleDay'], context(selected));
  c.toggleDay(D1);
  assert.deepEqual([...selected].sort(), ['a', 'b']);
});

test('그 날짜가 모두 골라져 있으면 그 날짜만 해제한다', () => {
  const selected = new Set(['a', 'b', 'c']);
  const c = load(['dayItems', 'idsOf', 'toggleDay'], context(selected));
  c.toggleDay(D1);
  assert.deepEqual([...selected], ['c']);
});

/* ── 접힌 문서는 쪽 전부가 함께 움직인다 (대표 지시 2026-08-13) ──
   6쪽 계약서가 한 칸으로 접혔는데 날짜 ✓ 가 대표 한 장만 고르면,
   「6장 지우기」라고 하면서 1장만 지운다 — 사진을 잃는다. */
test('★ 날짜 머리는 접힌 문서의 쪽 전부를 고른다', () => {
  const selected = new Set();
  const folded = [
    { id: 'p1', meta: { takenAt: 1 }, _pages: ['p1', 'p2', 'p3'] },
    { id: 'x', meta: { takenAt: 1 } }
  ];
  const c = load(['dayItems', 'idsOf', 'toggleDay'], {
    selected, shownItems: () => folded,
    dayKey: () => D1, renderGrid() {}, $() { return null; }
  });
  c.toggleDay(D1);
  assert.deepEqual([...selected].sort(), ['p1', 'p2', 'p3', 'x'],
    '접힌 문서의 쪽이 빠지면 「6장 지우기」가 1장만 지웁니다');
  /* 다시 누르면 전부 풀린다 — 일부만 남으면 다음 지우기가 엉뚱한 것을 건드린다 */
  c.toggleDay(D1);
  assert.deepEqual([...selected], [], '풀 때도 쪽 전부가 함께 풀려야 합니다');
});

test('★ idsOf — 접힌 문서는 쪽 전부, 홑장은 자기 하나', () => {
  const c = load(['idsOf'], {});
  /* ⚠ vm 안에서 만든 배열이라 deepEqual 이 튕긴다 — 알맹이로 견준다 */
  const j = (a) => Array.prototype.join.call(a || [], ',');
  assert.equal(j(c.idsOf({ id: 'a', _pages: ['a', 'b'] })), 'a,b');
  assert.equal(j(c.idsOf({ id: 'a' })), 'a', '홑장이 빈 배열이 되면 아무것도 안 골라집니다');
  assert.equal(j(c.idsOf({ id: 'a', _pages: [] })), 'a', '빈 묶음도 자기 하나로 봅니다');
  assert.equal(j(c.idsOf(null)), '');
});

test('혼란을 주던 전체 297장 모두 고르기는 제거했다', () => {
  assert.doesNotMatch(html, /id="allBtn"/);
  assert.doesNotMatch(html, /function toggleAllShown\(/);
  assert.doesNotMatch(html, /function renderAllBtn\(/);
  assert.match(html, /class="dayck" onclick="toggleDay\(/);
});

test('사진 한 장 및 날짜 단위 선택은 계속 제공한다', () => {
  assert.match(html, /function toggleOne\(/);
  assert.match(html, /closest\('\.ck'\)[\s\S]*toggleOne\(id\)/);
  assert.match(html, /function toggleDay\([\s\S]*?renderGrid\(\)/);
});
