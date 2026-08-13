/* 자료 서랍을 갈래로 묶어 접는다.
   자료가 늘수록 평평한 목록은 훑기 어렵다 — 보낼 때 필요한 건 보통 한 갈래뿐이라
   그 갈래만 펴서 고르면 된다(대표 지시 2026-08-12).
   순수 함수 두 개(drawerGroups·drawerCatOpen)만 떼어 vm 에서 실제로 돌린다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function load(cats){
  const i = source.indexOf('function drawerGroups');
  const j = source.indexOf('function focusDrawerQ');
  assert.ok(i > 0 && j > i, 'drawerGroups 블록을 찾지 못했습니다');
  const ctx = {
    state: { drawerQ:'', drawerOpen:{} },
    MAT_CATS_NOW: () => cats,
    matCat: m => m.cat,
    grabCompose(){}, renderMailPage(){}
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(i, j), ctx);
  return ctx;
}
const M = (id, cat) => ({ id, cat });
/* vm 샌드박스가 만든 배열은 이 파일과 다른 realm 의 Array 다 — 구조가 같아도
   assert.deepEqual 이 "참조가 다르다"며 실패한다. 이 파일 realm 으로 한 번 옮긴다
   (cards-hwp-integration.test.js 의 plain() 과 같은 까닭). */
const plain = v => JSON.parse(JSON.stringify(v));

test('갈래 차례는 자료함과 같다', () => {
  /* 서랍만 다른 순서면 같은 자료를 두 곳에서 다르게 찾게 된다 */
  const c = load(['제안서','계약서','법인홍보물','기타']);
  const g = c.drawerGroups([M('a','기타'), M('b','계약서'), M('c','제안서')]);
  assert.deepEqual(plain(g.map(x=>x.cat)), ['제안서','계약서','기타']);
});

test('빈 갈래는 머리도 안 만든다', () => {
  const c = load(['제안서','계약서','기타']);
  const g = c.drawerGroups([M('a','계약서')]);
  assert.deepEqual(plain(g.map(x=>x.cat)), ['계약서']);
});

test('갈래 목록에 없는 값이 붙은 자료도 버리지 않는다', () => {
  /* 목록에서 사라지면 영영 못 고른다 */
  const c = load(['제안서','계약서']);
  const g = c.drawerGroups([M('a','계약서'), M('b','옛갈래')]);
  assert.deepEqual(plain(g.map(x=>x.cat)), ['계약서','옛갈래']);
  assert.equal(g.find(x=>x.cat==='옛갈래').items.length, 1);
});

test('갈래가 비어 있는 자료는 기타로 간다', () => {
  const c = load(['계약서','기타']);
  const g = c.drawerGroups([{id:'a'}, M('b','계약서')]);
  assert.deepEqual(plain(g.map(x=>x.cat)), ['계약서','기타']);
});

test('찾는 말을 치는 중에는 모든 갈래를 편다', () => {
  /* 접힌 갈래에 답이 숨으면 「없다」고 오해한다 */
  const c = load(['계약서']);
  c.state.drawerQ = 'cms';
  assert.equal(c.drawerCatOpen('계약서', 50), true);
});

test('자료가 적으면(6개 이하) 굳이 접지 않는다', () => {
  const c = load(['계약서']);
  assert.equal(c.drawerCatOpen('계약서', 6), true);
  assert.equal(c.drawerCatOpen('계약서', 7), false);
});

test('많을 때는 눌러서 편 갈래만 편다', () => {
  const c = load(['계약서','기타']);
  c.state.drawerOpen = { '계약서': true };
  assert.equal(c.drawerCatOpen('계약서', 20), true);
  assert.equal(c.drawerCatOpen('기타', 20), false);
});

test('접힌 갈래에 담은 자료가 있으면 숫자로 알려준다', () => {
  /* 접혀 있다고 담긴 것을 모르면, 무엇이 붙는지 모른 채 보내게 된다 */
  assert.match(source, /담음 \$\{picked\}/);
  assert.match(source, /const picked = g\.items\.filter\(m=>c\.ids\.indexOf\(m\.id\)>=0\)\.length/);
});

test('서랍이 실제로 갈래 묶음을 써서 그린다', () => {
  /* 순수 함수만 검사하면, 그리는 쪽이 그걸 안 쓰고 평평하게 뿌려도 검사가 통과한다.
     실제로 그 변이(drawerGroups 대신 통째로 한 묶음)를 넣어 보니 아무 검사도 안 걸렸다. */
  const at = source.indexOf('class="mdlist"');
  assert.ok(at > 0, 'mdlist 를 그리는 곳을 찾지 못했습니다');
  const near = source.slice(at, at + 700);
  assert.match(near, /drawerGroups\(list\)/, '서랍이 갈래 묶음을 쓰지 않고 그린다');
  assert.match(near, /drawerCatOpen\(/, '펴고 접는 판정을 쓰지 않는다');
  assert.match(near, /mdcath/, '갈래 머리를 그리지 않는다');
});
