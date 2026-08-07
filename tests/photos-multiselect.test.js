/* 사진첩 — 여러 장 한 번에 고르기 (대표 요청 2026-08-07)
   "사진을 한번에 여러개 체크할 수 있는 기능도 만들어줘"

   한 장씩 누르면 열 장에 열 번이다. 지우기·내려받기·분류 지정이 늘 여러 장 단위라
   묶어 고르는 길이 없으면 실제로는 못 쓴다.
     · 날짜 머리의 ✓  → 그 날 전부
     · 도구줄 「모두 고르기」 → 지금 보이는 것 전부 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

/* 진짜 함수를 꺼내 돌린다 — 옮겨 적으면 검사만 통과하고 코드는 고장난 채 남는다 */
function load(names, over) {
  const ctx = Object.assign({ Set, Object, Array }, over || {});
  vm.createContext(ctx);
  names.forEach(function (n) {
    const m = html.match(new RegExp('function ' + n + '\\([\\s\\S]*?\\n\\}'));
    assert.ok(m, n + ' 를 찾지 못했습니다.');
    vm.runInContext(m[0], ctx);
  });
  return ctx;
}

const D1 = '2026-8-7', D2 = '2026-8-6';
function item(id, day) { return { id: id, meta: { takenAt: day } }; }
/* 보이는 목록 — 걸러보기가 걸린 상태를 흉내낸다 */
const SHOWN = [item('a', 1), item('b', 1), item('c', 2)];
const HIDDEN = item('z', 1);   // 걸러져서 화면에 없는 사진

function ctxFor(selected) {
  return {
    selected: selected || new Set(),
    shownItems: function () { return SHOWN; },
    dayKey: function (ts) { return ts === 1 ? D1 : D2; },
    renderGrid: function () {},
    $: function () { return null; }
  };
}

/* ── 그 날 전부 ── */
test('★ 날짜 머리를 누르면 그 날 사진이 전부 골라진다', () => {
  const sel = new Set();
  const c = load(['dayItems', 'toggleDay'], ctxFor(sel));
  c.toggleDay(D1);
  assert.deepEqual([...sel].sort(), ['a', 'b']);
});

test('★ 이미 다 골라져 있으면 그 날만 풀린다', () => {
  const sel = new Set(['a', 'b', 'c']);
  const c = load(['dayItems', 'toggleDay'], ctxFor(sel));
  c.toggleDay(D1);
  assert.deepEqual([...sel], ['c'], '다른 날 고른 것까지 풀리면 안 됩니다.');
});

test('일부만 골라져 있으면 그 날 전부 고른다', () => {
  const sel = new Set(['a']);
  const c = load(['dayItems', 'toggleDay'], ctxFor(sel));
  c.toggleDay(D1);
  assert.deepEqual([...sel].sort(), ['a', 'b'], '반쯤 고른 상태에서는 마저 골라야 합니다.');
});

test('★ 걸러져서 안 보이는 사진은 딸려 오지 않는다', () => {
  /* 안 보이는 사진이 조용히 골라지면 그대로 함께 지워진다 — 가장 위험한 사고다 */
  const sel = new Set();
  const c = load(['dayItems', 'toggleDay'], ctxFor(sel));
  c.toggleDay(D1);
  assert.ok(!sel.has(HIDDEN.id), '화면에 없는 사진이 골라졌습니다.');
});

test('그 날 사진이 없으면 아무 일도 없다', () => {
  const sel = new Set();
  const c = load(['dayItems', 'toggleDay'], ctxFor(sel));
  c.toggleDay('2020-1-1');
  assert.equal(sel.size, 0);
});

/* ── 모두 고르기 ── */
test('★ 「모두 고르기」는 지금 보이는 것만 고른다', () => {
  const sel = new Set();
  const c = load(['toggleAllShown'], ctxFor(sel));
  c.toggleAllShown();
  assert.deepEqual([...sel].sort(), ['a', 'b', 'c']);
  assert.ok(!sel.has(HIDDEN.id), '걸러 놓은 것까지 골라지면 안 됩니다.');
});

test('한 번 더 누르면 전부 풀린다', () => {
  const sel = new Set(['a', 'b', 'c']);
  const c = load(['toggleAllShown'], ctxFor(sel));
  c.toggleAllShown();
  assert.equal(sel.size, 0);
});

/* ── 무엇이 골라지는지 미리 알려 준다 ── */
test('★ 단추에 지금 걸리는 장수를 적는다', () => {
  const m = html.match(/function renderAllBtn\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'renderAllBtn 이 없습니다.');
  assert.ok(/list\.length \+ '장'/.test(m[0]),
    '숫자가 없으면 무엇이 골라질지 모른 채 누르게 됩니다.');
  assert.ok(/모두 풀기/.test(m[0]), '다 골라진 상태에서는 「풀기」로 바뀌어야 합니다.');
  assert.ok(/list\.length > 1/.test(m[0]), '한 장뿐이면 「모두」가 의미 없습니다.');
});

/* ── 배선 ── */
test('단추와 날짜 머리가 실제로 배선돼 있다', () => {
  assert.ok(/id="allBtn" onclick="toggleAllShown\(\)"/.test(html), '「모두 고르기」 단추가 없습니다.');
  assert.ok(/class="dayck" onclick="toggleDay\(/.test(html), '날짜 머리에 고르기가 없습니다.');
  assert.ok(/renderAllBtn\(\);/.test(html.match(/renderNeedBox\(\);[\s\S]{0,120}/)[0])
         || /renderAllBtn\(\);[\s\S]{0,80}renderNeedBox\(\);/.test(html),
    '격자를 다시 그릴 때 단추 글귀도 따라와야 합니다.');
});

test('고르고 나면 화면을 다시 그린다', () => {
  for (const f of ['toggleDay', 'toggleAllShown']) {
    const m = html.match(new RegExp('function ' + f + '\\([^)]*\\)[\\s\\S]*?\\n\\}'));
    assert.ok(/renderGrid\(\)/.test(m[0]), f + ' 뒤에 체크 표시가 안 바뀝니다.');
  }
});
