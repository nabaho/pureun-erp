/* 기업정보함 — 네모를 끌어서 여러 개 한 번에 고르기 (명함·사업자·기업 상세).
   실행: node --test tests/*.test.js

   대표 지시 2026-08-17: "사업장 ㅁ 체크할 때 하나씩 하면 힘들다. 마우스로 드래그해서
   한 번에 여러 개 가능하게 해달라. 명함 사업자 모두 한번에 드래그해서 이동·삭제·변경이
   가능하게 해달라."

   ★ 엑셀과 같은 손놀림
     첫 네모를 누른 순간 «켜짐/꺼짐» 중 하나로 정해지고, 끌고 지나가는 줄이 모두 그
     상태가 된다. 지나갈 때마다 뒤집으면 손이 흔들려 같은 줄을 두 번 지날 때 값이
     되돌아간다. 그리고 «처음 누른 줄부터 지금 줄까지 통째로» 다시 칠한다 — 지나간
     줄만 칠하면 너무 내려갔다 되올라올 때 아까 칠한 것이 안 풀린다.

   ★ 여기서 못 박는 것
     ① 위로 끌든 아래로 끌든 같은 범위가 잡힌다
     ② 되올라오면 범위가 «줄어든다»
     ③ 끌 때는 켜짐/꺼짐이 한 가지로 유지된다
     ④ 화면에 보이는 차례를 쓴다 — 안 보이는 줄이 사이에 끼면 안 된다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function load(){
  const a = '/* ══════ 끌어서 여러 개 고르기 — 순수 로직 (테스트 대상) ══════';
  const b = '/* ══════ 끌어서 여러 개 고르기 — 화면 ══════ */';
  const i = src.indexOf(a), j = src.indexOf(b);
  assert.ok(i >= 0 && j > i, '표식을 못찾음');
  const ctx = { console, Object, Array, String, Number, Math };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j), ctx);
  return ctx;
}

const IDS = ['a', 'b', 'c', 'd', 'e'];

/* ══════ ① 범위 잡기 ══════ */

test('아래로 끌면 처음부터 지금까지', () => {
  const C = load();
  assert.deepEqual(C.dragRange(IDS, 'b', 'd'), ['b', 'c', 'd']);
});

test('위로 끌어도 같은 범위 — 방향이 답을 바꾸면 안 된다', () => {
  const C = load();
  assert.deepEqual(C.dragRange(IDS, 'd', 'b'), ['b', 'c', 'd']);
});

test('한 줄만 눌렀다 떼면 그 줄 하나', () => {
  const C = load();
  assert.deepEqual(C.dragRange(IDS, 'c', 'c'), ['c']);
});

test('끝에서 끝까지 끌면 전부', () => {
  const C = load();
  assert.deepEqual(C.dragRange(IDS, 'a', 'e'), IDS);
});

test('목록에 없는 줄을 가리키면 아무것도 안 고른다 — 엉뚱한 범위보다 낫다', () => {
  const C = load();
  /* vm 밖과 안의 Array 는 서로 다른 것이라 빈 배열끼리도 deepEqual 이 안 된다 — 길이로 본다 */
  assert.equal(C.dragRange(IDS, 'b', 'zz').length, 0);
  assert.equal(C.dragRange(IDS, 'zz', 'b').length, 0);
});

test('목록이 없어도 터지지 않는다', () => {
  const C = load();
  assert.equal(C.dragRange(null, 'a', 'b').length, 0);
  assert.equal(C.dragRange([], 'a', 'b').length, 0);
});

/* ══════ ② 되올라오면 줄어든다 ══════ */

