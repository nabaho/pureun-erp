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
  const ctx = {
    state: { selMode:false, sel:{a:1}, coSel:{b:1} },
    $: id => id==='selLabel' ? { set textContent(v){ ctx._label=v; } } : (id==='fab' ? { style:{} } : null),
    /* toggleSelMode() 는 명함 쪽 재렌더도 함께 호출한다(renderSelbar/renderList) —
       이 테스트는 state.sel/state.coSel 이 비워지는지만 보므로 no-op 으로 흘려보낸다. */
    renderSelbar: () => {},
    renderList: () => {}
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(at, end), ctx);
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

function loadListBlockWithSelBar(items){
  const at = source.indexOf('function renderCoMobileList');
  /* ⚠ renderCoMobileList 바로 뒤는 렌더 분기·IIFE·</script><script> 경계를 지나야
     다음 function 선언이 나온다 — '\nfunction ' 로 다음 함수를 찾으면 그 사이의
     HTML까지 통째로 삼켜 vm이 깨진다(cards-co-mobile-list.test.js 의 loadBlock 과
     같은 함정). 이 함수 자신의 닫는 중괄호(줄 맨 앞 '}')에서 바로 끊는다. */
  const end = source.indexOf('\n}', at) + 2;
  const calls = { html:'' };
  const ctx = {
    esc: s => String(s ?? ''),
    state: { coSel:{}, selMode:true },
    _coFolders: {},
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
