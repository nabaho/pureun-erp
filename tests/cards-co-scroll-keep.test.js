'use strict';
/* 기업 상세 목록 — 네모를 누르면 «맨 위로 튀던» 것
   ═══════════════════════════════════════════════════════════════════════════
   대표 보고 2026-08-29: 「화면에서 사업장 클릭하면 왜 자동으로 맨위로 올라가나
   추가로 클릭못하게 만든다 아래로 내려가면서」

   ■ 무엇이 문제였나
     renderCoPage() 가 #pcCo 의 innerHTML 을 통째로 갈아 끼운다. 그런데 «구르는 칸»
     자체가 그 안에 있다(.cobody). 즉 다시 그릴 때마다 구르는 칸이 **새 것으로
     바뀐다** — 새 칸의 scrollTop 은 언제나 0 이다.
     크롬에서 실제로 재 봤다(2026-08-29):
       ① 구르는 칸 «자신»의 innerHTML 갈아끼우기      → 900 → 900 (지켜짐)
       ② 구르는 칸 «안쪽 자식»의 innerHTML 갈아끼우기 → 900 → 900 (지켜짐)
       ③ 구르는 칸을 «통째로 새로» 만들기             → 900 →   0 (날아감)  ← 여기
     명함 표(#pcTableWrap 안의 #pcTable)가 ②라서 멀쩡했고, 기업 상세만 ③이었다.

     171번째 줄까지 내려가 네모를 누르면 1번 줄로 돌아온다. 두 곳째를 고르려면
     다시 내려가야 하니 「추가로 클릭 못하게」 된다.

   ■ 왜 「고르기만 다시 그린다」(M1) 로도 안 잡혔나
     2026-08-16 M1 이 coToggle 을 renderCoListOnly() 로 좁혔지만, 그 끝도 결국
     renderCoPage() 다 — 옆줄을 안 그릴 뿐 구르는 칸은 똑같이 새로 만들어졌다.
     게다가 네모를 «한 번 누르는» 길은 coToggle 이 아니다. .selcell 의 onmousedown
     이 dragSelStart 로 가로채 preventDefault() 하므로 onchange 가 아예 안 뜬다.
     실제 길은 dragSelStart → dragSelEnd → dragSelCtx('co').done() 인데 그것이
     renderCoAny() 였다 — 고르기만 바뀌는데 옆줄까지 통째로 다시 그렸다.

   ★ 여기서 못 박는 것
     ① 고르기만 바뀐 다시 그리기는 «구르던 자리»를 지킨다
     ② 목록의 «모양»이 바뀌면(쪽·찾기말·정렬·폴더·탭·거르개) 맨 위로 올려 준다
        — 3쪽으로 넘겼는데 한가운데가 보이면 그것도 고장이다
     ③ 네모 한 번 누르기는 옆줄까지 다시 그리지 않는다(M1 과 같은 규칙)
   실행: node --test tests/cards-co-scroll-keep.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

/* 주석은 걷어 내고 본다 — 잘 쓴 주석이 검사를 통과시키면 안 된다 */
function code(s){
  return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ');
}
/* 함수 한 덩이 떼 오기 — 닫는 중괄호는 줄 맨 앞에 있는 것이다 */
function slice(from, to){
  const a = src.indexOf(from);
  assert.ok(a > 0, '「' + from + '」 을(를) 찾지 못했습니다');
  const b = src.indexOf(to, a);
  assert.ok(b > a, '「' + to + '」 을(를) 찾지 못했습니다');
  return src.slice(a, b + to.length);
}

/* ── 가짜 화면 ──
   #pcCo 하나만 있으면 된다. innerHTML 을 넣을 때마다 «새» 구르는 칸이 생기는 것까지
   그대로 흉내 낸다 — 진짜 브라우저가 그렇게 하기 때문이다(위 실측 ③). */
