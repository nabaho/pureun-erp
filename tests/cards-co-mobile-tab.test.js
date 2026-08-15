/* 폰 상단 「기업 상세」 단추 — 겉모습만 탭이고 속으로는 화면(state.view)을 바꾼다.
   ⚠ state.tab 에 'co' 를 넣으면 안 된다(대표 지시 2026-08-12). state.tab 은
     'card'|'biz' 두 값뿐이라고 믿는 자리가 75곳이다 — it.kind===state.tab 은 회사를
     하나도 못 찾고, state.tab==='card'?'명함':'사업자등록증' 은 화면을 「사업자등록증」
     이라 잘못 부른다. PC 기업 상세가 쓰는 state.view==='co' 를 폰도 그대로 쓴다.
     tests/cards-co-info.test.js 가 이 규칙을 지키고 있다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

test('#tabs 에 기업 상세 단추가 있고 openCoMobile 을 부른다', () => {
  const at = source.indexOf('<div id="tabs">');
  const end = source.indexOf('</div>', at);
  const block = source.slice(at, end);
  assert.match(block, /id="tabCo"/, 'tabCo 단추를 찾지 못했습니다');
  assert.match(block, /onclick="openCoMobile\(\)"/);
  assert.match(block, /기업 상세/);
});

test('★ state.tab 에 co 를 끼우지 않았다 (대표 지시 2026-08-12)', () => {
  assert.doesNotMatch(source, /state\.tab==='co'/,
    "state.tab 은 'card'|'biz' 두 값뿐이어야 한다 — 기업 상세는 state.view 로 가른다");
});

test('#search 의 oninput 이 onMobileSearchInput 을 쓴다', () => {
  const at = source.indexOf('id="searchbar"');
  const end = source.indexOf('\n', at);
  assert.match(source.slice(at, end), /oninput="onMobileSearchInput\(this\.value\)"/);
});

function loadTabBlock(){
  const at = source.indexOf('function setTab(tab)');
  const end = source.indexOf('\nfunction toggleSort', at);
  assert.ok(at > 0 && end > at, 'setTab~toggleSort 사이를 찾지 못했습니다');
  const ctx = {
    state: { tab:'card', view:'list' },
    calls: { toggled: {}, placeholder: '', rendered: 0 },
    $: id => {
      if(id==='tabCard') return { classList: { toggle:(c,on)=>{ ctx.calls.toggled.tabCard = on; } } };
      if(id==='tabBiz')  return { classList: { toggle:(c,on)=>{ ctx.calls.toggled.tabBiz = on; } } };
      if(id==='tabCo')   return { classList: { toggle:(c,on)=>{ ctx.calls.toggled.tabCo = on; } } };
      if(id==='search')  return { set placeholder(v){ ctx.calls.placeholder = v; }, get placeholder(){ return ctx.calls.placeholder; } };
      return null;
    },
    render: () => { ctx.calls.rendered++; }
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(at, end), ctx);
  return ctx;
}

test('openCoMobile 은 state.view 를 co 로 바꾸고 state.tab 은 안 건드린다', () => {
  const c = loadTabBlock();
  c.state.tab = 'biz';
  c.openCoMobile();
  assert.equal(c.state.view, 'co');
  assert.equal(c.state.tab, 'biz', 'state.tab 을 건드리면 안 된다 — 갈래가 아니라 화면이다');
  assert.equal(c.calls.toggled.tabCo, true);
  assert.equal(c.calls.toggled.tabCard, false);
  assert.equal(c.calls.toggled.tabBiz, false);
  assert.equal(c.calls.rendered, 1);
});

test('openCoMobile 은 찾기 칸 안내문구를 회사용으로 바꾼다', () => {
  const c = loadTabBlock();
  c.openCoMobile();
  assert.match(c.calls.placeholder, /상호|사업자번호|대표자/);
});

test('명함·사업자 탭으로 돌아가면 기업 상세 화면에서 빠져나온다', () => {
  const c = loadTabBlock();
  c.openCoMobile();
  assert.equal(c.state.view, 'co');
  c.setTab('card');
  assert.equal(c.state.view, 'list', '기업 상세 화면에 머문 채로 명함 탭을 그리면 안 된다');
  assert.equal(c.state.tab, 'card');
  assert.equal(c.calls.toggled.tabCo, false);
  assert.equal(c.calls.toggled.tabCard, true);
});

function loadMobileSearchBlock(){
  const at = source.indexOf('function onMobileSearchInput');
  const end = source.indexOf('\n}', at) + 2;
  const ctx = { state: { view:'list', coQ:'' }, render: () => { ctx.rendered = true; } };
  vm.createContext(ctx);
  vm.runInContext(source.slice(at, end), ctx);
  return ctx;
}

test('onMobileSearchInput 은 기업 상세 화면일 때만 state.coQ 를 채운다', () => {
  const c1 = loadMobileSearchBlock();
  c1.state.view = 'co';
  c1.onMobileSearchInput('대명');
  assert.equal(c1.state.coQ, '대명');
  assert.ok(c1.rendered);

  const c2 = loadMobileSearchBlock();
  c2.state.view = 'list';
  c2.onMobileSearchInput('홍길동');
  assert.equal(c2.state.coQ, '', '명함 화면일 때는 회사 찾기말을 안 건드려야 합니다');
  assert.ok(c2.rendered);
});

test('render 가 기업 상세 화면이면 카드 목록으로 갈라진다', () => {
  const at = source.indexOf('function render(){');
  const end = source.indexOf('\n', at);
  const fn = source.slice(at, end);
  assert.match(fn, /state\.view==='co'/);
  assert.match(fn, /renderCoMobileList\(\)/);
});
