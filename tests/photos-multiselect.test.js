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
  const c = load(['dayItems', 'toggleDay'], context(selected));
  c.toggleDay(D1);
  assert.deepEqual([...selected].sort(), ['a', 'b']);
});

test('그 날짜가 모두 골라져 있으면 그 날짜만 해제한다', () => {
  const selected = new Set(['a', 'b', 'c']);
  const c = load(['dayItems', 'toggleDay'], context(selected));
  c.toggleDay(D1);
  assert.deepEqual([...selected], ['c']);
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
