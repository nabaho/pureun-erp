/* 폰 기업 상세 — 최종 전체 리뷰(2026-08-16)가 잡은 것을 하나씩 못 박는다.
   검사 2,795개가 전부 초록불인데 폰에서 기능이 반쯤 죽어 있었다. 그 이유는 하나다 —
   **화면을 여는 길(진입로)을 실제로 실행해 본 검사가 없었다.** 소스 정규식으로 훑으면
   「renderCoMobileList 라는 글자가 있다」까지만 지켜지고, 「그 화면에 쓸 자료가
   실제로 실려 오는가」는 아무도 안 본다.

   그래서 여기서는 되도록 vm 으로 **함수를 진짜 돌려** 결과를 본다.

   ⚠ vm 함정 세 가지(이 파일도 그대로 밟았다):
     1) 잘라 넣은 조각의 top-level let/const 는 컨텍스트 프로퍼티가 안 된다 —
        _coFolders 같은 것은 ctx 에 미리 얹어 준다.
     2) vm 안에서 만든 객체는 다른 realm 이라 assert.deepEqual 이 실패한다 —
        JSON 왕복으로 순수 값만 견준다.
     3) indexOf('\nfunction ', at) 로 다음 함수를 찾으면 </script> 경계를 넘어
        HTML 까지 삼킨다 — 제 닫는 중괄호(indexOf('\n}', at)+2)에서 끊는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceFn } = require('./fnslice.js');   // 함수를 «통째로» 자른다(줄 수에 안 매인다)

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

/* 진짜 HTML 이스케이프 — no-op 스텁을 쓰면 «esc() 앞에서 따옴표를 벗긴다» 는 규칙이
   지켜지는지 알 수 없다(cards-co-mobile-tab.test.js 와 같은 esc 를 쓴다). */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function slice(name, opener){
  const at = source.indexOf(opener || ('function ' + name));
  assert.ok(at > 0, name + ' 을 찾지 못했습니다');
  const end = source.indexOf('\n}', at) + 2;
  assert.ok(end > at + 2, name + ' 의 끝을 찾지 못했습니다');
  return source.slice(at, end);
}

/* ══════════════════════════════════════════════════════════════════════
   C1 [Critical] 폰 진입로가 회사 자료를 아예 안 불러온다

   loadCoInfo()/loadCoFolders()/loadCoTagHidden() 은 openCoPage() 안에서만 불렸고,
   openCoPage() 는 PC 옆줄 단추(#pcRoot)에만 걸려 있어 폰에서는 도달할 수 없었다.
   폰에서는 _coInfo·_coFolders·_coTagHidden 이 영원히 {} 였다 — 폴더 시트가 텅 비고,
   카드에 📁·탭 딱지가 안 붙고, 새 폴더·탭 담기·이알피 가져오기가 서버에 쓰고
   «성공» 안내까지 띄운 뒤 화면은 그대로였다(구독이 없어 되돌아오는 신호가 없다).

   ★ 이 검사가 없어서 C1 이 초록불로 통과했다. 그러므로 **실제로 실행해서** 세 구독이
     모두 시작되는지 본다 — 소스에 그 글자가 있는지가 아니라.
   ══════════════════════════════════════════════════════════════════════ */
function loadEntryChain(){
  /* setTab~toggleSort 덩어리: setTab · openCoMobile · resetSelOnViewSwitch ·
     syncMobileChrome · syncMobileSearchFor 가 한 덩어리로 들어 있다.
     여기에 진짜 enterCoView 를 이어 붙여 «폰 탭 → 자료 구독» 사슬 전체를 돌린다. */
  const tabAt = source.indexOf('function setTab(tab)');
  const tabEnd = source.indexOf('\nfunction toggleSort', tabAt);
  assert.ok(tabAt > 0 && tabEnd > tabAt, 'setTab~toggleSort 사이를 찾지 못했습니다');

  const started = [];
  const fabEl = { style:{} }, sortEl = { style:{} }, selbarEl = { style:{} };
  const searchEl = { placeholder:'', value:'' };
  const ctx = {
    state: { tab:'card', view:'list', q:'', coQ:'', coPick:'keep-me' },
    calls: { rendered:0, selbar:0 },
    localStorage: { getItem: () => null, setItem(){} },
    $: id => {
      if(id==='search') return searchEl;
      if(id==='fab') return fabEl;
      if(id==='sortBtn') return sortEl;
      if(id==='selbar') return selbarEl;
      if(id==='selLabel') return { set textContent(v){ ctx._label=v; } };
      if(id==='pcMain') return { scrollTop: 99 };
      return { classList: { toggle(){} } };
    },
    render: () => { ctx.calls.rendered++; },
    renderSelbar: () => { ctx.calls.selbar++; },
    loadCoInfo: () => started.push('coInfo'),
    loadCoFolders: () => started.push('coFolders'),
    loadCoTagHidden: () => started.push('coTagHidden')
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(tabAt, tabEnd) + '\n' + slice('enterCoView'), ctx);
  ctx._started = started;
  ctx._search = searchEl;
  ctx._fab = fabEl;
  ctx._sortBtn = sortEl;
  return ctx;
}