function fakeCo(){
  return {
    _html: '',
    _body: null,
    classList: { _s: new Set(), add(c){ this._s.add(c); }, contains(c){ return this._s.has(c); } },
    get innerHTML(){ return this._html; },
    set innerHTML(v){ this._html = v; this._body = { scrollTop: 0 }; },
    querySelector(sel){ return sel === '.cobody' ? this._body : null; }
  };
}

function load(){
  const el = fakeCo();
  const ctx = {
    console,
    state: {
      view: 'co', coPage: 0, coPageSize: 200, coQ: '', coFolder: '', coFTab: '',
      coTag: '', coSort: { key: 'name', dir: 'asc' }, coColFilter: {},
      coOnlyCares: true, coOnlyClosed: false, coOnlyNoBiz: false,
      coOnlyIncomplete: false, coOnlyUid: false
    },
    $: id => (id === 'pcCo' ? el : null),
    coList: () => [],
    coTagList: () => [],
    coPage: () => ({ rows: [], total: 0, from: 1, page: 0, pages: 3 }),
    syncPcSearchFor: () => {},
    coListHtml: () => '<table class="cotbl"></table>',
    /* 걸린 「할 일」을 알려 주는 띠 — 2026-08-30 에 목록 «위»로 붙었다.
       ⚠ coListHtml 안이 아니라 밖이다: 0곳일 때도 떠야 하기 때문이다. */
    coTodoChipsHtml: () => '',
    coPagerHtml: () => '',
    esc: s => String(s)
  };
  vm.createContext(ctx);
  /* 자리를 기억하는 쪽지(_coScrollShape)·모양 열쇠·renderCoPage 를 한 덩이로 떠 온다 */
  const a = src.indexOf('let _coScrollShape');
  const b = src.indexOf('\nfunction coListHtml(');
  assert.ok(a > 0 && b > a, '자리 지키기 덩이를 찾지 못했습니다');
  vm.runInContext(src.slice(a, b), ctx);
  ctx._el = el;
  return ctx;
}
const loadFull = load;

test('★ 고르기만 바뀐 다시 그리기는 «구르던 자리»를 지킨다', () => {
  const c = loadFull();
  c.renderCoPage();                       /* 첫 그리기 */
  c._el._body.scrollTop = 900;            /* 사람이 171번째 줄까지 내려간다 */
  c.renderCoPage();                       /* 네모 하나 눌러 목록만 다시 그린다 */
  assert.equal(c._el._body.scrollTop, 900,
    '★ 네모를 누를 때마다 목록이 맨 위로 튄다 — 아래쪽 회사는 두 번째부터 고를 수가 없다');
});

test('쪽을 넘기면 맨 위로 올려 준다', () => {
  const c = loadFull();
  c.renderCoPage();
  c._el._body.scrollTop = 900;
  c.state.coPage = 1;
  c.renderCoPage();
  assert.equal(c._el._body.scrollTop, 0,
    '2쪽으로 넘겼는데 한가운데가 보이면 「몇 번째부터인지」를 알 수 없다');
});

test('찾기말·정렬·폴더·탭·거르개가 바뀌어도 맨 위로', () => {
  const 바뀜 = [
    ['찾기말', s => { s.coQ = '한국'; }],
    ['정렬',   s => { s.coSort = { key: 'docs', dir: 'desc' }; }],
    ['폴더',   s => { s.coFolder = 'f1'; }],
    ['폴더 안 탭', s => { s.coFolder = 'f1'; s.coFTab = 't1'; }],
    ['태그',   s => { s.coTag = '신청서'; }],
    ['쪽 크기', s => { s.coPageSize = 50; }],
    ['거래처만', s => { s.coOnlyCares = false; }],
    ['종료만',  s => { s.coOnlyClosed = true; }],
    ['번호없음만', s => { s.coOnlyNoBiz = true; }],
    ['정보부족만', s => { s.coOnlyIncomplete = true; }],
    ['고유번호증만', s => { s.coOnlyUid = true; }],
    ['열 거르개', s => { s.coColFilter = { type: '자문' }; }]
  ];
  for (const [이름, 걸기] of 바뀜){
    const c = loadFull();
    c.renderCoPage();
    c._el._body.scrollTop = 900;
    걸기(c.state);
    c.renderCoPage();
    assert.equal(c._el._body.scrollTop, 0,
      이름 + '(으)로 목록이 달라졌는데 옛 자리에 머물러 있다');
  }
});

