/* 명함첩 — ⚠중복 판정을 매번 다시 하지 않고 기억해 둔다.
   실행: node --test tests/*.test.js

   대표 지시 2026-08-16: "명함 느린지 확인" → 재 보니 PC 명함 표는 1줄만 그려도 86ms,
   100줄 그려도 63ms 였다. 줄 수와 상관없는 «고정비»가 지배했고, 그 대부분이 표를
   그릴 때마다 6,270장을 다시 판정하는 중복 검사(64ms)였다. 네모 하나 누를 때마다
   그만큼 멈췄다.

   ★ 어떻게 고쳤나
     「언제 다시 세야 하는가」를 손으로 정하지 않았다. 저장·삭제·합치기·남의 PC에서
     들어온 수정까지 빠짐없이 짚어야 하는데, 한 곳만 놓치면 ⚠중복 딱지가 «조용히
     틀린 채» 남는다. 틀린 딱지는 없느니만 못하다 — 멀쩡한 명함을 합치기 화면으로 부른다.
     대신 판정에 쓰이는 값만 이어붙여 견준다. 값이 그대로면 답도 그대로다(5ms).

   ★ 여기서 못 박는 것
     ① 판정에 쓰이는 칸이 하나라도 바뀌면 반드시 다시 센다 (틀린 딱지 금지)
     ② 아무것도 안 바뀌었으면 다시 세지 않는다 (느려지면 고친 뜻이 없다)
     ③ 기억해 두는 것과 «다르게 판정하는 것»은 다르다 — 답은 옛 함수 그대로다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

/* 몇 번 진짜로 셌는지 세어 준다 */
function load(){
  const a = '/* ══════ 중복 판정 다시 하기 — 순수 로직 (테스트 대상) ══════';
  const b = '\nlet _dupMemo';
  const i = src.indexOf(a);
  assert.ok(i >= 0, '시작 표식 못찾음');
  const j = src.indexOf(b, i);
  assert.ok(j > i, '끝 표식 못찾음');
  const end = src.indexOf('\n}', src.indexOf('function dupIdSetCached', j)) + 2;
  const ctx = { console, Object, Array, String, Number, Math, JSON, Set };
  ctx.calls = 0;
  vm.createContext(ctx);
  /* 진짜 판정은 흉내만 낸다 — 여기서 볼 것은 «몇 번 부르는가» 다 */
  vm.runInContext(
    'function dupIdSet(items, ignore){ calls++; return new Set((items||[]).map(it=>it.id)); }\n'
    + src.slice(i, end), ctx);
  return ctx;
}

const card = (id, o) => Object.assign({ id, kind: 'card', name: '홍길동', company: '(주)한빛기계',
  mobile: '010-1111-2222', email: 'a@b.kr', bizno: '' }, o || {});

/* ══════ 안 바뀌었으면 다시 세지 않는다 ══════ */

test('같은 자료를 두 번 물으면 한 번만 센다', () => {
  const C = load();
  const list = [card('a'), card('b', { name: '김철수' })];
  C.dupIdSetCached(list, new Set());
  C.dupIdSetCached(list, new Set());
  assert.equal(C.calls, 1);
});

test('목록을 새로 만들어 담아도(같은 값이면) 다시 세지 않는다', () => {
  /* 화면을 다시 그릴 때마다 Object.values() 로 «새 배열»이 만들어진다.
     배열이 다르다고 다시 세면 고친 뜻이 하나도 없다. */
  const C = load();
  C.dupIdSetCached([card('a'), card('b')], new Set());
  C.dupIdSetCached([card('a'), card('b')], new Set());
  assert.equal(C.calls, 1);
});

test('열 번을 물어도 한 번만 센다', () => {
  const C = load();
  for (let i = 0; i < 10; i++) C.dupIdSetCached([card('a'), card('b')], new Set());
  assert.equal(C.calls, 1);
});

/* ══════ 바뀌면 반드시 다시 센다 ══════ */

test('판정에 쓰이는 칸이 바뀌면 다시 센다 — 틀린 딱지가 남으면 안 된다', () => {
  /* itemKeys/rowKeys 가 보는 칸: 휴대폰·이메일·이름·상호(명함), 사업자번호(사업자) */
  const fields = [
    ['name', '박은비'], ['company', '대성물산(주)'], ['mobile', '010-9999-8888'],
    ['email', 'z@z.kr'], ['bizno', '214-82-05236'], ['kind', 'biz']
  ];
  fields.forEach(([f, v]) => {
    const C = load();
    C.dupIdSetCached([card('a'), card('b')], new Set());
    const changed = [card('a', { [f]: v }), card('b')];
    C.dupIdSetCached(changed, new Set());
    assert.equal(C.calls, 2, f + ' 를 고쳤는데 다시 안 셌다');
  });
});