test('너무 내려갔다 되올라오면 범위가 줄어든다', () => {
  /* 처음 누른 줄부터 «지금 줄까지» 다시 잡기 때문이다. */
  const C = load();
  assert.deepEqual(C.dragRange(IDS, 'a', 'e'), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(C.dragRange(IDS, 'a', 'c'), ['a', 'b', 'c']);
});

test('실제로 끌었다 되올라온 것을 이어서 해 보면 아귀가 맞는다', () => {
  const C = load();
  const bag = {};
  /* a 를 누르고(켜짐) → e 까지 내려갔다가 → c 로 되올라온다 */
  C.dragApply(bag, ['a'], true);
  C.dragApply(bag, C.dragRange(IDS, 'a', 'e'), true);
  assert.deepEqual(Object.keys(bag).sort(), ['a', 'b', 'c', 'd', 'e']);
  /* 되올라올 때 d·e 는 손으로 풀어 줘야 아귀가 맞는다 — 화면이 그렇게 한다 */
  C.dragApply(bag, ['d', 'e'], false);
  C.dragApply(bag, C.dragRange(IDS, 'a', 'c'), true);
  assert.deepEqual(Object.keys(bag).sort(), ['a', 'b', 'c']);
});

/* ══════ ③ 켜짐/꺼짐 한 가지로 ══════ */

test('켜면 1 이 들어가고, 끄면 «칸 자체»가 사라진다', () => {
  /* 빈 값을 남기면 Object.keys 로 세는 곳들이 안 고른 것까지 센다. */
  const C = load();
  const bag = C.dragApply({}, ['a', 'b'], true);
  assert.deepEqual(JSON.parse(JSON.stringify(bag)), { a: 1, b: 1 });
  C.dragApply(bag, ['a'], false);
  assert.deepEqual(Object.keys(bag), ['b']);
  assert.ok(!('a' in bag), '빈 값이 남았다');
});

test('이미 고른 것 위로 끌어도 뒤집히지 않는다 — 손이 흔들려도 안전하다', () => {
  const C = load();
  const bag = { b: 1 };
  C.dragApply(bag, ['a', 'b', 'c'], true);
  assert.deepEqual(Object.keys(bag).sort(), ['a', 'b', 'c'], 'b 가 꺼졌다');
});

test('끄는 방향으로 끌면 지나간 것이 모두 풀린다', () => {
  const C = load();
  const bag = { a: 1, b: 1, c: 1 };
  C.dragApply(bag, ['a', 'b'], false);
  assert.deepEqual(Object.keys(bag), ['c']);
});

test('꾸러미나 목록이 없어도 터지지 않는다', () => {
  const C = load();
  const same = v => JSON.parse(JSON.stringify(v));
  assert.deepEqual(same(C.dragApply(null, ['a'], true)), { a: 1 });
  assert.deepEqual(same(C.dragApply({ a: 1 }, null, true)), { a: 1 });
});

/* ══════ ④ 화면에 걸린 방식 ══════ */

test('네모 칸에서만 끌기가 시작된다 — 줄 몸통은 폴더로 옮기기가 쓴다', () => {
  /* 같은 자리에서 두 가지가 시작되면 어느 쪽인지 알 수 없다. */
  const starts = src.split('dragSelStart(event,').length - 1;
  assert.equal(starts, 2, '명함 표와 기업 상세 표 두 곳에만 있어야 한다');
  ['card', 'co'].forEach(kind => {
    const i = src.indexOf(`dragSelStart(event,'${kind}'`);
    assert.ok(i > 0, kind + ' 갈래가 안 걸려 있다');
    /* 그 앞 200자 안에 네모 칸(selcell)이 있어야 한다 */
    assert.ok(src.slice(Math.max(0, i - 200), i).includes('selcell'),
      kind + ' 이 네모 칸 밖에서 시작한다');
  });
});

test('줄마다 이름표가 붙어 있다 — 없으면 끌기가 줄을 못 찾는다', () => {
  assert.ok(src.includes('data-selid="${it.id}"'), '명함 줄에 이름표가 없다');
  assert.ok(src.includes('data-selid="${kJs}"'), '기업 상세 줄에 이름표가 없다');
});

test('끄는 동안에는 화면을 통째로 다시 그리지 않는다', () => {
  /* 다시 그리면 마우스가 좇던 줄이 사라져 끌기가 끊기고, 4천 줄이면 칸마다 멈춘다. */
  const i = src.indexOf('function dragSelOver(');
  const fn = src.slice(i, src.indexOf('function dragSelEnd(', i));
  assert.match(fn, /dragPaint\(/, '네모만 칠하지 않는다');
  assert.ok(!/\brender\(\)/.test(fn), '끄는 도중에 통째로 다시 그린다');
});

test('손을 떼면 그때 한 번 다시 그린다 — 개수·도구줄이 갱신돼야 한다', () => {
  const i = src.indexOf('function dragSelEnd(');
  const fn = src.slice(i, src.indexOf('\n/* ── 찾은 결과 전체를', i));
  assert.match(fn, /\.done\(\)/, '떼어도 개수가 안 바뀐다');
  assert.match(fn, /removeEventListener/, '듣던 것을 안 뗀다 — 다음 끌기가 겹친다');
});

test('끄는 동안 글자가 잡히지 않게 막는다', () => {
  assert.match(src, /body\.dragselling\{[^}]*user-select:none/, '끄는 동안 글자가 파랗게 번진다');
  assert.match(src, /document\.body\.classList\.add\('dragselling'\)/);
  assert.match(src, /document\.body\.classList\.remove\('dragselling'\)/);
});

test('줄 끌기(폴더로 옮기기)가 같이 시작되지 않게 막는다', () => {
  const i = src.indexOf('function dragSelStart(');
  const fn = src.slice(i, src.indexOf('function dragSelOver(', i));
  assert.match(fn, /preventDefault\(\)/, '네모를 끌면 줄 끌기가 같이 시작된다');
  assert.match(fn, /ev\.button/, '오른쪽 단추로도 끌린다');
});

test('두 갈래가 각자 «그린 것과 같은 차례»를 쓴다', () => {
  /* 따로 계산하면 화면에 안 보이는 줄이 사이에 끼어 함께 고르진다. */
  const i = src.indexOf('function dragSelCtx(');
  const fn = src.slice(i, src.indexOf('function dragPaint(', i));
  assert.match(fn, /\.cotbl \[data-selid\]/, '기업 상세가 화면 차례를 안 본다');
  assert.match(fn, /#pcTable \[data-selid\]/, '명함 표가 화면 차례를 안 본다');
  assert.match(fn, /state\.coSel/);
  assert.match(fn, /state\.sel/);
});

/* ══════ ⑤ 되올라오면 «실제로» 풀린다 (2026-08-17 잡은 버그) ══════
   범위만 줄이고 꾸러미·화면을 안 되돌려, 5줄까지 끌고 2줄로 되올라와도 5줄이 고른
   채였다. 빠진 줄을 «끌기 전» 상태로 되돌려야 한다 — 그냥 끄면 미리 골라 둔 것까지
   함께 풀린다. */

test('범위에서 빠진 줄을 골라낸다', () => {
  const C = load();
  assert.deepEqual(C.dragDropped(['a', 'b', 'c', 'd'], ['a', 'b']), ['c', 'd']);
  assert.equal(C.dragDropped(['a', 'b'], ['a', 'b', 'c']).length, 0, '늘어날 때는 뺄 것이 없다');
  assert.equal(C.dragDropped(null, null).length, 0);
});

test('빠진 줄은 «끌기 전» 상태로 — 미리 골라 둔 것은 안 풀린다', () => {
  const C = load();
  const before = new Set(['z']);            /* 끌기 전에 이미 골라 두었던 줄 */
  const bag = { z: 1, c: 1, d: 1 };
  C.dragRestore(bag, ['c', 'd', 'z'], before);
  assert.deepEqual(Object.keys(bag), ['z'], '미리 골라 둔 z 가 풀렸거나 c·d 가 남았다');
});

test('끌기 전 상태가 없어도 터지지 않는다', () => {
  const C = load();
  const bag = { a: 1 };
  C.dragRestore(bag, ['a'], null);
  assert.equal(Object.keys(bag).length, 0);
});

test('화면이 실제로 되돌린다 — 함수만 있고 안 부르면 버그가 그대로다', () => {
  const i = src.indexOf('function dragSelOver(');
  const fn = src.slice(i, src.indexOf('function dragSelEnd(', i));
  assert.match(fn, /dragDropped\(_dragSel\.span, span\)/, '빠진 줄을 안 골라낸다');
  assert.match(fn, /dragRestore\(ctx\.bag, gone, _dragSel\.before\)/, '되돌리지 않는다');
  assert.match(fn, /_dragSel\.span = span/, '이번 범위를 안 적어 두면 다음에 못 뺀다');
});

test('끌기 시작할 때 «끌기 전» 상태를 찍어 둔다', () => {
  const i = src.indexOf('function dragSelStart(');
  const fn = src.slice(i, src.indexOf('function dragSelOver(', i));
  assert.match(fn, /new Set\(Object\.keys\(ctx\.bag\)\)/, '찍어 두지 않으면 되돌릴 수 없다');
});
