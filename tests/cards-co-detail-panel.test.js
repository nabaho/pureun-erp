/* 회사 상세를 화면 전환이 아니라 오른쪽 팝업(#pcDetail, 명함 상세와 같은 패널)으로
   보여준다. 목록은 그대로 두고 패널만 열고 닫는다(대표 지시 2026-08-14). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

test('coDetailHtml(예전 화면-전환용 함수)이 없다 — 팝업으로 대체됐다', () => {
  assert.doesNotMatch(source, /function coDetailHtml/, 'coDetailHtml 을 지우지 않고 남겨 두면 죽은 코드가 된다');
});

test('renderCoPage 는 이제 항상 목록만 그린다 — state.coPick 으로 안 갈라진다', () => {
  const at = source.indexOf('function renderCoPage');
  const end = source.indexOf('\nfunction coListHtml', at);
  const fn = source.slice(at, end);
  assert.doesNotMatch(fn, /coDetailHtml/, 'renderCoPage 가 여전히 coDetailHtml 을 부르면 안 된다');
  assert.match(fn, /coListHtml\(list\)/);
});

/* coDetailPanelHtml·openCoDetailPanel·pickCo·closePcDetail 을 실제로 돌려서 증명한다.
   cards-co-col-filter.test.js 와 같은 방식 — 필요한 것만 손으로 쥐여준다. */
function loadPanelBlock(items){
  const pickAt = source.indexOf('function pickCo(');
  const closeAt = source.indexOf('function closePcDetail');
  const closeEnd = source.indexOf('\n', closeAt);
  const panelAt = source.indexOf('function coDetailPanelHtml');
  assert.ok(panelAt > 0, 'coDetailPanelHtml 을 찾지 못했습니다');
  const openAt = source.indexOf('function openCoDetailPanel');
  assert.ok(openAt > panelAt, 'openCoDetailPanel 을 찾지 못했습니다');
  const openEnd = source.indexOf('\nfunction ', openAt + 10);
  const pickEnd = source.indexOf('\n', pickAt);

  const calls = { panelHtml:'', panelOpen:false, overlayOn:false, detailClosed:0 };
  const ctx = {
    esc: s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    state: { coPick:'' },
    _coFolders: {},
    coList: () => items.slice(),
    coDocsHtml: () => '',
    CO_FIELDS: [['bizno','사업자번호'],['ceo','대표자']],
    closeDetail: () => { calls.detailClosed++; },
    loadErpCaseCons: cb => cb && cb(null),
    $: id => {
      if(id==='pcDetail') return { set innerHTML(v){ calls.panelHtml=v; }, get innerHTML(){ return calls.panelHtml; },
        classList: { add(){ calls.panelOpen=true; }, remove(){ calls.panelOpen=false; } } };
      if(id==='pcDetailOverlay') return { style:{ set display(v){ calls.overlayOn = (v==='block'); } } };
      return null;
    }
  };
  const code = source.slice(panelAt, openEnd) + '\n' + source.slice(pickAt, pickEnd) + '\n' + source.slice(closeAt, closeEnd);
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx._calls = calls;
  return ctx;
}

test('openCoDetailPanel 은 이 회사 내용으로 패널을 채우고 연다', () => {
  const c = loadPanelBlock([{ key:'k1', name:'대명크라샤', bizno:'312-81-49225', ceo:'이태준', cards:[], extra:{}, folder:'' }]);
  c.openCoDetailPanel('k1');
  assert.match(c._calls.panelHtml, /대명크라샤/);
  assert.match(c._calls.panelHtml, /이태준/);
  assert.equal(c._calls.panelOpen, true);
  assert.equal(c._calls.overlayOn, true);
});

test('pickCo 는 같은 회사를 두 번 누르면 패널을 닫는다', () => {
  const c = loadPanelBlock([{ key:'k1', name:'대명크라샤', bizno:'', ceo:'', cards:[], extra:{}, folder:'' }]);
  c.pickCo('k1');
  assert.equal(c.state.coPick, 'k1');
  c.pickCo('k1');
  assert.equal(c.state.coPick, '', '같은 회사를 다시 누르면 골라둔 것이 풀려야 한다');
  assert.equal(c._calls.detailClosed, 1);
});

test('closePcDetail 은 state.coPick 을 비운다', () => {
  const c = loadPanelBlock([]);
  c.state.coPick = 'k1';
  c.closePcDetail();
  assert.equal(c.state.coPick, '');
  assert.equal(c._calls.detailClosed, 1);
});

test('폴더에 든 회사는 상세 패널에 폴더 딱지가 보인다', () => {
  const c = loadPanelBlock([{ key:'k1', name:'대명크라샤', bizno:'', ceo:'', cards:[], extra:{}, folder:'f1' }]);
  c._coFolders = { f1:{ id:'f1', name:'현장클리닉' } };
  c.openCoDetailPanel('k1');
  assert.match(c._calls.panelHtml, /현장클리닉/);
});
