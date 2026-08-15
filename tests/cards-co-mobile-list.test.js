/* 폰 기업 상세 카드 목록 — 명함 목록(renderList)과 같은 .row/.rowmain 결로 그린다.
   ⚠ PC 표(coListHtml)는 안 건드린다 — 이 함수는 완전히 새 것이다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function loadBlock(list){
  const at = source.indexOf('function renderCoMobileList');
  /* ⚠ renderCoMobileList 바로 뒤는 렌더 분기·IIFE·</script><script> 경계를 지나야
     다음 function 선언(newSalt)이 나온다 — '\nfunction ' 로 다음 함수를 찾으면
     그 사이의 HTML까지 통째로 삼켜 vm이 깨진다. cards-co-mobile-tab.test.js 가
     쓰는 대로 이 함수 자신의 닫는 중괄호(줄 맨 앞 '}')에서 바로 끊는다. */
  const end = source.indexOf('\n}', at) + 2;
  assert.ok(at > 0 && end > at + 2, 'renderCoMobileList 를 찾지 못했습니다');
  const calls = { html:'' };
  const ctx = {
    esc: s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    state: { coSel:{}, selMode:false },
    _coFolders: {},
    coVisible: () => list,
    coTagsOf: o => Object.keys(o.tags||{}),
    $: id => id==='list' ? { set innerHTML(v){ calls.html=v; }, get innerHTML(){ return calls.html; } } : null
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(at, end), ctx);
  ctx._calls = calls;
  return ctx;
}

test('회사가 없으면 안내문구를 보여준다', () => {
  const c = loadBlock([]);
  c.renderCoMobileList();
  assert.match(c._calls.html, /찾지 못했습니다|없습니다/);
});

test('회사마다 상호·유형·사업자번호·담당을 카드로 그린다', () => {
  const c = loadBlock([{ key:'k1', name:'대명크라샤', bizno:'312-81-49225', erp:{ type:'자문', main:'김보람' }, folder:'', cards:[], docs:0, tags:{} }]);
  c.renderCoMobileList();
  assert.match(c._calls.html, /class="row"/);
  assert.match(c._calls.html, /대명크라샤/);
  assert.match(c._calls.html, /자문/);
  assert.match(c._calls.html, /312-81-49225/);
  assert.match(c._calls.html, /김보람/);
});

test('폴더에 든 회사는 카드에 폴더 이름이 보인다', () => {
  const c = loadBlock([{ key:'k1', name:'대명크라샤', bizno:'', erp:null, folder:'f1', cards:[], docs:0, tags:{} }]);
  c._coFolders = { f1:{ id:'f1', name:'현장클리닉' } };
  c.renderCoMobileList();
  assert.match(c._calls.html, /현장클리닉/);
});

test('카드를 누르면 pickCo(key) 를 부른다', () => {
  const c = loadBlock([{ key:'k1', name:'대명크라샤', bizno:'', erp:null, folder:'', cards:[], docs:0, tags:{} }]);
  c.renderCoMobileList();
  assert.match(c._calls.html, /onclick="pickCo\('k1'\)"/);
});

test('선택 모드일 때는 체크 표시를 그리고, 누르면 coToggle 을 부른다', () => {
  const c = loadBlock([{ key:'k1', name:'대명크라샤', bizno:'', erp:null, folder:'', cards:[], docs:0, tags:{} }]);
  c.state.selMode = true;
  c.renderCoMobileList();
  assert.match(c._calls.html, /onclick="coToggle\('k1'\)"/);
  assert.doesNotMatch(c._calls.html, /onclick="pickCo\('k1'\)"/, '선택 모드에서 누르면 상세가 아니라 선택이 되어야 합니다');
});

test('선택된 회사는 체크 표시가 켜진다', () => {
  const c = loadBlock([{ key:'k1', name:'대명크라샤', bizno:'', erp:null, folder:'', cards:[], docs:0, tags:{} }]);
  c.state.selMode = true; c.state.coSel = { k1:1 };
  c.renderCoMobileList();
  assert.match(c._calls.html, /✅/);
});
