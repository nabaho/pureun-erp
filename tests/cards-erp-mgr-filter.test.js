/* 명함첩 — 「담당」 열의 담당 노무사로 걸러 보기.
   실행: node --test tests/*.test.js

   대표 지시 2026-08-11: 표의 「담당」 배지(「급여 김보람」)를 눌러 그 사람이 맡은
   명함만 보게 해 달라.

   여기서 못 박는 것은 **부담당으로 맡은 업체가 빠지지 않는 것**이다.
   배지에 적히는 글자(ErpMatch.label)는 「김보람 +2」처럼 짧게 줄인 것이라,
   그것으로 걸러내면 ① 「+2」가 이름에 섞이고 ② 부담당 이름은 아예 없어서
   부담당으로 맡은 업체가 통째로 사라진다. 걸러낼 때는 mgrs() 를 써야 한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

/* ErpMatch 를 소스에서 그대로 떠와 돌린다 — 베낀 코드로 검사하면 뜻이 없다 */
function loadErp(){
  const a = src.indexOf('\nconst ErpMatch = {');
  assert.ok(a >= 0, 'ErpMatch 를 찾을 수 없습니다');
  const b = src.indexOf('\n};', a);
  assert.ok(b > a, 'ErpMatch 끝을 찾을 수 없습니다');
  const ctx = { console, Object, Array, String, Number, JSON, Set, Date, Math, RegExp };
  ctx.render = () => {};
  ctx.firebase = undefined;
  vm.createContext(ctx);
  /* ⚠ `const ErpMatch = {…}` 는 vm 안에서 **전역 속성이 되지 않는다**(렉시컬 선언).
     그래서 밖으로 꺼내는 한 줄을 붙여 준다. 안 붙이면 undefined 가 온다. */
  vm.runInContext(src.slice(a, b + 3) + '\nthis.__E = ErpMatch;', ctx);
  const E = ctx.__E;
  assert.ok(E && typeof E.mgrs === 'function', 'ErpMatch.mgrs 를 못 가져왔습니다');
  E.ready = true;
  E.byBiz = {}; E.byName = {};
  return E;
}

/* ⚠ vm 안에서 만든 배열은 바깥과 **다른 Array.prototype** 을 쓴다.
   deepStrictEqual 은 그것까지 견주므로 값이 같아도 틀렸다고 한다 — JSON 을 한 번 거친다. */
const same = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg);

/* 업체 하나를 ErpMatch 에 심는다 (load() 가 만드는 모양과 같게) */
function put(E, co){
  const rec = { company: co.name || '', main: co.main || '', subs: co.subs || [],
    type: co.type || '', status: '', left: false, contact: '', ceoRaw: '', ceo2Raw: '',
    contactsRaw: [], ceo: '', ceo2: '', contacts: [], bizNo: co.bizNo || '' };
  const b = E._digits(co.bizNo || '');
  if (b.length >= 10) E.byBiz[b] = rec;
  const n = E._norm(co.name || '');
  if (n) E.byName[n] = rec;
  return rec;
}

test('맡은 노무사를 주담당·부담당 모두 돌려준다', () => {
  const E = loadErp();
  put(E, { name: '가나상사', type: '급여', main: '김보람', subs: ['홍길동', '이영수'] });
  same(E.mgrs({ company: '가나상사' }), ['김보람', '홍길동', '이영수']);
});

test('★ 배지 글자로 걸러내면 부담당이 빠진다 — 그래서 mgrs 를 쓴다', () => {
  /* label 은 「김보람 +2」다. 이것으로 견주면 홍길동이 맡은 업체를 못 찾는다. */
  const E = loadErp();
  put(E, { name: '가나상사', type: '급여', main: '김보람', subs: ['홍길동', '이영수'] });
  const it = { company: '가나상사' };
  assert.equal(E.label(it), '김보람 +2', '배지 글자는 이름이 아니다');
  assert.ok(!E.label(it).includes('홍길동'));
  assert.ok(E.mgrs(it).includes('홍길동'), '부담당이 빠졌습니다');
});

test('주담당이 없고 부담당만 있어도 찾는다', () => {
  const E = loadErp();
  put(E, { name: '다라상사', type: '자문', main: '', subs: ['박은비'] });
  same(E.mgrs({ company: '다라상사' }), ['박은비']);
});

test('업체관리에 없는 명함은 맡은 사람이 없다', () => {
  const E = loadErp();
  same(E.mgrs({ company: '모르는회사' }), []);
  same(E.mgrs(null), []);
});

