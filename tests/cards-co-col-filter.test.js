/* 기업정보 열 깔때기 — 유형·담당처럼 값 가짓수가 적은 칸만 골라서 거른다.
   ⚠ 거르는 차례는 coFilteredList() 한 곳에만 둔다. coVisible 이 예전에 따로
     걸러서 정렬(coSorted)이 화면엔 안 먹힌 적이 있다 — 같은 실수를 깔때기에서
     반복하면 안 된다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

test('거르는 차례는 coFilteredList 한 곳에만 있다', () => {
  /* ⚠ 2026-08-27: 두 번째 인자(skipCares)가 붙었다 — 「🏢 거래처 / 🏢 전체」 두 칩이
     저마다 «누르면 몇 곳이 되는지»를 세려면 거래처 거르개만 뺀 목록이 필요하다.
     여기서 지킬 것은 «인자 개수»가 아니라 「거르기가 이 함수 한 곳에 있다」는 것이다. */
  assert.match(source, /function coFilteredList\(skipCol\b/);
  const at = source.indexOf('function coVisible()');
  const fn = source.slice(at, at + 200);
  assert.match(fn, /return coSorted\(coFilteredList\(null\)\)/, 'coVisible 이 coFilteredList 를 안 거친다');
});

test('상호·사업자번호에는 깔때기를 안 둔다 — 회사마다 달라 거를 뜻이 없다', () => {
  const at = source.indexOf('function coListHtml');
  const fn = source.slice(at, source.indexOf('function coToggle', at));
  const nameTh = fn.match(/<th[^>]*onclick="coSortBy\('name'\)"[\s\S]*?<\/th>/)[0];
  const biznoTh = fn.match(/<th[^>]*onclick="coSortBy\('bizno'\)"[\s\S]*?<\/th>/)[0];
  assert.doesNotMatch(nameTh, /cofunnel/);
  assert.doesNotMatch(biznoTh, /cofunnel/);
});

test('유형·담당에는 깔때기가 있다', () => {
  const at = source.indexOf('function coListHtml');
  const fn = source.slice(at, source.indexOf('function coToggle', at));
  const typeTh = fn.match(/<th[^>]*onclick="coSortBy\('type'\)"[\s\S]*?<\/th>/)[0];
  const mgrTh = fn.match(/<th[^>]*onclick="coSortBy\('mgr'\)"[\s\S]*?<\/th>/)[0];
  assert.match(typeTh, /onclick="event\.stopPropagation\(\);openCoColFilter\(event,'type'\)"/);
  assert.match(mgrTh, /onclick="event\.stopPropagation\(\);openCoColFilter\(event,'mgr'\)"/);
});

test('깔때기 안 화살표를 누르면 정렬이 함께 걸리지 않는다', () => {
  /* stopPropagation 이 없으면 <th> 의 정렬 클릭까지 같이 일어난다 */
  const at = source.indexOf('function coListHtml');
  const fn = source.slice(at, source.indexOf('function coToggle', at));
  const typeTh = fn.match(/<th[^>]*onclick="coSortBy\('type'\)"[\s\S]*?<\/th>/)[0];
  assert.match(typeTh, /event\.stopPropagation\(\)/);
});

/* coFilteredList·openCoColFilter·coApplyColFilter 를 실제로 돌려서 증명한다.
   js/pu-doc-file.js 검사와 같은 방식 — 필요한 것만 손으로 쥐여준다. */
function loadColFilterBlock(items){
  const cAt = source.indexOf('function coFilteredList');
  const cEnd = source.indexOf('\nfunction coVisible', cAt);
  const sortAt = source.indexOf('const CO_SORT = {');
  const sortEnd = source.indexOf('\nfunction coSorted', sortAt);
  const oAt = source.indexOf('function openCoColFilter');
  const oEnd = source.indexOf('\nfunction renderCoPage', oAt);

  const calls = { menuHtml: '', menuOpen: false, docClicked: [], closePcDetailCalls: 0 };
  const ctx = {
    state: { coQ:'', coFolder:'', coTag:'', coColFilter:{}, coPick:'' },
    coList: () => items.slice(),
    coTagsOf: () => [],
    esc: s => String(s),
    $: id => ({ set innerHTML(v){ calls.menuHtml = v; }, get innerHTML(){ return calls.menuHtml; },
      style: { set display(v){ calls.menuOpen = (v==='block'); }, left:'', top:'' } }),
    window: { innerWidth: 1200, innerHeight: 800 },
    document: { addEventListener: (t,f) => calls.docClicked.push(t) },
    closeFolderMenu: () => {},
    closePcDetail: () => { calls.closePcDetailCalls++; ctx.state.coPick=''; },
    renderCoPage: () => { calls.rendered = true; },
    setTimeout: (f) => f()
  };
  const code = source.slice(sortAt, sortEnd) + '\n' + source.slice(cAt, cEnd) + '\n' + source.slice(oAt, oEnd);
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx._calls = calls;
  return ctx;
}
const mk = (name, type, mgr) => ({ name, erp: type ? { type, main: mgr||'' } : null, cards:[], docs:0, extra:{} });

