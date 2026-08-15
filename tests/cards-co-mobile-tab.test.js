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
  const fabEl = { style:{} };
  const ctx = {
    state: { tab:'card', view:'list' },
    calls: { toggled: {}, placeholder: '', rendered: 0 },
    $: id => {
      if(id==='tabCard') return { classList: { toggle:(c,on)=>{ ctx.calls.toggled.tabCard = on; } } };
      if(id==='tabBiz')  return { classList: { toggle:(c,on)=>{ ctx.calls.toggled.tabBiz = on; } } };
      if(id==='tabCo')   return { classList: { toggle:(c,on)=>{ ctx.calls.toggled.tabCo = on; } } };
      if(id==='search')  return { set placeholder(v){ ctx.calls.placeholder = v; }, get placeholder(){ return ctx.calls.placeholder; } };
      if(id==='selLabel') return { set textContent(v){ ctx._label=v; } };
      if(id==='fab') return fabEl;
      return null;
    },
    render: () => { ctx.calls.rendered++; }
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(at, end), ctx);
  ctx._fab = fabEl;
  return ctx;
}

test('openCoMobile 은 state.view 를 co 로 바꾸고 state.tab 은 안 건드린다', () => {
  const c = loadTabBlock();
  c.state.tab = 'biz';
  c.openCoMobile();
  assert.equal(c.state.view, 'co');
  assert.equal(c.state.tab, 'biz', 'state.tab 을 건드리면 안 된다 — 갈래가 아니라 화면이다');
  assert.equal(c.calls.rendered, 1);
});

/* (나) [Important] Task 5 리뷰(2026-08-15) — 화면을 오가면 예전에 고른 것이 남아
   엉뚱한 회사에 폴더·탭이 붙을 수 있었다. setTab·openCoMobile 둘 다 고른 것과
   편집 모드를 푸는지 확인한다. */
test('openCoMobile 은 골라 둔 명함·회사와 편집 모드를 비운다', () => {
  const c = loadTabBlock();
  c.state.sel = { a:1 }; c.state.coSel = { b:1 }; c.state.selMode = true;
  c.openCoMobile();
  assert.deepEqual(JSON.parse(JSON.stringify(c.state.sel)), {});
  assert.deepEqual(JSON.parse(JSON.stringify(c.state.coSel)), {});
  assert.equal(c.state.selMode, false);
  assert.equal(c._label, '편집');
  assert.equal(c._fab.style.display, '');
});

test('setTab 은 골라 둔 명함·회사와 편집 모드를 비운다', () => {
  const c = loadTabBlock();
  c.state.sel = { a:1 }; c.state.coSel = { b:1 }; c.state.selMode = true;
  c.setTab('card');
  assert.deepEqual(JSON.parse(JSON.stringify(c.state.sel)), {});
  assert.deepEqual(JSON.parse(JSON.stringify(c.state.coSel)), {});
  assert.equal(c.state.selMode, false);
  assert.equal(c._label, '편집');
  assert.equal(c._fab.style.display, '');
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
});

/* 탭 «켜짐» 표시는 이제 setTab·openCoMobile 이 직접 칠하지 않고, render() 가 부르는
   syncMobileTabs() 가 상태(state.view/state.tab)에서 끌어내 그린다 — ☰ 자료함·메일을
   닫고 나오는 길처럼 setTab/openCoMobile 을 안 거치고 화면만 바뀌는 경로에서도
   탭 표시가 어긋나지 않게 하려는 것이다. 아래는 그 seam(syncMobileTabs) 을 직접 테스트한다. */
function loadSyncBlock(){
  const at = source.indexOf('function syncMobileTabs(){');
  const end = source.indexOf('\n}', at) + 2;
  assert.ok(at > 0 && end > at + 2, 'syncMobileTabs 를 찾지 못했습니다');
  const ctx = {
    state: { tab:'card', view:'list' },
    toggled: {},
    $: id => {
      if(id==='tabCard') return { classList: { toggle:(c,on)=>{ ctx.toggled.tabCard = on; } } };
      if(id==='tabBiz')  return { classList: { toggle:(c,on)=>{ ctx.toggled.tabBiz = on; } } };
      if(id==='tabCo')   return { classList: { toggle:(c,on)=>{ ctx.toggled.tabCo = on; } } };
      return null;
    }
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(at, end), ctx);
  return ctx;
}

test('syncMobileTabs — 기업 상세 화면이면 tabCo 만 켜진다', () => {
  const c = loadSyncBlock();
  c.state.view = 'co'; c.state.tab = 'biz';
  c.syncMobileTabs();
  assert.equal(c.toggled.tabCo, true);
  assert.equal(c.toggled.tabCard, false);
  assert.equal(c.toggled.tabBiz, false);
});