test('빈 이름·공백은 버린다 — 「담당 (빈칸)」 같은 조건이 생기면 안 된다', () => {
  const E = loadErp();
  put(E, { name: '마바상사', type: '급여', main: '  ', subs: ['', '  ', '최수현'] });
  same(E.mgrs({ company: '마바상사' }), ['최수현']);
});

test('사업자번호로도 찾는다 (상호 표기가 달라도)', () => {
  const E = loadErp();
  put(E, { name: '주식회사 사바', type: '기금', main: '김보람', bizNo: '123-45-67890' });
  same(E.mgrs({ company: '전혀다른이름', bizno: '1234567890' }), ['김보람']);
});

/* ══════ 화면이 이 층을 제대로 쓰는지 ══════ */

const app = src;
function fnBody(name){
  let i = app.indexOf('\nfunction ' + name + '(');
  if (i < 0) i = app.indexOf('\nasync function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const j = app.indexOf('\n}', i);
  return app.slice(i, j + 2);
}

test('목록 걸러내기가 mgrs 로 견준다 — label 로 견주면 부담당이 빠진다', () => {
  const fn = fnBody('listItems');
  assert.match(fn, /state\.erpMgr/, '담당 노무사 조건을 안 봅니다');
  assert.match(fn, /ErpMatch\.mgrs\(it\)/, '배지 글자로 견주고 있습니다');
});

test('「담당」 배지를 누르면 걸러진다 — 줄 클릭과 겹치지 않게 막는다', () => {
  const fn = fnBody('renderPCTable');
  assert.match(fn, /filterErpMgr\(/, '배지가 안 눌립니다');
  assert.match(fn, /event\.stopPropagation\(\);filterErpMgr/, '누르면 상세보기까지 함께 열립니다');
  /* 배지에 적힌 짧은 글자가 아니라 주담당 이름을 넘겨야 한다 */
  assert.match(fn, /ErpMatch\.mgrs\(it\)\[0\]/, '배지 글자를 조건으로 넘기고 있습니다');
});

test('같은 것을 다시 누르면 풀리고, 페이지와 고른 것을 되돌린다', () => {
  const fn = fnBody('filterErpMgr');
  assert.match(fn, /state\.erpMgr===v\) \? '' : v/, '다시 눌러도 안 풀립니다');
  assert.match(fn, /state\.page = 0/, '3쪽을 보던 중에 걸면 「없습니다」가 뜹니다');
  assert.match(fn, /state\.sel = \{\}/, '안 보이게 된 명함이 골라진 채 남습니다');
});

test('걸어 둔 조건이 화면에 띠로 보이고 ✕ 로 풀린다', () => {
  const fn = fnBody('renderPCTable');
  assert.match(fn, /mgrchip/, '걸린 조건이 화면에 안 보입니다');
  assert.match(fn, /filterErpMgr\(''\)/, '푸는 길이 없습니다');
  assert.match(app, /\.mgrchip\{/, '띠 모양이 없습니다');
});

test('「좁혀졌다」 판단과 사람 말 요약에 담당이 들어간다', () => {
  /* 안 넣으면 「→ 전체 모두」가 담당 조건을 무시하고 6천 건을 고른다. */
  assert.match(fnBody('listNarrowed'), /state\.erpMgr/, '조건이 걸렸는데 안 좁혀진 것으로 봅니다');
  assert.match(fnBody('narrowLabel'), /state\.erpMgr/, '무엇을 고르는지 말해 주지 않습니다');
});

test('폴더를 옮기거나 「전체 보기」를 누르면 담당 조건이 풀린다', () => {
  /* 안 풀리면 다른 폴더로 갔는데 조건이 남아 「명함이 없다」로 보인다. */
  const side = fnBody('renderPCSide');
  assert.match(side, /state\.erpMgr=''/, '폴더를 옮겨도 조건이 남습니다');
  assert.match(app, /state\.erpFilter=''; state\.erpMgr=''; state\.colFilter=\{\}/, '「전체 보기」가 조건을 안 풉니다');
});

test('탭으로 저장·되살릴 때도 담당이 함께 간다', () => {
  /* 지문(sig)에 안 넣으면 담당만 다른 두 탭이 같은 것으로 읽혀 하나가 사라진다. */
  assert.match(app, /erpMgr: state\.erpMgr\|\|''/, '탭에 담당을 안 담습니다');
  assert.match(app, /f\.erpMgr\|\|'',/, '탭 지문에 담당이 빠졌습니다');
  assert.match(app, /state\.erpMgr=f\.erpMgr\|\|''/, '탭을 되살릴 때 담당이 빠집니다');
});
