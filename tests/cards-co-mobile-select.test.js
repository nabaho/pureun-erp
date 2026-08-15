/* 폰 기업 상세 선택 모드 — 명함의 ✎ 편집(state.selMode)과 같은 스위치를 쓰되,
   고른 회사는 state.coSel(기존 PC 표가 쓰던 것과 같은 자리)에 담는다.
   ⚠ toggleSelMode() 는 명함(state.sel)과 회사(state.coSel) 둘 다 비워야 한다 —
   탭을 넘나들며 고른 것이 남아 있으면 엉뚱한 곳에 옮겨진다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function loadToggleSelMode(){
  const at = source.indexOf('function toggleSelMode');
  const end = source.indexOf('\n}', at) + 2;
  const fabEl = { style:{} };
  const ctx = {
    state: { selMode:false, sel:{a:1}, coSel:{b:1} },
    $: id => id==='selLabel' ? { set textContent(v){ ctx._label=v; } } : (id==='fab' ? fabEl : null),
    /* toggleSelMode() 는 명함 쪽 재렌더도 함께 호출한다(renderSelbar/renderList) —
       이 테스트는 state.sel/state.coSel 이 비워지는지만 보므로 no-op 으로 흘려보낸다. */
    renderSelbar: () => {},
    renderList: () => {},
    /* ★ Task 5 리뷰(2026-08-15) — 기업 상세 화면(state.view==='co')에서는
       renderCoMobileList() 만 다시 그려야 한다(renderSelbar/renderList 를 그대로
       부르면 회사 목록이 명함 목록으로 덮어써진다). 이 테스트는 명함 화면
       (state.view 없음)만 보므로 no-op 이면 충분하다. */
    renderCoMobileList: () => { ctx._coRendered = (ctx._coRendered||0) + 1; }
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(at, end), ctx);
  ctx._fab = fabEl;
  return ctx;
}

test('toggleSelMode 는 명함 선택과 회사 선택을 둘 다 비운다', () => {
  const c = loadToggleSelMode();
  c.toggleSelMode();
  /* vm 안에서 만든 객체는 이 realm의 Object 와 다른 realm이라 deepEqual 이
     "구조는 같은데 참조가 다르다"며 실패한다 — JSON 왕복으로 순수 값만 비교한다. */
  assert.deepEqual(JSON.parse(JSON.stringify(c.state.sel)), {});
  assert.deepEqual(JSON.parse(JSON.stringify(c.state.coSel)), {}, '회사 선택(coSel)도 함께 비워야 탭을 넘나들 때 안 섞입니다');
});

/* (라) [Minor] 지금까지 #selLabel/#fab 은 스텁으로만 받아 두고 실제로 확인하지
   않았다 — 명함 쪽 동작이 안 깨졌다는 것을 지키는 유일한 검사이므로 확인한다. */
test('toggleSelMode 는 #selLabel·#fab 을 편집 모드에 맞게 바꾼다', () => {
  const c = loadToggleSelMode();
  c.toggleSelMode();
  assert.equal(c.state.selMode, true);
  assert.equal(c._label, '완료', '편집 모드로 들어가면 단추 글자가 "완료"로 바뀌어야 합니다');
  assert.equal(c._fab.style.display, 'none', '편집 모드에서는 fab 을 숨겨야 합니다');

  c.toggleSelMode();
  assert.equal(c.state.selMode, false);
  assert.equal(c._label, '편집', '편집 모드를 빠져나오면 단추 글자가 "편집"으로 되돌아가야 합니다');
  assert.equal(c._fab.style.display, '', '편집 모드를 빠져나오면 fab 이 다시 보여야 합니다');
});

/* (가) [Critical] Task 5 리뷰(2026-08-15) — #subbar 의 「✎ 편집」 단추는 기업 상세
   화면에서도 그대로 보인다. renderSelbar()+renderList() 를 무조건 부르면 회사를
   고르려고 편집을 누르는 순간 회사 목록이 명함 목록으로 덮어써진다. 화면을 가려
   기업 상세 화면이면 renderCoMobileList() 만 다시 그려야 한다. */
