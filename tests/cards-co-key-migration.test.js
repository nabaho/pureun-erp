/* 회사 열쇠가 이름 열쇠(n...)에서 사업자번호 열쇠로 바뀌면, 옛 이름 열쇠에 있던
   folder·tags 가 안 보이게 된다 — 사업자등록증이 나중에 들어온 회사가 이 경우다.
   조용한 배경 쓰기로 옮기지 않는다. 읽을 때 두 열쇠의 값을 합쳐 보여준다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function loadCoEffectiveExtra(){
  const normAt = source.indexOf('const _norm = s =>');
  assert.ok(normAt > 0, '_norm 정의를 찾지 못했습니다');
  const normEnd = source.indexOf('\n', normAt);
  const at = source.indexOf('function coEffectiveExtra');
  assert.ok(at > 0, 'coEffectiveExtra 를 찾지 못했습니다');
  /* coEffectiveExtra 는 coKeyOf 뒤, coList() 앞에 넣는다 — 그 사이만 자른다 */
  const end = source.indexOf('\nfunction coList', at);
  assert.ok(end > at, 'coEffectiveExtra 끝(coList 시작)을 찾지 못했습니다');
  const code = source.slice(normAt, normEnd) + '\n' + source.slice(at, end);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.coEffectiveExtra;
}

test('이름 열쇠와 사업자번호 열쇠가 같은 회사면 옛 기록을 합친다', () => {
  const fn = loadCoEffectiveExtra();
  const map = {
    'n한서정공': { tags:{'2026 통합기술보호지원반':true}, folder:'f1' },
    '3128100001': { docName:'사업자등록증' }
  };
  const r = fn('3128100001', '한서정공', map);
  assert.equal(r.folder, 'f1', '옛 열쇠의 폴더가 안 보인다');
  /* r.tags 는 vm 컨텍스트 안에서 만든 객체라 원형(prototype)이 달라 deepEqual 이
     그대로는 실패한다 — JSON 을 거쳐 원형을 지우고 견준다. */
  assert.deepEqual(JSON.parse(JSON.stringify(r.tags)), {'2026 통합기술보호지원반':true}, '옛 열쇠의 탭이 안 보인다');
  assert.equal(r.docName, '사업자등록증', '새 열쇠의 값이 없어졌다');
});

test('새 열쇠에도 같은 이름의 값이 있으면 새 열쇠가 이긴다', () => {
  /* 사람이 새 열쇠에서 폴더를 다시 정했으면 그것을 따라야 한다 */
  const fn = loadCoEffectiveExtra();
  const map = {
    'n한서정공': { folder:'f1' },
    '3128100001': { folder:'f2' }
  };
  const r = fn('3128100001', '한서정공', map);
  assert.equal(r.folder, 'f2');
});

test('탭은 옛 열쇠·새 열쇠 것을 모두 합친다', () => {
  const fn = loadCoEffectiveExtra();
  const map = {
    'n한서정공': { tags:{'옛탭':true} },
    '3128100001': { tags:{'새탭':true} }
  };
  const r = fn('3128100001', '한서정공', map);
  assert.deepEqual(JSON.parse(JSON.stringify(r.tags)), {'옛탭':true, '새탭':true});
});

test('지금 열쇠가 이미 이름 열쇠면 그대로 돌려준다 — 합칠 상대가 없다', () => {
  const fn = loadCoEffectiveExtra();
  const map = { 'n한서정공': { folder:'f1' } };
  const r = fn('n한서정공', '한서정공', map);
  assert.equal(r.folder, 'f1');
});

test('둘 다 없으면 null', () => {
  const fn = loadCoEffectiveExtra();
  assert.equal(fn('3128100001', '한서정공', {}), null);
});

test('옛 열쇠만 있고 새 열쇠는 없으면 옛 열쇠 것을 그대로', () => {
  const fn = loadCoEffectiveExtra();
  const map = { 'n한서정공': { folder:'f1', docName:'서식' } };
  const r = fn('3128100001', '한서정공', map);
  assert.equal(r.folder, 'f1');
  assert.equal(r.docName, '서식');
});

