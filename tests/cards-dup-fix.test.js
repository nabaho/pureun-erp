/* 명함첩 중복 판단 — 배지를 눌러 열리는 팝업의 순수 로직.
   실행: node --test tests/*.test.js

   대표 지시 2026-08-10: "중복 단어 클릭하면 중복 삭제 또는 합치기 등 판단할 수 있는
   부분을 팝업시켜주고 한번에 정리 할 수 있게도."

   여기서 못 박는 것은 **사람이 사라지지 않는 것**이다. 회사 대표이메일을 여럿이
   함께 쓰는 명함을 「중복」이라고 합치면 김철수와 박영희가 한 장이 되고 한 사람이
   휴지통으로 간다. 합친 뒤에는 어느 값이 누구 것이었는지 알 수 없어 되살려도
   원래대로 돌아오지 않는다. 그래서 이름이 엇갈리면 **자동 합치기에서 빠지고**
   화면이 가장 세게 알려야 한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function load(){
  const a = '/* ══════ 중복 판단 — 순수 로직 (테스트 대상) ══════';
  const b = '/* ══════ 중복 판단 — 화면 ══════ */';
  const i = src.indexOf(a), j = src.indexOf(b);
  assert.ok(i >= 0, '시작 표식 못찾음');
  assert.ok(j > i, '끝 표식 못찾음');
  const ctx = { console, Object, Array, String, Number, JSON, Date, Math, RegExp, Set };
  /* 이 층이 쓰는 바깥 함수 둘만 넣어 준다 — 명함첩과 같은 열쇠 기준이어야 한다 */
  ctx.digits = v => String(v==null?'':v).replace(/\D/g,'');
  ctx.rowKeys = r => {
    const ks = []; const d = ctx.digits(r.mobile);
    if (d.length >= 9) ks.push('p'+d);
    if (r.email) ks.push('e'+String(r.email).toLowerCase().trim());
    if (r.name && r.company) ks.push('n'+(r.name+'|'+r.company).toLowerCase().replace(/\s/g,''));
    return ks;
  };
  ctx.itemKeys = it => {
    if (it.kind === 'biz'){ const d = ctx.digits(it.bizno); return d.length >= 10 ? ['b'+d] : []; }
    return ctx.rowKeys(it);
  };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j), ctx);
  return ctx;
}

const same = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg);
const card = (o) => Object.assign({ kind: 'card' }, o);

/* ── 짝 서명 ── */

test('짝 서명은 넣는 순서가 달라도 한 가지 모양이다', () => {
  /* 안 그러면 「중복 아님」을 눌러도 반대 방향에서 다시 겹친 것으로 읽힌다. */
  const C = load();
  assert.equal(C.dupIgnoreKey('b', 'a'), C.dupIgnoreKey('a', 'b'));
});

/* ── 이어지나 ── */

test('휴대폰이 같으면 이어진다', () => {
  const C = load();
  const a = card({ id:'1', name:'김철수', mobile:'010-1111-2222' });
  const b = card({ id:'2', name:'김철수', mobile:'01011112222' });
  assert.equal(C.dupLinked(a, b, new Set()), true, '형식만 달라도 같은 번호다');
});

test('아무 열쇠도 안 겹치면 이어지지 않는다', () => {
  const C = load();
  const a = card({ id:'1', name:'김철수', mobile:'010-1111-2222' });
  const b = card({ id:'2', name:'박영희', mobile:'010-3333-4444' });
  assert.equal(C.dupLinked(a, b, new Set()), false);
});

test('자기 자신과는 이어지지 않는다', () => {
  const C = load();
  const a = card({ id:'1', name:'김철수', mobile:'010-1111-2222' });
  assert.equal(C.dupLinked(a, a, new Set()), false);
});

test('「중복 아님」으로 적어 둔 짝은 이어지지 않는다', () => {
  const C = load();
  const a = card({ id:'1', name:'김철수', email:'info@acme.kr' });
  const b = card({ id:'2', name:'박영희', email:'info@acme.kr' });
  assert.equal(C.dupLinked(a, b, new Set()), true, '적어 두기 전에는 겹친다');
  assert.equal(C.dupLinked(a, b, new Set([C.dupIgnoreKey('1','2')])), false);
});

test('사업자등록증은 사업자번호로만 이어진다', () => {
  const C = load();
  const a = { id:'1', kind:'biz', company:'가나상사', bizno:'123-45-67890' };
  const b = { id:'2', kind:'biz', company:'다른상사', bizno:'1234567890' };
  const c = { id:'3', kind:'biz', company:'가나상사', bizno:'999-99-99999' };
  assert.equal(C.dupLinked(a, b, new Set()), true);
  assert.equal(C.dupLinked(a, c, new Set()), false, '상호가 같아도 번호가 다르면 다른 업체다');
});