test('★ toggleSelMode 는 기업 상세 화면이면 renderCoMobileList 만 다시 그리고 명함용 #selbar 는 안 건드린다', () => {
  const c = loadToggleSelMode();
  c.state.view = 'co';
  let selbarCalled = false, listCalled = false;
  c.renderSelbar = () => { selbarCalled = true; };
  c.renderList = () => { listCalled = true; };
  c.toggleSelMode();
  assert.equal(c._coRendered, 1, '기업 상세 화면이면 renderCoMobileList 를 불러야 합니다');
  assert.equal(selbarCalled, false, '기업 상세 화면에서 명함용 renderSelbar 를 부르면 회사 목록이 명함 목록으로 덮어써집니다');
  assert.equal(listCalled, false, '기업 상세 화면에서 명함용 renderList 를 부르면 회사 목록이 명함 목록으로 덮어써집니다');
});

test('toggleSelMode 는 명함·사업자 화면(state.view!==\'co\')이면 예전처럼 renderSelbar·renderList 를 그대로 부른다', () => {
  const c = loadToggleSelMode();
  c.state.view = 'list';
  let selbarCalled = false, listCalled = false;
  c.renderSelbar = () => { selbarCalled = true; };
  c.renderList = () => { listCalled = true; };
  c.toggleSelMode();
  assert.equal(selbarCalled, true);
  assert.equal(listCalled, true);
  assert.equal(c._coRendered, undefined, '명함 화면에서 renderCoMobileList 를 부르면 안 됩니다');
});

function loadListBlockWithSelBar(items){
  const at = source.indexOf('function renderCoMobileList');
  /* ⚠ renderCoMobileList 바로 뒤는 렌더 분기·IIFE·</script><script> 경계를 지나야
     다음 function 선언이 나온다 — '\nfunction ' 로 다음 함수를 찾으면 그 사이의
     HTML까지 통째로 삼켜 vm이 깨진다(cards-co-mobile-list.test.js 의 loadBlock 과
     같은 함정). 이 함수 자신의 닫는 중괄호(줄 맨 앞 '}')에서 바로 끊는다. */
  const end = source.indexOf('\n}', at) + 2;
  const calls = { html:'' };
  const ctx = {
    /* (다) [Important] 무동작 esc 스텁은 이스케이프 순서가 바뀌어도 못 잡는다
       (cards-co-mobile-list.test.js 가 쓰는 진짜 이스케이프로 맞춘다). */
    esc: s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    state: { coSel:{}, selMode:true },
    _coFolders: {},
    /* 나눠 보기(2026-08-15) — 폰 목록도 «잘린 쪽»을 그린다. 여기서는 한 쪽에 다 담는다 */
    coPage: () => { const l = items; return { rows:l, total:l.length, page:0, pages:1,
                    size:200, from:l.length?1:0, to:l.length }; },
    coPagerHtml: () => '',
    coVisible: () => items,
    coTagsOf: () => [],
    $: id => id==='list' ? { set innerHTML(v){ calls.html=v; }, get innerHTML(){ return calls.html; } } : null
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(at, end), ctx);
  ctx._calls = calls;
  return ctx;
}

test('선택 모드에서 목록 위에 폴더로 옮기기·탭에 담기 동작 바가 보인다', () => {
  const c = loadListBlockWithSelBar([{ key:'k1', name:'대명크라샤', bizno:'', erp:null, folder:'', cards:[], docs:0, tags:{} }]);
  c.state.coSel = { k1:1 };
  c.renderCoMobileList();
  assert.match(c._calls.html, /coMoveToFolder\(\)/);
  assert.match(c._calls.html, /coAssignTag\(\)/);
});

test('아무 것도 안 골랐으면 동작 바가 안 보인다', () => {
  const c = loadListBlockWithSelBar([{ key:'k1', name:'대명크라샤', bizno:'', erp:null, folder:'', cards:[], docs:0, tags:{} }]);
  c.state.coSel = {};
  c.renderCoMobileList();
  assert.doesNotMatch(c._calls.html, /coMoveToFolder\(\)/);
});