test('명함이 늘거나 줄면 다시 센다', () => {
  const C = load();
  C.dupIdSetCached([card('a')], new Set());
  C.dupIdSetCached([card('a'), card('b')], new Set());
  assert.equal(C.calls, 2);
  C.dupIdSetCached([card('a')], new Set());
  assert.equal(C.calls, 3);
});

test('「중복 아님」으로 적어 두면 다시 센다 — 답이 달라지기 때문', () => {
  const C = load();
  const list = [card('a'), card('b')];
  C.dupIdSetCached(list, new Set());
  C.dupIdSetCached(list, new Set(['a|b']));
  assert.equal(C.calls, 2);
});

test('「중복 아님」 차례만 다르면 다시 세지 않는다', () => {
  /* Set 의 담긴 차례는 들쭉날쭉하다. 그것 때문에 매번 다시 세면 안 된다. */
  const C = load();
  const list = [card('a'), card('b')];
  C.dupIdSetCached(list, new Set(['x|y', 'a|b']));
  C.dupIdSetCached(list, new Set(['a|b', 'x|y']));
  assert.equal(C.calls, 1);
});

test('명함 차례가 바뀌면 다시 센다 — 안전한 쪽으로', () => {
  /* 차례가 답을 바꾸지는 않지만, 「같다」고 우기다 틀리는 것보다 한 번 더 세는 편이 낫다. */
  const C = load();
  C.dupIdSetCached([card('a'), card('b')], new Set());
  C.dupIdSetCached([card('b'), card('a')], new Set());
  assert.equal(C.calls, 2);
});

/* ══════ 값이 붙어 헷갈리지 않는다 ══════ */

test('칸 사이를 가르지 않아 생기는 헷갈림이 없다', () => {
  /* 가름 글자가 없으면 이름「김철」+상호「수한빛」과 이름「김철수」+상호「한빛」이
     같은 글자가 되어, 서로 다른 자료를 「안 바뀌었다」고 잘못 읽는다. */
  const C = load();
  const A = [card('a', { name: '김철', company: '수한빛' })];
  const B = [card('a', { name: '김철수', company: '한빛' })];
  assert.notEqual(C.dupCacheKey(A, new Set()), C.dupCacheKey(B, new Set()));
});

test('빈 칸과 없는 칸을 같게 본다 — 뜻이 같으면 다시 셀 이유가 없다', () => {
  const C = load();
  const A = [{ id: 'a', kind: 'card', name: '홍길동' }];
  const B = [{ id: 'a', kind: 'card', name: '홍길동', company: '', mobile: '', email: '', bizno: '' }];
  assert.equal(C.dupCacheKey(A, new Set()), C.dupCacheKey(B, new Set()));
});

test('목록이 없어도 터지지 않는다', () => {
  const C = load();
  assert.equal(typeof C.dupCacheKey(null, new Set()), 'string');
  assert.equal(typeof C.dupCacheKey([], null), 'string');
});

/* ══════ 답은 옛 함수 그대로 ══════ */

test('기억해 두기가 판정 방법을 바꾸지 않는다', () => {
  const C = load();
  const got = C.dupIdSetCached([card('a'), card('b')], new Set());
  assert.deepEqual([...got].sort(), ['a', 'b'], '흉내낸 판정 결과를 그대로 돌려줘야 한다');
});

test('두 번째부터는 처음 준 것과 같은 답을 준다', () => {
  const C = load();
  const list = [card('a'), card('b')];
  const first = C.dupIdSetCached(list, new Set());
  const again = C.dupIdSetCached(list, new Set());
  assert.equal(first, again, '기억해 둔 그 답을 그대로 줘야 한다');
});

/* ══════ 화면에 실제로 걸려 있는가 ══════ */

test('명함 표가 기억해 두는 쪽을 쓴다', () => {
  const i = src.indexOf('function renderPCTable(){');
  const fn = src.slice(i, i + 900);
  assert.ok(fn.includes('dupIdSetCached('), '표가 아직 매번 다시 센다');
});

test('판정 칸 목록이 rowKeys·itemKeys 와 어긋나지 않는다', () => {
  /* 그쪽에 칸을 더하고 여기에 안 더하면, 그 칸만 고쳤을 때 딱지가 안 따라온다. */
  const keyFn = src.slice(src.indexOf('function rowKeys(r){'), src.indexOf('function buildKeyMap('))
    + src.slice(src.indexOf('function itemKeys(it){'), src.indexOf('function findDupGroups('));
  const cacheFn = src.slice(src.indexOf('function dupCacheKey('), src.indexOf('let _dupMemo'));
  ['mobile', 'email', 'name', 'company', 'bizno'].forEach(f => {
    assert.ok(keyFn.includes(f), 'rowKeys/itemKeys 가 ' + f + ' 를 안 본다 (검사가 낡았다)');
    assert.ok(cacheFn.includes(f), 'dupCacheKey 가 ' + f + ' 를 안 담는다');
  });
});