test('★★ C1 — openCoMobile() 을 부르면 회사 자료 세 구독이 모두 시작된다', () => {
  const c = loadEntryChain();
  c.openCoMobile();
  assert.deepEqual(JSON.parse(JSON.stringify(c._started)).sort(),
    ['coFolders', 'coInfo', 'coTagHidden'],
    '폰에서 기업 상세로 들어가도 폴더·탭·서류 구독이 시작되지 않습니다 — ' +
    '화면은 그럴듯한데 폴더 시트가 텅 비고, 쓰기 단추가 «성공» 만 띄우고 화면은 그대로가 됩니다');
});

test('★ C1 — openCoMobile() 은 화면도 한 번 그린다(자료만 부르고 마는 것이 아니다)', () => {
  const c = loadEntryChain();
  c.openCoMobile();
  assert.equal(c.state.view, 'co');
  assert.equal(c.calls.rendered, 1, '화면을 두 번 그리거나 아예 안 그리면 안 됩니다');
});

/* 예전에는 여기서 「거래처만」 취향(pucards_co_erponly)이 폰에서도 되살아나는지 함께
   봤다. 그 거르개는 대표 지시 2026-08-17 로 없어졌다 — 되살릴 취향 자체가 없다.
   남은 알맹이(공용 진입로가 고른 회사를 비운다)만 지킨다. */
test('★ C1 — openCoMobile() 도 state.coPick 을 비운다', () => {
  const c = loadEntryChain();
  c.state.coPick = '312-81-49225';
  c.openCoMobile();
  assert.equal(c.state.coPick, '', '예전에 고른 회사가 남으면 엉뚱한 회사 상세가 열립니다');
  assert.equal('coErpOnly' in c.state, false, '없앤 「거래처만」 상태를 되살리면 안 됩니다');
});

test('★ C1 — 두 진입로가 같은 공용 함수 하나를 거친다(베껴 두면 한쪽만 고쳐진다)', () => {
  const mobile = slice('openCoMobile');
  const at = source.indexOf('function openCoPage');
  const pc = source.slice(at, source.indexOf('\n', at) + 1);
  assert.match(mobile, /enterCoView\(\)/, 'openCoMobile 이 공용 진입로를 안 거칩니다');
  assert.match(pc, /enterCoView\(\)/, 'openCoPage 가 공용 진입로를 안 거칩니다');
  /* 자료를 부르는 곳은 그 공용 함수 한 곳뿐이어야 한다 */
  ['loadCoInfo', 'loadCoFolders', 'loadCoTagHidden'].forEach(f=>{
    assert.doesNotMatch(mobile, new RegExp('\\b' + f + '\\('),
      'openCoMobile 이 ' + f + ' 를 따로 부릅니다 — 목록이 두 벌이 되면 한쪽만 고쳐집니다');
    assert.doesNotMatch(pc, new RegExp('\\b' + f + '\\('),
      'openCoPage 가 ' + f + ' 를 따로 부릅니다 — 목록이 두 벌이 되면 한쪽만 고쳐집니다');
  });
});

test('★ C1 — enterCoView 는 PC 전용 뒷정리(pcMain 스크롤)를 안 가져간다', () => {
  /* 폰에는 #pcMain 이 없다. 공용 함수가 그것까지 하면 폰에서 조용히 헛돈다. */
  assert.doesNotMatch(slice('enterCoView'), /pcMain/,
    'PC 전용 동작은 openCoPage 에 남겨 둬야 합니다');
  const at = source.indexOf('function openCoPage');
  assert.match(source.slice(at, source.indexOf('\n', at) + 1), /pcMain/);
});