test('자료가 바뀌어 다시 그려도(회사가 늘거나 줄어도) 자리는 지킨다', () => {
  /* 실시간으로 남이 폴더 하나를 옮기면 watchCardMap → renderCoSoon 이 돈다.
     그때마다 보던 자리가 날아가면, 아무 것도 안 눌렀는데 화면이 튄다. */
  const c = loadFull();
  c.renderCoPage();
  c._el._body.scrollTop = 900;
  c.coList = () => [{ key: 'a' }, { key: 'b' }];         /* 자료만 바뀐다 */
  c.coPage = () => ({ rows: [], total: 2, from: 1, page: 0, pages: 3 });
  c.renderCoPage();
  assert.equal(c._el._body.scrollTop, 900);
});

test('★ 네모 한 번 누르기는 옆줄까지 다시 그리지 않는다 (M1 과 같은 규칙)', () => {
  /* .selcell 의 onmousedown 이 preventDefault() 하므로 onchange(coToggle) 는 안 뜬다.
     실제 길은 dragSelStart → dragSelEnd → dragSelCtx('co').done() 뿐이다. */
  const fn = code(slice('function dragSelCtx(', '\n}'));
  const co = fn.slice(fn.indexOf("kind === 'co'"), fn.indexOf('return { bag: state.sel'));
  assert.ok(/renderCoListOnly\(\)/.test(co),
    '★ 고르기만 바뀌는데 renderCoAny() 로 옆줄까지 통째로 다시 그린다 — '
    + '4,147곳에서 네모 하나 누를 때마다 그만큼 멈추고, 구르던 자리도 함께 흔들린다');
  assert.ok(!/renderCoAny\(\)/.test(co),
    '★ renderCoAny() 가 남아 있다 — M1 이 coToggle·coSelAll 을 좁힌 것과 같은 자리다');
});

/* ══════ 폰 목록 — 같은 갈래의 «반대쪽» ══════
   #list 는 구르는 칸(#listwrap) 안에 있어서 갈아 끼워도 자리가 안 날아간다.
   그래서 폰에는 튐이 없었는데, 대신 2쪽으로 넘겨도 한가운데에 머물러 있었다 —
   명함 폰 목록(listGoPage)이 이미 하는 「맨 위로」가 여기만 빠져 있었다. */
test('★ 폰 목록도 «모양»이 바뀌면 맨 위로 올려 준다', () => {
  const fn = code(slice('function renderCoMobileList(', '\n}'));
  assert.ok(/coListShapeKey\(\)/.test(fn),
    '폰 목록이 「모양이 바뀌었나」를 PC 와 같은 열쇠로 보지 않는다');
  assert.ok(/window\.scrollTo\(0,\s*0\)/.test(fn),
    '★ 폰에서 쪽을 넘겨도 한가운데에 머문다 — 몇 번째부터인지 알 수 없다');
  /* 빈 목록으로 끝나는 길보다 «먼저» 적어 두어야 다음 번에 애먼 때 안 튄다 */
  assert.ok(fn.indexOf('coListShapeKey()') < fn.indexOf('회사를 찾지 못했습니다'),
    '모양 적기가 「찾지 못했습니다」로 끝나는 길 뒤에 있다 — 그 번에는 안 적힌다');
});