/* ── 묶기 ── */

test('이름이 달라도 묶는다 — 사람이 보고 판단해야 한다', () => {
  /* 예전 findDupGroups 는 이름이 엇갈리면 묶음을 아예 버렸다. 그래서 배지는
     붙어 있는데 정리 목록에는 없는 명함이 생겼다. */
  const C = load();
  const items = [
    card({ id:'1', name:'강병준', company:'중진공', email:'crov@kosmes.or.kr' }),
    card({ id:'2', name:'강병철', company:'중진공', email:'crov@kosmes.or.kr' })
  ];
  const g = C.dupGroupsOf(items, new Set());
  assert.equal(g.length, 1);
  assert.equal(g[0].length, 2);
});

test('세 장이 사슬로 이어져도 한 묶음이다', () => {
  /* 1-2는 전화가 같고 2-3은 이메일이 같다 → 셋이 한 사람이다. */
  const C = load();
  const items = [
    card({ id:'1', name:'김철수', mobile:'010-1111-2222' }),
    card({ id:'2', name:'김철수', mobile:'010-1111-2222', email:'kim@a.kr' }),
    card({ id:'3', name:'김철수', email:'kim@a.kr' })
  ];
  const g = C.dupGroupsOf(items, new Set());
  assert.equal(g.length, 1);
  assert.equal(g[0].length, 3);
});

test('겹치지 않는 명함은 묶음에 안 들어간다', () => {
  const C = load();
  const items = [
    card({ id:'1', name:'김철수', mobile:'010-1111-2222' }),
    card({ id:'2', name:'박영희', mobile:'010-3333-4444' }),
    card({ id:'3', name:'이영수', mobile:'010-5555-6666' })
  ];
  same(C.dupGroupsOf(items, new Set()), []);
});

test('열쇠가 아예 없는 명함(이름만)은 묶이지 않는다', () => {
  /* 이름만으로 붙이면 동명이인이 서로를 덮는다. */
  const C = load();
  const items = [card({ id:'1', name:'김철수' }), card({ id:'2', name:'김철수' })];
  same(C.dupGroupsOf(items, new Set()), []);
});

test('한 명함이 든 묶음만 집어낸다', () => {
  const C = load();
  const items = [
    card({ id:'1', name:'김철수', mobile:'010-1111-2222' }),
    card({ id:'2', name:'김철수', mobile:'010-1111-2222' }),
    card({ id:'3', name:'박영희', mobile:'010-3333-4444' }),
    card({ id:'4', name:'박영희', mobile:'010-3333-4444' })
  ];
  same(C.dupGroupFor(items, '3', new Set()).map(x=>x.id).sort(), ['3','4']);
  same(C.dupGroupFor(items, '없는번호', new Set()), [], '없는 명함이면 빈 묶음');
});

/* ── 확실한 중복인가 ── */

test('이름이 하나로 모이면 확실한 중복이다', () => {
  const C = load();
  assert.equal(C.dupSameName([card({name:'김철수'}), card({name:'김 철 수'})]), true, '띄어쓰기는 같은 것으로 본다');
  assert.equal(C.dupSameName([card({name:'김철수'}), card({name:'박영희'})]), false);
});

test('이름이 빈 것은 셈에서 뺀다 — 사업자등록증은 이름 칸이 없다', () => {
  const C = load();
  assert.equal(C.dupSameName([{ name:'' , company:'가나상사'}, { name:'', company:'가나상사'}]), true);
  assert.equal(C.dupSameName([{ name:'김철수'}, { name:''}]), true, '한쪽만 비면 엇갈린 것이 아니다');
});

/* ── 남길 것 ── */

test('기본으로 남길 것은 가장 최근에 고친 것이다', () => {
  const C = load();
  const g = [
    card({ id:'old', updatedAt: 100 }),
    card({ id:'new', updatedAt: 900 }),
    card({ id:'mid', updatedAt: 500 })
  ];
  assert.equal(C.dupPickKeeper(g), 'new');
});

test('고친 때가 없으면 만든 때로 본다', () => {
  const C = load();
  assert.equal(C.dupPickKeeper([card({id:'a', createdAt:1}), card({id:'b', createdAt:2})]), 'b');
  assert.equal(C.dupPickKeeper([]), '', '빈 묶음이어도 터지지 않는다');
});

/* ── 칸별 비교 ── */

const FIELDS = [['name','이름'],['company','회사'],['mobile','휴대폰'],['email','이메일'],['memo','메모']];