test('syncMobileTabs — 명함 탭이면 tabCard 만 켜진다', () => {
  const c = loadSyncBlock();
  c.state.view = 'list'; c.state.tab = 'card';
  c.syncMobileTabs();
  assert.equal(c.toggled.tabCard, true);
  assert.equal(c.toggled.tabBiz, false);
  assert.equal(c.toggled.tabCo, false);
});

test('syncMobileTabs — 사업자 탭이면 tabBiz 만 켜진다', () => {
  const c = loadSyncBlock();
  c.state.view = 'list'; c.state.tab = 'biz';
  c.syncMobileTabs();
  assert.equal(c.toggled.tabBiz, true);
  assert.equal(c.toggled.tabCard, false);
  assert.equal(c.toggled.tabCo, false);
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

/* 위 테스트는 render() 소스 문자열을 정규식으로만 훑는다 — syncMobileTabs() 호출을
   실수로 지워도 이 정규식들은 여전히 통과한다(render 는 이미 renderCoMobileList 와
   state.view==='co' 를 다른 이유로 담고 있다). 실제로 render() 를 실행해서 탭 «켜짐»
   표시가 그 실행의 결과로 바뀌는지까지 증명해야 render() 가 syncMobileTabs() 를
   부른다는 사실 자체가 지켜진다. syncMobileTabs() 도 실제 소스를 그대로 잘라 함께
   실행해, 두 함수가 이어지는 사슬 전체를 검증한다. */
function loadRenderBlock(){
  const syncAt = source.indexOf('function syncMobileTabs(){');
  const syncEnd = source.indexOf('\n}', syncAt) + 2;
  assert.ok(syncAt > 0 && syncEnd > syncAt + 2, 'syncMobileTabs 를 찾지 못했습니다');
  const renderAt = source.indexOf('function render(){');
  const renderEnd = source.indexOf('\n', renderAt);
  assert.ok(renderAt > 0 && renderEnd > renderAt, 'render 를 찾지 못했습니다');

  const fns = source.slice(syncAt, syncEnd) + '\n' + source.slice(renderAt, renderEnd);

  const ctx = {
    _quiet: false,
    state: { tab:'card', view:'list' },
    calls: { saveLastScreen:0, renderCoMobileList:0, renderSubbar:0, renderSidebar:0, renderList:0 },
    toggled: {},
    saveLastScreen: () => { ctx.calls.saveLastScreen++; },
    renderCoMobileList: () => { ctx.calls.renderCoMobileList++; },
    renderSubbar: () => { ctx.calls.renderSubbar++; },
    renderSidebar: () => { ctx.calls.renderSidebar++; },
    renderList: () => { ctx.calls.renderList++; },
    $: id => {
      if(id==='tabCard') return { classList: { toggle:(c,on)=>{ ctx.toggled.tabCard = on; } } };
      if(id==='tabBiz')  return { classList: { toggle:(c,on)=>{ ctx.toggled.tabBiz = on; } } };
      if(id==='tabCo')   return { classList: { toggle:(c,on)=>{ ctx.toggled.tabCo = on; } } };
      return null;
    }
  };
  vm.createContext(ctx);
  vm.runInContext(fns, ctx);
  return ctx;
}

test('★ render() 를 실제로 실행하면 syncMobileTabs() 가 불려 tabCo 켜짐이 바뀐다 (기업 상세 화면)', () => {
  const c = loadRenderBlock();
  c.state.view = 'co'; c.state.tab = 'biz';
  c.render();
  assert.equal(c.toggled.tabCo, true, 'render() 실행 결과로 tabCo 가 켜져야 한다');
  assert.equal(c.toggled.tabCard, false);
  assert.equal(c.toggled.tabBiz, false);
  assert.equal(c.calls.renderCoMobileList, 1);
  assert.equal(c.calls.renderSubbar, 0, '기업 상세 화면이면 renderSubbar 전에 돌아가야 한다');
  assert.equal(c.calls.renderSidebar, 0);
  assert.equal(c.calls.renderList, 0);
});

test('★ render() 를 실제로 실행하면 syncMobileTabs() 가 불려 tabCard 켜짐이 바뀐다 (명함 목록 화면)', () => {
  const c = loadRenderBlock();
  c.state.view = 'list'; c.state.tab = 'card';
  c.render();
  assert.equal(c.toggled.tabCard, true, 'render() 실행 결과로 tabCard 가 켜져야 한다');
  assert.equal(c.toggled.tabBiz, false);
  assert.equal(c.toggled.tabCo, false, 'render() 실행 결과로 tabCo 는 꺼져야 한다');
  assert.equal(c.calls.renderCoMobileList, 0);
  assert.equal(c.calls.renderSubbar, 1);
  assert.equal(c.calls.renderSidebar, 1);
  assert.equal(c.calls.renderList, 1);
});