/* ══════════════════════════════════════════════════════════════════════
   I1 명함 선택 띠(#selbar)가 기업 상세 화면까지 따라온다

   재현: 명함 → ✎ 편집(띠 뜸) → 🏢 기업 상세 → 명함용 띠(🔒 개인 / 공용 / 📁 그룹 이동 /
   삭제)가 회사 목록 위에 그대로 떠 있다. resetSelOnViewSwitch 가 state.selMode 만 풀고
   renderSelbar() 를 안 불렀고, 폰 render() 는 기업 상세면 renderSelbar() 전에 돌아간다.
   ══════════════════════════════════════════════════════════════════════ */
function loadResetWithRealSelbar(){
  /* 진짜 renderSelbar 를 함께 넣는다 — 「불렀다」가 아니라 「띠가 실제로 사라졌다」를 본다 */
  const tabAt = source.indexOf('function setTab(tab)');
  const tabEnd = source.indexOf('\nfunction toggleSort', tabAt);
  const selbarEl = { style:{ display:'flex' }, innerHTML:'' };
  const fabEl = { style:{} }, sortEl = { style:{} };
  const ctx = {
    state: { tab:'card', view:'list', selMode:true, sel:{ a:1 }, coSel:{}, q:'', coQ:'', coPick:'' },
    localStorage: { getItem: () => null, setItem(){} },
    $: id => {
      if(id==='selbar') return selbarEl;
      if(id==='fab') return fabEl;
      if(id==='sortBtn') return sortEl;
      if(id==='selLabel') return { set textContent(v){ ctx._label=v; } };
      if(id==='search') return { placeholder:'', value:'' };
      return null;
    },
    render: () => {},
    loadCoInfo(){}, loadCoFolders(){}, loadCoTagHidden(){}
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(tabAt, tabEnd) + '\n' + slice('renderSelbar')
                  + '\n' + slice('enterCoView'), ctx);
  ctx._selbar = selbarEl;
  return ctx;
}

test('★ I1 — 기업 상세로 옮기면 명함 선택 띠(#selbar)가 실제로 사라진다', () => {
  const c = loadResetWithRealSelbar();
  assert.equal(c._selbar.style.display, 'flex', '준비: 띠가 떠 있는 상태에서 시작한다');
  c.openCoMobile();
  assert.equal(c._selbar.style.display, 'none',
    '명함용 띠(🔒 개인 / 공용 / 📁 그룹 이동 / 삭제)가 회사 목록 위에 그대로 떠 있습니다');
  assert.equal(c.state.selMode, false);
});

test('★ I1 — 명함 탭으로 돌아올 때도 띠가 사라진다', () => {
  const c = loadResetWithRealSelbar();
  c.state.view = 'co';
  c._selbar.style.display = 'flex';
  c.setTab('card');
  assert.equal(c._selbar.style.display, 'none');
});

test('★ I1 — #selbar 를 보이고 숨기는 곳은 여전히 renderSelbar 한 곳이다', () => {
  /* 두 곳에서 style.display 를 만지기 시작하면 다음에 한쪽만 고쳐진다 */
  const reset = slice('resetSelOnViewSwitch');
  assert.match(reset, /renderSelbar\(\)/, 'resetSelOnViewSwitch 가 renderSelbar 를 불러야 합니다');
  assert.doesNotMatch(reset, /\$\('selbar'\)/,
    "resetSelOnViewSwitch 가 #selbar 를 직접 만지면 안 됩니다 — renderSelbar 한 곳에서만 합니다");
});

/* ══════════════════════════════════════════════════════════════════════
   I2 ⇅ 정렬 단추가 이름표만 바뀌고 아무 일도 안 한다

   #subbar 의 ⇅ 는 body.pc 에서만 숨는다 — 폰 기업 상세 화면에도 그대로 보였다.
   toggleSort() 는 state.sort 를 뒤집고 이름표를 「이름순」으로 바꾼 뒤 render() 로 가는데,
   회사 목록은 state.coSort 로 정렬한다. 이름표는 움직이고 목록은 그대로였다.
   고침: 그 화면에서는 단추를 감추고, 눌려도 아무것도 안 바꾼다.
   ══════════════════════════════════════════════════════════════════════ */