test('아무도 안 적은 칸은 표에 넣지 않는다', () => {
  /* 빈 줄만 스무 개면 정작 다른 것이 안 보인다. */
  const C = load();
  const rows = C.dupFieldRows([card({name:'김철수'}), card({name:'김철수'})], FIELDS);
  same(rows.map(r=>r.key), ['name']);
});

test('다 같은 칸은 same', () => {
  const C = load();
  const rows = C.dupFieldRows([card({name:'김철수'}), card({name:'김 철수'})], FIELDS);
  assert.equal(rows[0].state, 'same', '띄어쓰기만 다른 것은 같은 값이다');
});

test('한쪽이 비어 있으면 fill — 합치면 채워진다', () => {
  const C = load();
  const rows = C.dupFieldRows([
    card({ name:'김철수', mobile:'' }),
    card({ name:'김철수', mobile:'010-1111-2222' })
  ], FIELDS);
  const m = rows.find(r=>r.key==='mobile');
  assert.equal(m.state, 'fill');
  same(m.vals, ['', '010-1111-2222']);
});

test('값이 서로 다르면 diff', () => {
  const C = load();
  const rows = C.dupFieldRows([
    card({ name:'김철수', email:'a@x.kr' }),
    card({ name:'김철수', email:'b@x.kr' })
  ], FIELDS);
  assert.equal(rows.find(r=>r.key==='email').state, 'diff');
});

test('이름이 다르면 namediff — 가장 세게 알려야 한다', () => {
  /* 이것을 diff 와 같이 다루면 「값이 조금 다르네」로 읽고 합쳐 버린다. */
  const C = load();
  const rows = C.dupFieldRows([
    card({ name:'강병준', email:'crov@kosmes.or.kr' }),
    card({ name:'강병철', email:'crov@kosmes.or.kr' })
  ], FIELDS);
  assert.equal(rows.find(r=>r.key==='name').state, 'namediff');
  assert.equal(rows.find(r=>r.key==='email').state, 'same');
});

test('세 장이면 값도 세 칸이 나온다', () => {
  const C = load();
  const rows = C.dupFieldRows([
    card({ name:'김철수', mobile:'010-1111-2222' }),
    card({ name:'김철수', mobile:'' }),
    card({ name:'김철수', mobile:'010-1111-2222' })
  ], FIELDS);
  const m = rows.find(r=>r.key==='mobile');
  assert.equal(m.vals.length, 3);
  assert.equal(m.state, 'fill');
});

test('빈 묶음·빈 칸목록이어도 터지지 않는다', () => {
  const C = load();
  same(C.dupFieldRows([], FIELDS), []);
  same(C.dupFieldRows([card({name:'김철수'})], []), []);
});

/* ══════ 화면이 순수 로직을 제대로 부르는지 ══════
   여기서 어긋나면 검사는 다 통과하는데 실제로는 사람이 사라진다. */

const app = src;
/* 함수 본문 하나를 글자로 잘라 온다. async 도 찾는다.
   정규식으로 짜면 [\s\S] 같은 조각이 셸을 거칠 때 깨진다. */
function fnBody(name){
  let i = app.indexOf('\nfunction ' + name + '(');
  if (i < 0) i = app.indexOf('\nasync function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const j = app.indexOf('\n}', i);
  assert.ok(j > i, name + ' 본문의 끝을 찾을 수 없습니다');
  return app.slice(i, j + 2);
}