/* ══════ 옆줄 폴더 칸 — 같은 갈래의 같은 문제 ══════
   #pcFolderList 도 44vh 짜리 구르는 칸인데 renderPCSide() 가 통째로 새로 만든다.
   기업 상세 목록만 고치고 여기를 두면, 폴더를 스무 개 둔 대표 화면에서는
   「네모 누르면 옆줄이 맨 위로」가 그대로 남는다. */
function loadSide(){
  let box = null;
  const ctx = {
    state: { view: 'list', tab: 'card' },
    $: id => (id === 'pcFolderList' ? box : null),
    _put: b => { box = b; }
  };
  vm.createContext(ctx);
  const a = src.indexOf('let _pcSideTop');
  const b = src.indexOf('\nfunction renderPCSide(');
  assert.ok(a > 0 && b > a, '옆줄 자리 지키기 덩이를 찾지 못했습니다');
  vm.runInContext(src.slice(a, b), ctx);
  return ctx;
}

test('★ 옆줄 폴더 칸도 구르던 자리를 지킨다', () => {
  const c = loadSide();
  c._put({ scrollTop: 0 }); c.pcSideRestoreTop();       /* 첫 그리기 */
  c.$('pcFolderList').scrollTop = 300;                  /* 사람이 아래 폴더까지 내려간다 */
  c.pcSideKeepTop();
  c._put({ scrollTop: 0 });                             /* 옆줄이 통째로 새로 그려진다 */
  c.pcSideRestoreTop();
  assert.equal(c.$('pcFolderList').scrollTop, 300,
    '★ 네모 하나 누를 때마다 옆줄 폴더 목록이 맨 위로 돌아온다');
});

test('갈래·화면이 바뀌면 옆줄 폴더 칸은 맨 위로', () => {
  const c = loadSide();
  c._put({ scrollTop: 0 }); c.pcSideRestoreTop();
  c.$('pcFolderList').scrollTop = 300;
  c.pcSideKeepTop();
  c.state.tab = 'biz';                                  /* 명함 → 사업자 */
  c._put({ scrollTop: 0 });
  c.pcSideRestoreTop();
  assert.equal(c.$('pcFolderList').scrollTop, 0,
    '폴더 목록 자체가 다른데 옛 자리에 서 있으면 엉뚱한 폴더 앞이다');
});

test('★ 옆줄을 갈아 끼우는 «모든» 갈림길이 자리를 되꽂는다', () => {
  /* 갈림길이 넷이다(메일·기업 상세·메일 갈래·명함). 하나만 빠뜨리면 그 화면에서만
     조용히 튄다 — 여기서 세어 막는다. cards-side-bottom.test.js 와 같은 결. */
  const body = code(src);
  const MARK = "$('pcSide').innerHTML";
  const parts = body.split(MARK);
  assert.ok(parts.length - 1 >= 4, '옆줄을 갈아 끼우는 자리를 찾지 못했습니다');
  for (let i = 1; i < parts.length; i++){
    const seg = parts[i].slice(0, 200);
    assert.ok(seg.indexOf('pcSideRestoreTop()') >= 0,
      i + '번째 ' + MARK + ' 뒤에 pcSideRestoreTop() 이 없다 — 그 화면에서만 옆줄이 튄다');
  }
  assert.ok(/function renderPCSide\(\)\{[\s\S]{0,400}?pcSideKeepTop\(\)/.test(body),
    'renderPCSide 가 갈아 끼우기 «전»에 pcSideKeepTop() 으로 자리를 읽지 않는다');
});

test('구르는 칸을 새로 만드는 곳은 renderCoPage 한 곳뿐이다', () => {
  /* 다른 곳에서 또 .cobody 를 만들면 그쪽 길로 다시 튄다 — 늘어나면 여기서 걸린다. */
  const n = (code(src).match(/class="cobody"/g) || []).length;
  assert.equal(n, 1, '.cobody 를 만드는 자리가 ' + n + '곳이다 — 자리 지키기도 그만큼 갈라진다');
});