function loadSortBlock(view){
  const tabAt = source.indexOf('function setTab(tab)');
  const tabEnd = source.indexOf('\nfunction toggleSort', tabAt);
  const sortFn = slice('toggleSort');
  const sortEl = { style:{} }, fabEl = { style:{} };
  const ctx = {
    state: { tab:'card', view: view, sort:'date', coSort:{ key:'name', dir:'asc' }, selMode:false },
    calls: { rendered:0 },
    label: '등록일순',
    $: id => {
      if(id==='sortLabel') return { set textContent(v){ ctx.label = v; }, get textContent(){ return ctx.label; } };
      if(id==='sortBtn') return sortEl;
      if(id==='fab') return fabEl;
      return null;
    },
    render: () => { ctx.calls.rendered++; }
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(tabAt, tabEnd) + '\n' + sortFn, ctx);
  ctx._sortBtn = sortEl;
  ctx._fab = fabEl;
  return ctx;
}

test('★ I2 — 기업 상세 화면에서 ⇅ 를 눌러도 이름표가 거짓말하지 않는다', () => {
  const c = loadSortBlock('co');
  c.toggleSort();
  assert.equal(c.state.sort, 'date', '회사 목록은 state.coSort 로 정렬한다 — state.sort 를 뒤집어 봐야 헛일이다');
  assert.equal(c.label, '등록일순', '목록은 그대로인데 이름표만 「이름순」으로 바뀌면 «고장난 단추»가 됩니다');
  assert.equal(c.calls.rendered, 0);
});

test('★ I2 — 명함·사업자 화면에서는 ⇅ 가 예전대로 움직인다', () => {
  const c = loadSortBlock('list');
  c.toggleSort();
  assert.equal(c.state.sort, 'name');
  assert.equal(c.label, '이름순');
  assert.equal(c.calls.rendered, 1);
});

test('★ I2 — 기업 상세 화면에서는 ⇅ 단추 자체가 감춰진다', () => {
  const co = loadSortBlock('co');
  co.syncMobileChrome();
  assert.equal(co._sortBtn.style.display, 'none', '누를 수 없는 단추는 보이지도 않아야 합니다');

  const list = loadSortBlock('list');
  list.syncMobileChrome();
  assert.equal(list._sortBtn.style.display, '', '명함 화면에서는 ⇅ 가 그대로 보여야 합니다');
});

test('★ M4 — 기업 상세 화면에서는 ＋ 카메라(#fab)도 감춰진다', () => {
  const co = loadSortBlock('co');
  co.syncMobileChrome();
  assert.equal(co._fab.style.display, 'none',
    '회사 화면에서 ＋ 를 누르면 «명함 추가» 카메라가 열립니다 — 엉뚱한 자리입니다');

  const list = loadSortBlock('list');
  list.syncMobileChrome();
  assert.equal(list._fab.style.display, '');

  /* 편집 모드를 감추는 예전 규칙도 그대로다 */
  const editing = loadSortBlock('list');
  editing.state.selMode = true;
  editing.syncMobileChrome();
  assert.equal(editing._fab.style.display, 'none');
});

test('★ M4 — render() 는 화면이 바뀔 때마다 이 규칙을 다시 적용한다', () => {
  const fn = sliceFn(source, 'function render(){');
  assert.match(fn, /syncMobileChrome\(\)/,
    'render() 가 안 부르면 ☰ 자료함·메일에서 되돌아오는 길처럼 진입로를 안 거치는 경로에서 어긋납니다');
  /* 기업 상세면 renderSubbar 전에 돌아가므로, 그보다 먼저 불려야 한다 */
  assert.ok(fn.indexOf('syncMobileChrome()') < fn.indexOf("state.view==='co'"),
    "기업 상세 갈래(return)보다 먼저 불려야 합니다");
});