test('배지는 정리 팝업과 같은 함수로 판정한다', () => {
  /* 예전에는 배지가 열쇠 개수만 세어, 「중복 아님」으로 적어 둔 짝도 배지가 남았다. */
  const fn = fnBody('renderPCTable');
  /* 2026-08-16: 매번 다시 세면 64ms 라 답을 기억해 두는 dupIdSetCached 를 거친다.
     기억해 두는 것과 «다르게 판정하는 것»은 다르다 — 그 함수는 dupIdSet 을 그대로 부른다. */
  assert.match(fn, /dupIdSetCached\(/, '배지가 옛 방식(열쇠 개수)으로 판정합니다');
  assert.match(fn, /dupIgnoreSet\(\)/, '「중복 아님」을 배지가 안 봅니다');
  assert.match(fnBody('dupIdSetCached'), /dupIdSet\(items, ignore\)/,
    '기억해 두는 함수가 정리 팝업과 다른 방법으로 판정하면 안 됩니다');
});

test('배지를 눌러 팝업이 열린다 — 줄 클릭과 겹치지 않게 막는다', () => {
  assert.match(app, /class="dup"[^>]*openDupFix\('\$\{it\.id\}'\)/,
    '배지가 안 눌립니다');
  assert.match(app, /class="dup"[^>]*stopPropagation\(\)/,
    '배지를 누르면 상세보기까지 함께 열립니다');
});

test('자동 합치기는 이름까지 같은 묶음만 건드린다', () => {
  /* 이 줄이 없으면 회사 대표이메일을 함께 쓰는 다른 사람들이 한 장으로 합쳐진다. */
  const fn = fnBody('autoMergeAll');
  assert.match(fn, /dupSameName/, '이름이 엇갈리는 묶음까지 자동으로 합칩니다');
});

test('한 번에 정리 화면은 안전한 것과 사람이 볼 것을 갈라 보여준다', () => {
  const fn = fnBody('openDedup');
  assert.match(fn, /filter\(dupSameName\)/, '확실한 중복을 가려내지 않습니다');
  assert.match(fn, /!dupSameName\(g\)/, '사람이 봐야 할 묶음을 따로 세지 않습니다');
  assert.match(fn, /openDupFix\(/, '사람이 볼 묶음을 팝업으로 열 길이 없습니다');
});

test('합치기는 사람이 고른 것을 바탕으로 삼는다', () => {
  const fn = fnBody('mergeGroup').slice(0, 700);
  assert.match(fn, /keepId/, '고른 것과 무관하게 최근 것을 바탕으로 씁니다');
});

test('지우기는 휴지통을 거친다 — 되돌릴 수 없는 삭제를 만들지 않는다', () => {
  const fn = fnBody('dupFixTrash');
  assert.match(fn, /Store\.del\(/, '휴지통을 거치지 않고 지웁니다');
  assert.match(fn, /confirm\(/, '묻지 않고 지웁니다');
  assert.match(fn, /되살릴/, '되살릴 수 있다는 것을 알리지 않습니다');
});

test('이름이 엇갈리는 묶음을 합칠 때는 한 번 더 묻는다', () => {
  const fn = fnBody('dupFixMerge');
  assert.match(fn, /dupSameName/, '이름이 달라도 말없이 합칩니다');
  assert.match(fn, /confirm\(/, '되묻지 않습니다');
});

test('「중복 아님」은 되돌릴 수 있다', () => {
  assert.match(app, /function openDupIgnored\(/, '적어 둔 목록을 볼 길이 없습니다');
  assert.match(app, /function dupUnignore\(/, '되돌릴 길이 없습니다');
});

test('「중복 아님」은 이 PC에만 남는다 — 서버를 건드리지 않는다', () => {
  const get = fnBody('dupIgnoreSet'), put = fnBody('dupIgnoreSave');
  assert.match(get, /localStorage/);
  assert.match(put, /localStorage/);
  assert.ok(!/Store\.|firebase/.test(get + put), '서버에 씁니다');
});

test('묶음이 셋 이상이면 짝을 모두 적어 둔다', () => {
  /* 하나만 적으면 나머지 짝으로 다시 이어져 배지가 안 사라진다. */
  const fn = fnBody('dupIgnoreAdd');
  assert.match(fn, /for\s*\(let i[\s\S]*for\s*\(let j/, '짝을 하나만 적습니다');
});

test('빠른 길과 짝마다 견주는 길이 같은 답을 낸다', () => {
  /* 「중복 아님」이 없을 때는 열쇠를 나눠 가진 것들을 줄줄이 이어 O(n) 으로 묶는다.
     이 빠른 길이 없으면 한 대표이메일을 1,200장이 함께 쓸 때 72만 번을 견주게 되어
     찾기칸에 글자를 칠 때마다 화면이 걸린다(재 74ms → 4ms).
     빨라지는 대신 답이 달라지면 안 되므로 여기서 두 길을 맞춰 본다.
     상관없는 짝 하나를 넣으면 느린 길로 들어간다 — 묶음은 그대로여야 한다. */
  const C = load();
  const items = [];
  for (let i = 0; i < 40; i++)
    items.push(card({ id: 'a'+i, name:'사람'+i, company:'중진공', email:'info@kosmes.or.kr' }));
  for (let i = 0; i < 10; i++)
    items.push(card({ id: 'b'+i, name:'김철수', company:'가나상사', mobile:'010-1111-2222' }));
  items.push(card({ id:'lone', name:'혼자', company:'혼자상사', mobile:'010-9999-8888' }));

  const shape = gs => gs.map(g => g.map(x=>x.id).sort().join(',')).sort();
  const fast = shape(C.dupGroupsOf(items, new Set()));
  const slow = shape(C.dupGroupsOf(items, new Set(['없는번호1~없는번호2'])));
  same(fast, slow, '빠른 길과 느린 길의 묶음이 다릅니다');
  assert.equal(fast.length, 2, '두 묶음이어야 한다 (혼자는 안 들어간다)');
});