test('coFilteredList 는 자기 칸의 깔때기만 빼고 거른다', () => {
  const items = [ mk('가','자문','김혜민'), mk('나','급여','최기운'), mk('다','자문','최기운') ];
  const c = loadColFilterBlock(items);
  c.state.coColFilter = { type:'자문', mgr:'최기운' };
  const skipType = c.coFilteredList('type');
  assert.deepEqual(skipType.map(o=>o.name), ['나','다'], 'type 을 안 뺐다 — mgr(최기운) 조건만 걸려야 한다');
  const skipMgr = c.coFilteredList('mgr');
  assert.deepEqual(skipMgr.map(o=>o.name), ['가','다'], 'mgr 을 안 뺐다 — type 조건만 걸려야 한다');
});

test('coFilteredList(null) 은 모든 칸 깔때기를 다 건다', () => {
  const items = [ mk('가','자문','김혜민'), mk('나','급여','최기운'), mk('다','자문','최기운') ];
  const c = loadColFilterBlock(items);
  c.state.coColFilter = { type:'자문' };
  assert.deepEqual(c.coFilteredList(null).map(o=>o.name), ['가','다']);
});

test('openCoColFilter 는 이 칸의 값과 개수를 센다', () => {
  const items = [ mk('가','자문'), mk('나','급여'), mk('다','자문'), mk('라','') ];
  const c = loadColFilterBlock(items);
  c.openCoColFilter({ clientX:10, clientY:10 }, 'type');
  assert.match(c._calls.menuHtml, /전체 <span class="fmn">4<\/span>/);
  assert.match(c._calls.menuHtml, /자문 <span class="fmn">2<\/span>/);
  assert.match(c._calls.menuHtml, /급여 <span class="fmn">1<\/span>/);
  assert.equal(c._calls.menuOpen, true);
});

test('값이 없는 회사(라)는 깔때기 목록에 안 낀다', () => {
  const items = [ mk('가','자문'), mk('라','') ];
  const c = loadColFilterBlock(items);
  c.openCoColFilter({ clientX:10, clientY:10 }, 'type');
  assert.doesNotMatch(c._calls.menuHtml, />\s*<span class="fmn">/, '빈 값이 목록에 끼면 안 된다');
});

test('coApplyColFilter 는 값을 켜고 pick 을 비운다', () => {
  const c = loadColFilterBlock([]);
  c.coApplyColFilter('type','자문');
  assert.equal(c.state.coColFilter.type, '자문');
  assert.equal(c.state.coPick, '');
  assert.equal(c._calls.rendered, true);
  /* 최종 전체 리뷰 2026-08-14: state.coPick 만 비우고 패널을 안 닫으면, 필터를
     바꿔도 열려 있던 상세 패널이 그대로 남아 걸러진 목록에 없는 회사를 계속
     보여준다 — closePcDetail() 을 실제로 불러야 한다. */
  assert.equal(c._calls.closePcDetailCalls, 1, 'closePcDetail 을 불러 패널도 닫아야 한다');
});

test("coApplyColFilter 에 빈 값을 주면 그 칸 조건을 지운다 — '전체'", () => {
  const c = loadColFilterBlock([]);
  c.state.coColFilter = { type:'자문', mgr:'김혜민' };
  c.coApplyColFilter('type','');
  assert.equal(c.state.coColFilter.type, undefined);
  assert.equal(c.state.coColFilter.mgr, '김혜민', '다른 칸 조건까지 지우면 안 된다');
});