/* ══════════════════════════════════════════════════════════════════════
   I3 폴더가 지워지면 「전체 (0)」이라고 거짓말한다

   deleteCoFolder 는 지운 쪽 화면에서만 state.coFolder 를 비운다. 다른 기기(폰)는
   죽은 폴더 id 를 붙들고 있어 목록이 0건이 되는데, 이름표는 (_coFolders[id]||{}).name
   이 비어 「전체」로 떨어졌다 — 「전체인데 0건」이라는 거짓말.
   ══════════════════════════════════════════════════════════════════════ */
function loadCoMobileList(list, folders){
  const calls = { html:'', groupBtnHtml:'' };
  const ctx = {
    esc,
    state: { coSel:{}, selMode:false, coTag:'', coFolder:'' },
    _coFolders: folders || {},
    /* 진짜 coVisible 은 state.coFolder 로도 거른다 — 그 몫만 흉내 낸다.
       (여기서 거르지 않으면 「전체로 되돌리기」가 개수까지 맞추는지 증명할 수 없다) */
    coVisible: () => (ctx.state.coFolder ? list.filter(o=>o.folder===ctx.state.coFolder) : list),
    /* renderCoMobileList 는 이제 쪽 나눠 그리기(coPage)를 거친다 — 여기서는 쪽 나눔이
       관심사가 아니므로 coVisible 결과를 통째로 한 쪽처럼 돌려준다.
       ⚠ coPage() 가 coVisible() 을 거치게 두는 것이 중요하다 — I3 의 「죽은 폴더를
         비운 «뒤에» 개수를 센다」를 이 검사가 계속 지키려면 그 순서가 살아 있어야 한다. */
    coPage: () => { const rows = ctx.coVisible(); return { rows, total:rows.length, page:0, pages:1 }; },
    coPagerHtml: () => '',   /* 쪽 넘김 단추는 이 검사의 관심사가 아니다 */
    coTagsOf: o => Object.keys(o.tags||{}),
    $: id => {
      if(id==='list') return { set innerHTML(v){ calls.html=v; }, get innerHTML(){ return calls.html; } };
      if(id==='groupBtn') return { set innerHTML(v){ calls.groupBtnHtml=v; }, get innerHTML(){ return calls.groupBtnHtml; } };
      return null;
    }
  };
  vm.createContext(ctx);
  vm.runInContext(slice('renderCoMobileList'), ctx);
  ctx._calls = calls;
  return ctx;
}

const CO = (key, name, folder) => ({ key, name, bizno:'', erp:null, folder: folder||'', cards:[], docs:0, tags:{} });

test('★ I3 — 보던 폴더가 다른 기기에서 지워졌으면 「전체 (0)」이라 거짓말하지 않는다', () => {
  const c = loadCoMobileList([CO('k1','대명크라샤'), CO('k2','미래산업')], {});
  c.state.coFolder = 'dead-folder';        /* 폴더는 이미 사라졌다 */
  c.renderCoMobileList();
  assert.equal(c.state.coFolder, '', '사라진 폴더를 붙들고 있으면 안 됩니다');
  assert.match(c._calls.groupBtnHtml, /^전체 \(2\)/,
    '「전체」라고 쓰면서 0건을 보이면 안 됩니다 — 전체로 되돌려 개수까지 맞아야 합니다');
  assert.doesNotMatch(c._calls.html, /회사를 찾지 못했습니다/);
});

test('★ I3 — 살아 있는 폴더는 그대로 그 이름과 개수를 보여준다', () => {
  const c = loadCoMobileList([CO('k1','대명크라샤','f1'), CO('k2','미래산업')],
                             { f1:{ id:'f1', name:'현장클리닉' } });
  c.state.coFolder = 'f1';
  c.renderCoMobileList();
  assert.equal(c.state.coFolder, 'f1');
  assert.match(c._calls.groupBtnHtml, /^현장클리닉 \(1\)/);
});

/* ══════════════════════════════════════════════════════════════════════
   I4 찾기 칸 글자와 실제 거르개가 어긋난다

   재현: 기업 상세에서 「대명」 입력 → 명함 탭 → 「홍길동」 입력 → 기업 상세로 →
   칸에는 「홍길동」이 보이는데 목록은 여전히 「대명」으로 걸러져 있다.
   PC 는 renderPC() 안의 syncPcSearchFor('list') 로 막고 있었다 — 폰에 그것이 없었다.
   ══════════════════════════════════════════════════════════════════════ */