test('상호에 (주)·띄어쓰기가 있어도 같은 이름 열쇠로 찾는다', () => {
  const fn = loadCoEffectiveExtra();
  const map = { 'n한서정공': { folder:'f1' } };
  const r = fn('3128100001', '(주) 한서정공', map);
  assert.equal(r.folder, 'f1', '_norm 을 안 거쳐 못 찾았다');
});

/* 최종 전체 리뷰 2026-08-14: 사업자번호가 없는 회사는 이름꼴 그대로가 Realtime DB
   열쇠(coInfo/n회사이름/...)가 된다. 이름에 DB 열쇠가 못 쓰는 글자(. # $ [ ] /)가
   있으면 점 등은 그 자리에서 쓰기가 막히고, 슬래시는 딴 경로로 새 버린다 —
   coCleanTagName 이 탭 이름에서 이미 하는 것과 같은 걸 회사 열쇠에도 해야 한다. */
function loadCoKeyOf(){
  const digitsAt = source.indexOf('const digits = s =>');
  assert.ok(digitsAt > 0, 'digits 정의를 찾지 못했습니다');
  const digitsEnd = source.indexOf('\n', digitsAt);
  const normAt = source.indexOf('const _norm = s =>');
  const normEnd = source.indexOf('\n', normAt);
  const at = source.indexOf('const coKeyOf =');
  assert.ok(at > 0, 'coKeyOf 를 찾지 못했습니다');
  const end = source.indexOf('\n', at);
  /* coKeyOf 는 top-level const 라 vm 컨텍스트 프로퍼티로 안 붙는다 — var 로만
     바꿔서 잘라온다(coCleanTagName·coEffectiveExtra 는 function 이라 이 문제가 없다). */
  const keyLine = source.slice(at, end).replace('const coKeyOf', 'var coKeyOf');
  const code = source.slice(digitsAt, digitsEnd) + '\n' + source.slice(normAt, normEnd) + '\n' + keyLine;
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.coKeyOf;
}