function loadSearchChain(){
  const tabAt = source.indexOf('function setTab(tab)');
  const tabEnd = source.indexOf('\nfunction toggleSort', tabAt);
  const searchEl = { placeholder:'', value:'' };
  const ctx = {
    state: { tab:'card', view:'list', q:'', coQ:'', coPick:'', sel:{}, coSel:{}, selMode:false },
    localStorage: { getItem: () => null, setItem(){} },
    $: id => {
      if(id==='search') return searchEl;
      if(id==='selLabel') return { set textContent(v){} };
      return { style:{}, classList:{ toggle(){} } };
    },
    render: () => {},
    renderSelbar: () => {},
    loadCoInfo(){}, loadCoFolders(){}, loadCoTagHidden(){}
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(tabAt, tabEnd) + '\n' + slice('enterCoView')
                  + '\n' + slice('onMobileSearchInput'), ctx);
  ctx._search = searchEl;
  return ctx;
}

test('★ I4 — 기업 상세 ↔ 명함 탭을 오가도 칸에 보이는 글자와 걸린 거르개가 같다', () => {
  const c = loadSearchChain();

  c.openCoMobile();
  c.onMobileSearchInput('대명');            /* 기업 상세에서 「대명」 */
  assert.equal(c.state.coQ, '대명');

  c.setTab('card');                          /* 명함 탭으로 */
  assert.equal(c._search.value, '', '회사를 찾던 글자가 명함 칸에 그대로 남으면 목록이 조용히 걸러집니다');
  c.onMobileSearchInput('홍길동');
  assert.equal(c.state.q, '홍길동');
  assert.equal(c.state.coQ, '대명', '명함 화면에서 회사 찾기말을 건드리면 안 됩니다');

  c.openCoMobile();                          /* 다시 기업 상세로 */
  assert.equal(c._search.value, '대명',
    '칸에는 「홍길동」이 보이는데 목록은 「대명」으로 걸러져 있는 어긋남이 남아 있습니다');

  c.setTab('card');                          /* 다시 명함으로 */
  assert.equal(c._search.value, '홍길동', '명함 쪽 찾기말이 사라졌습니다');
});

test('★ I4 — 화면에 맞는 안내문구도 함께 바뀐다', () => {
  const c = loadSearchChain();
  c.openCoMobile();
  assert.match(c._search.placeholder, /상호|사업자번호|대표자/);
  c.setTab('card');
  assert.match(c._search.placeholder, /이름/);
  c.setTab('biz');
  assert.match(c._search.placeholder, /상호|사업자번호/);
});

/* ══════════════════════════════════════════════════════════════════════
   I5 폰에서 흰 바탕에 흰 글씨

   폰 --ink 는 #f3f3f3 이고 body.pc .modal 같은 밝은 테마 덮기가 폰에는 없다.
   밝은 바탕(#f7f9fc)인 두 덩어리가 글자색을 안 정해 통째로 안 보였다.
   ══════════════════════════════════════════════════════════════════════ */
function cssRule(selector){
  const at = source.indexOf(selector + '{');
  assert.ok(at > 0, selector + ' 규칙을 찾지 못했습니다');
  return source.slice(at, source.indexOf('}', at) + 1);
}

test('★ I5 — .erphist-card 안 글자에 어두운 색이 정해져 있다 (이알피 이력 칸)', () => {
  const rule = cssRule('.erphist-card');
  assert.match(rule, /background:#f7f9fc/, '전제: 바탕은 밝은 색이다');
  const m = rule.match(/color:(#[0-9a-fA-F]{3,6})/);
  assert.ok(m, '밝은 바탕인데 글자색이 없습니다 — 폰에서 --ink(#f3f3f3)를 물려받아 흰 글씨가 됩니다');
  assert.doesNotMatch(m[1].toLowerCase(), /^#(fff|f{6}|f3f3f3)$/, '밝은 바탕에 밝은 글자입니다');
  /* 제목 span 과 .erphist-fee 는 색을 따로 안 갖는다 — 이 칸에서 물려받는다 */
  assert.match(source, /<span style="font-weight:700">\$\{esc\(typeLabel\)\}<\/span>/,
    '이력 카드 제목 span 을 찾지 못했습니다');
});

test('★ I5 — .erpimport-row 안 사업 이름에 어두운 색이 정해져 있다 (이알피에서 가져오기)', () => {
  const rule = cssRule('.erpimport-row');
  assert.match(rule, /background:#f7f9fc/, '전제: 바탕은 밝은 색이다');
  const m = rule.match(/color:(#[0-9a-fA-F]{3,6})/);
  assert.ok(m, '회색 설명줄과 파란 「가져오기」 사이에서 사업 이름만 안 보이게 됩니다');
  assert.doesNotMatch(m[1].toLowerCase(), /^#(fff|f{6}|f3f3f3)$/);
  /* PC 는 #folderDlg 가 .modal 이라 body.pc .modal 이 #1b2536 으로 덮고 있었다 —
     같은 색을 써야 PC 모양이 안 달라진다. */
  assert.equal(m[1].toLowerCase(), '#1b2536', 'PC(.modal)가 쓰던 색과 달라지면 PC 모양이 바뀝니다');
});

test('★ I5 — PC 쪽 밝은 테마 덮기(body.pc .modal)는 그대로다', () => {
  assert.match(source, /body\.pc \.modal\{background:#fff;border-color:#e4e8f0;color:#1b2536\}/);
});

/* ══════════════════════════════════════════════════════════════════════
   M2 새 미디어쿼리가 body.pc 를 안 갈랐다 — PC 창을 760px 아래로 좁히면
      오른쪽 상세 패널이 전체화면으로 바뀌었다.
   ══════════════════════════════════════════════════════════════════════ */
test('★ M2 — 상세 전체화면 규칙은 폰(body 에 pc 없음)에만 걸린다', () => {
  /* ⚠ 파일은 CRLF 다 — 줄바꿈을 \n 으로 못 박으면 헛돈다. */
  const at = source.indexOf('#pcDetail{');
  const around = source.slice(at, at + 1800);
  assert.match(around, /@media\(max-width:760px\)\{\s*body:not\(\.pc\) #pcDetail\.open\{/,
    'PC 창을 760px 아래로 좁히기만 해도 상세가 전체화면으로 바뀝니다 — body:not(.pc) 로 폰만 갈라야 합니다');
  /* 이 미디어쿼리 안의 #pcDetail.open 규칙은 **하나도 빠짐없이** body:not(.pc) 로
     갈려 있어야 한다 — 하나라도 조건 없이 남으면 PC 창을 좁혔을 때 그것이 먹는다. */
  const mqAt = around.indexOf('@media(max-width:760px){');
  const mq = around.slice(mqAt, around.indexOf('\r\n}', mqAt));
  const all = (mq.match(/#pcDetail\.open\{/g) || []).length;
  const guarded = (mq.match(/body:not\(\.pc\) #pcDetail\.open\{/g) || []).length;
  assert.ok(all >= 1, '미디어쿼리 안에서 #pcDetail.open 규칙을 찾지 못했습니다');
  assert.equal(guarded, all, 'body.pc 를 가르지 않는 규칙이 남아 있습니다');
});

/* ══════════════════════════════════════════════════════════════════════
   M5 폴더 시트가 태그를 📁 로 그렸다 — 승인받은 목업은 🏷 다.
   ══════════════════════════════════════════════════════════════════════ */
function loadFolderSheet(){
  const at = source.indexOf('function openTopSheet');
  const end = source.indexOf('\nfunction renderSubbar', at);
  assert.ok(at > 0 && end > at, 'openTopSheet~renderSubbar 사이를 찾지 못했습니다');
  const calls = { html:'' };
  const ctx = {
    esc,
    state: { view:'co', coFolder:'', coTag:'' },
    _coFolders: { f1:{ id:'f1', name:'현장클리닉' } },
    coList: () => [{ key:'k1', folder:'f1' }],
    coTagList: () => [{ t:'일터상생혁신', n:2 }],
    openGroupSheet(){}, openCoFolderDialog(){},
    $: id => {
      if(id==='folderSheetM') return { set innerHTML(v){ calls.html=v; }, get innerHTML(){ return calls.html; } };
      if(id==='folderSheetBg') return { classList:{ add(){}, remove(){} } };
      return null;
    }
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(at, end), ctx);
  ctx._calls = calls;
  return ctx;
}

test('★ M5 — 폴더는 📁, 탭(태그)은 🏷 로 그린다', () => {
  const c = loadFolderSheet();
  c.openCoFolderSheet();
  assert.match(c._calls.html, /🏷 일터상생혁신/, '승인받은 목업에서 탭은 🏷 입니다');
  assert.match(c._calls.html, /📁 현장클리닉/, '폴더는 📁 그대로여야 합니다');
  assert.doesNotMatch(c._calls.html, /📁 일터상생혁신/, '태그를 📁 로 그리면 폴더와 구별이 안 됩니다');
});

test('★ M5 — 고른 것은 예전대로 ✅ 로 표시한다(딱지가 표시를 덮으면 안 된다)', () => {
  const c = loadFolderSheet();
  c.state.coTag = '일터상생혁신';
  c.openCoFolderSheet();
  assert.match(c._calls.html, /✅ 일터상생혁신/);
});

/* ══════════════════════════════════════════════════════════════════════
   M7 restoreLastScreen 에 'co' 갈래가 없어, 폰에서 기업 상세를 보다 나갔다
      들어오면 명함으로 열렸다.
   ══════════════════════════════════════════════════════════════════════ */
function loadRestore(isPc){
  const store = {};
  const opened = [];
  const ctx = {
    JSON, Object,
    myUid: 'uid-A', myEmail: '',
    state: { view:'list', tab:'card', mailSent:false },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }
    },
    document: { body: { classList: { contains: c => c==='pc' && !!isPc } } },
    __store: store,
    opened,
    openMatPage(){ opened.push('mat'); },
    openMailPage(){ opened.push('mail'); },
    openSentBox(){ opened.push('sent'); },
    openSchedBox(){ opened.push('sched'); },
    openCoMobile(){ opened.push('co-mobile'); },
    openCoPage(){ opened.push('co-pc'); },
    switchTab(t){ opened.push('tab:' + t); }
  };
  vm.createContext(ctx);
  vm.runInContext(source.match(/const LASTV_PREFIX = [^\n]*/)[0], ctx);
  vm.runInContext("var _lastScreenSig = ''; var _lastScreenDone = false;", ctx);
  return ctx;
}
/* ⚠ 한 줄짜리 함수(lastScreenKey)를 여러 줄용 규칙으로 자르면 다음 함수까지 삼킨다 —
   cards-last-screen.test.js 가 밟았던 함정과 같다. 한 줄꼴을 먼저 본다. */
function withFns(ctx){
  ['lastScreenKey', 'saveLastScreen', 'restoreLastScreen'].forEach(n=>{
    const one = source.match(new RegExp('function ' + n + '\\([^)]*\\)\\{[^\\n]*\\}'));
    vm.runInContext(one ? one[0] : slice(n), ctx);
  });
  return ctx;
}

test('★ M7 — 폰에서 기업 상세를 보다 나갔다 들어오면 기업 상세로 열린다', () => {
  const w = withFns(loadRestore(false));
  w.state.view = 'co'; w.saveLastScreen();

  const r = withFns(loadRestore(false));
  Object.keys(w.__store).forEach(k=>{ r.__store[k] = w.__store[k]; });
  r.restoreLastScreen();
  assert.deepEqual(JSON.parse(JSON.stringify(r.opened)), ['co-mobile'],
    '기업 상세를 보다 나갔는데 명함으로 열립니다');
});

test('★ M7 — PC 는 예전 그대로다(이번 범위는 폰이다)', () => {
  const w = withFns(loadRestore(true));
  w.state.view = 'co'; w.saveLastScreen();

  const r = withFns(loadRestore(true));
  Object.keys(w.__store).forEach(k=>{ r.__store[k] = w.__store[k]; });
  r.restoreLastScreen();
  assert.deepEqual(JSON.parse(JSON.stringify(r.opened)), [],
    'PC 동작을 바꾸지 않는 것이 이번 범위의 약속입니다');
});

/* ══════════════════════════════════════════════════════════════════════
   지켜야 할 것 — 대표 지시 2026-08-12
   ══════════════════════════════════════════════════════════════════════ */
test('★ state.tab 에 co 를 끼우지 않았다 (대표 지시 2026-08-12)', () => {
  assert.doesNotMatch(source, /state\.tab\s*==='co'/);
  assert.doesNotMatch(source, /state\.tab\s*=\s*'co'/);
});