test('회사 이름에 DB 열쇠가 못 쓰는 글자(. # $ [ ] /)가 있으면 이름 열쇠에서 뺀다', () => {
  const coKeyOf = loadCoKeyOf();
  assert.doesNotMatch(coKeyOf({ company:'에이.에스.티 산업' }), /\./, '점이 그대로 남으면 안 된다');
  assert.doesNotMatch(coKeyOf({ company:'A#B 지원' }), /#/);
  assert.doesNotMatch(coKeyOf({ company:'C$D 상사' }), /\$/);
  assert.doesNotMatch(coKeyOf({ company:'[대표] 이엔지' }), /[\[\]]/);
  assert.doesNotMatch(coKeyOf({ company:'대한산업 서울/경기' }), /\//,
    '슬래시가 남으면 딴 경로(coInfo/n대한산업서울/경기/folder)로 새 버린다');
});

/* 최종 전체 리뷰 재검토 2026-08-14: loadCoInfo 의 on('value',...) 콜백이 실제로
   renderPC 를 부르는지는 그동안 한 번도 실행해서 증명한 적이 없었다(다른 검사들은
   on: () => {} 로 구독 자체를 흉내만 냈다) — 콜백을 붙잡아 직접 불러서 본다. */
function loadLoadCoInfo(){
  const at = source.indexOf('function loadCoInfo');
  assert.ok(at > 0, 'loadCoInfo 를 찾지 못했습니다');
  const end = source.indexOf('\nconst coKeyOf', at);
  assert.ok(end > at, 'loadCoInfo 끝을 찾지 못했습니다');
  const calls = { pcRendered: 0, coRendered: 0, anyRendered: 0, busted: 0 };
  let onValueCb = null;
  const ctx = {
    _coInfoOn: false,
    _coInfo: {},
    state: { view: 'co' },
    Store: { mode: 'firebase', db: { ref: () => ({ on: (evt, cb) => { onValueCb = cb; } }) } },
    DB_ROOT: 'pucards',
    renderPC: () => { calls.pcRendered++; },
    renderCoPage: () => { calls.coRendered++; },
    /* 2026-08-16 — 회사 목록을 기억해 두게 되면서, 자료가 들어오는 문에서는 반드시
       새로 뽑아야 한다(안 그러면 새 회사정보가 목록에 조용히 안 나타난다). */
    coListBust: () => { calls.busted++; },
    /* 실시간으로 들어온 것은 한 프레임에 한 번으로 묶어 그린다. 여기서는 프레임을
       기다리지 않고 바로 부르는 대역을 쓴다 — 이 검사가 보려는 것은 «누구에게
       맡기는가» 이지 «언제 그리는가» 가 아니다. */
    renderCoSoon: () => { ctx.renderCoAny(); },
    /* Task 6 — loadCoInfo 의 콜백은 이제 state.view 를 직접 안 보고 renderCoAny() 하나에
       위임한다(PC/폰 어느 쪽인지 가리는 것도, 기업정보 화면이 아니면 아무 것도 안 하는
       것도 모두 renderCoAny() 의 몫 — tests/cards-co-render-any.test.js 가 그 분기를
       검사한다). */
    renderCoAny: () => { calls.anyRendered++; }
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(at, end), ctx);
  ctx._calls = calls;
  ctx._fireOnValue = v => onValueCb({ val: () => v });
  return ctx;
}

test('loadCoInfo 의 구독 콜백은 renderPC·renderCoPage 를 직접 안 부르고 renderCoAny 를 부른다', () => {
  const c = loadLoadCoInfo();
  c.loadCoInfo();
  c._fireOnValue({ a: { folder:'f1' } });
  assert.equal(c._calls.anyRendered, 1, 'renderCoAny 를 안 불렀다');
  assert.equal(c._calls.pcRendered, 0, 'renderPC() 를 직접 부르면 안 된다 — renderCoAny() 를 거쳐야 한다');
  assert.equal(c._calls.coRendered, 0, 'renderCoPage 를 부르면 옆줄 숫자가 안 바뀐다');
  assert.equal(c._calls.busted, 1, '새 회사정보가 왔는데 회사 목록을 새로 안 뽑았다');
  assert.deepEqual(JSON.parse(JSON.stringify(c._coInfo)), { a: { folder:'f1' } });
});

test('loadCoInfo 의 구독 콜백은 화면과 상관없이 renderCoAny 하나에 위임한다', () => {
  /* 기업정보 화면이 아니면 아무 것도 다시 그리면 안 된다는 규칙 자체는 여전히 있지만,
     이제 그 가림은 이 콜백이 아니라 renderCoAny() 안에서 한다(폰 기업 상세가 생기며
     PC/폰 판별까지 같이 해야 해서 한 곳으로 모았다, 대표 지시 2026-08-15). */
  const c = loadLoadCoInfo();
  c.state.view = 'list';
  c.loadCoInfo();
  c._fireOnValue({});
  assert.equal(c._calls.anyRendered, 1, 'renderCoAny() 는 화면과 상관없이 항상 불러야 한다');
  assert.equal(c._calls.pcRendered, 0);
  assert.equal(c._calls.coRendered, 0);
});

test('coKeyOf 와 coEffectiveExtra 의 이름 열쇠 계산이 같은 회사에서 어긋나지 않는다', () => {
  /* 둘 다 _norm 하나만 쓰므로 항상 같이 가야 한다 — 따로 고치면 coKeyOf 가 만든
     열쇠를 coEffectiveExtra 가 못 찾는 사고가 난다. */
  const coKeyOf = loadCoKeyOf();
  const fn = loadCoEffectiveExtra();
  const key = coKeyOf({ company:'에이.에스.티 산업' });
  const map = { [key]: { folder:'f1' } };
  const r = fn('3128199999', '에이.에스.티 산업', map);
  assert.equal(r.folder, 'f1', 'coKeyOf 가 만든 열쇠를 coEffectiveExtra 가 못 찾았다');
});
