/* 회사 상세를 화면 전환이 아니라 오른쪽 팝업(#pcDetail, 명함 상세와 같은 패널)으로
   보여준다. 목록은 그대로 두고 패널만 열고 닫는다(대표 지시 2026-08-14). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
/* ⚠ 2026-08-31(점검 B2): 상세에 계약 기간 한 줄이 붙었다. 그 둘은 패널 «앞»에
   있어 위 자르기에 안 들어온다 — 대역을 넣는 대신 «진짜»를 함께 실어 준다.
   대역을 넣으면 그 줄이 터져도 이 검사가 모른다. */
function fnBody2(name){
  const i = source.indexOf(String.fromCharCode(10) + 'function ' + name + '(');
  assert.ok(i >= 0, name + ' 을 찾지 못했습니다');
  const open = source.indexOf('{', i);
  let d = 0;
  for (let k = open; k < source.length; k++) {
    if (source[k] === '{') d++;
    else if (source[k] === '}') { d--; if (!d) return source.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했습니다');
}

test('coDetailHtml(예전 화면-전환용 함수)이 없다 — 팝업으로 대체됐다', () => {
  assert.doesNotMatch(source, /function coDetailHtml/, 'coDetailHtml 을 지우지 않고 남겨 두면 죽은 코드가 된다');
});

test('renderCoPage 는 이제 항상 목록만 그린다 — state.coPick 으로 안 갈라진다', () => {
  const at = source.indexOf('function renderCoPage');
  const end = source.indexOf('\nfunction coListHtml', at);
  const fn = source.slice(at, end);
  assert.doesNotMatch(fn, /coDetailHtml/, 'renderCoPage 가 여전히 coDetailHtml 을 부르면 안 된다');
  /* 나눠 보기(2026-08-15) 뒤로 목록은 «잘린 쪽»(info)으로 넘어간다 */
  assert.match(fn, /coListHtml\(info\)/);
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
    /* 2026-08-30: 상호 못 읽은 회사도 목록에 남는다 — 화면이 «보여줄 이름»을 쓴다 */
    coDisplayName: o => (o && String(o.name||'').trim()) || (o && o.bizno) || '',
    esc: s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    state: { coPick:'' },
    _coFolders: {},
    coList: () => items.slice(),
    coDocsHtml: () => '',
    /* 2026-08-24: 상세 패널이 «값이 어긋난 칸»도 보여준다 — 이 검사는 그 부분을
       안 보므로 빈 값으로 둔다(안 넣으면 coDetailPanelHtml 이 던진다). */
    coConflictHtml: () => '',
    /* 2026-09-02: 상세 패널 맨 위에 «회사 열쇠» 한 줄이 붙는다(이알피 업체 확정).
       이 검사는 그 부분을 안 보므로 대역으로 둔다 — 안 넣으면 패널이 던진다. */
    coErpPinHtml: () => '',
    /* 2026-08-24(4순위): 값마다 «어디서 왔는지» 한 줄이 붙는다 — 이 검사는 안 본다 */
    coSrcTagHtml: () => '',
    /* 2026-08-24(3순위): 값 꺼내기를 coVal 하나로 모았다 — 상세 패널이 그것을 쓴다 */
    coVal: (o, f) => String((o && ((o.extra && o.extra[f]) || o[f])) || '').trim(),
    CO_FIELDS: [['bizno','사업자번호'],['ceo','대표자']],
    closeDetail: () => { calls.detailClosed++; },
    loadErpCaseCons: cb => cb && cb(null),
    renderCoErpHistory: () => {},
    $: id => {
      if(id==='pcDetail') return { set innerHTML(v){ calls.panelHtml=v; }, get innerHTML(){ return calls.panelHtml; },
        classList: { add(){ calls.panelOpen=true; }, remove(){ calls.panelOpen=false; } } };
      if(id==='pcDetailOverlay') return { style:{ set display(v){ calls.overlayOn = (v==='block'); } } };
      return null;
    }
  };
  /* 2026-08-31: coDetailPanelHtml 이 #coInfoBox 를 coInfoBoxHtml 로 채운다
     (기업정보 접기/펼치기, 대표 지시). 그 함수는 coDetailPanelHtml «앞»에 있어
     panelAt~openEnd 자르기에 안 들어온다 — 대역이 아니라 «진짜»를 함께 싣는다. */
  const code = 'let _coInfoOpen = false;\n'
    + fnBody2('coInfoSummary') + '\n' + fnBody2('coInfoBoxHtml') + '\n'
    + fnBody2('erpContractPeriod') + String.fromCharCode(10) + fnBody2('todayYmd') + String.fromCharCode(10)
    + source.slice(panelAt, openEnd) + '\n' + source.slice(pickAt, pickEnd) + '\n' + source.slice(closeAt, closeEnd);
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

/* 최종 전체 리뷰 2026-08-14: 가회사 패널을 연 직후(이알피 조회가 도는 중) 나회사
   패널로 바꾸면, 늦게 온 가회사의 이력 응답이 지금 화면(나회사)의 이력 칸에 써지는
   사고가 있었다 — #coErpHistBox 는 DOM 자리 하나라 회사가 바뀌어도 같은 id 를 쓴다.
   loadErpCaseCons 를 진짜 비동기(콜백을 나중에 부름)로 흉내내 이 경쟁 상태를 증명한다. */
function loadPanelBlockAsync(items){
  const pickAt = source.indexOf('function pickCo(');
  const closeAt = source.indexOf('function closePcDetail');
  const closeEnd = source.indexOf('\n', closeAt);
  const panelAt = source.indexOf('function coDetailPanelHtml');
  const openAt = source.indexOf('function openCoDetailPanel');
  const openEnd = source.indexOf('\nfunction ', openAt + 10);
  const pickEnd = source.indexOf('\n', pickAt);

  const calls = { panelHtml:'', panelOpen:false, overlayOn:false, detailClosed:0, histCalls:[] };
  /* ⚠ 실제 loadErpCaseCons(최종 전체 리뷰 수정판)는 도는 중에 또 부르면 콜백을
     큐에 쌓아 뒀다가, 실제 결과가 오면 쌓인 것 전부를 부른다 — 콜백 하나만 기억하고
     덮어쓰면 안 된다. 여기서도 같은 모양(배열)으로 흉내내야 "가회사 콜백은 그대로
     불리지만 state.coPick 검사에서 걸러진다"는 것을 정확히 증명할 수 있다. */
  let pendingCbs = [];
  const ctx = {
    /* 2026-08-30: 상호 못 읽은 회사도 목록에 남는다 — 화면이 «보여줄 이름»을 쓴다 */
    coDisplayName: o => (o && String(o.name||'').trim()) || (o && o.bizno) || '',
    esc: s => String(s ?? ''),
    state: { coPick:'' },
    _coFolders: {},
    coList: () => items.slice(),
    coDocsHtml: () => '',
    /* 2026-08-24: 상세 패널이 «값이 어긋난 칸»도 보여준다 — 이 검사는 그 부분을
       안 보므로 빈 값으로 둔다(안 넣으면 coDetailPanelHtml 이 던진다). */
    coConflictHtml: () => '',
    /* 2026-09-02: 회사 열쇠 한 줄 — 이 검사는 안 본다 */
    coErpPinHtml: () => '',
    /* 2026-08-24(4순위): 값마다 «어디서 왔는지» 한 줄이 붙는다 — 이 검사는 안 본다 */
    coSrcTagHtml: () => '',
    /* 2026-08-24(3순위): 값 꺼내기를 coVal 하나로 모았다 — 상세 패널이 그것을 쓴다 */
    coVal: (o, f) => String((o && ((o.extra && o.extra[f]) || o[f])) || '').trim(),
    CO_FIELDS: [],
    closeDetail: () => { calls.detailClosed++; },
    loadErpCaseCons: cb => { pendingCbs.push(cb); },
    renderCoErpHistory: (o, data) => { calls.histCalls.push({ name:o.name, data }); },
    $: id => {
      if(id==='pcDetail') return { set innerHTML(v){ calls.panelHtml=v; }, get innerHTML(){ return calls.panelHtml; },
        classList: { add(){ calls.panelOpen=true; }, remove(){ calls.panelOpen=false; } } };
      if(id==='pcDetailOverlay') return { style:{ set display(v){ calls.overlayOn = (v==='block'); } } };
      return null;
    }
  };
  /* 2026-08-31: coDetailPanelHtml 이 #coInfoBox 를 coInfoBoxHtml 로 채운다
     (기업정보 접기/펼치기, 대표 지시). 그 함수는 coDetailPanelHtml «앞»에 있어
     panelAt~openEnd 자르기에 안 들어온다 — 대역이 아니라 «진짜»를 함께 싣는다. */
  const code = 'let _coInfoOpen = false;\n'
    + fnBody2('coInfoSummary') + '\n' + fnBody2('coInfoBoxHtml') + '\n'
    + fnBody2('erpContractPeriod') + String.fromCharCode(10) + fnBody2('todayYmd') + String.fromCharCode(10)
    + source.slice(panelAt, openEnd) + '\n' + source.slice(pickAt, pickEnd) + '\n' + source.slice(closeAt, closeEnd);
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx._calls = calls;
  ctx._resolvePending = data => { const cbs = pendingCbs; pendingCbs = []; cbs.forEach(cb=>cb(data)); };
  return ctx;
}

test('가회사 조회가 늦게 와도 그 사이 나회사로 옮겼으면 가회사 응답이 나회사 칸에 안 쓰인다', () => {
  const c = loadPanelBlockAsync([
    { key:'ka', name:'가회사', bizno:'', ceo:'', cards:[], extra:{}, folder:'' },
    { key:'kb', name:'나회사', bizno:'', ceo:'', cards:[], extra:{}, folder:'' }
  ]);
  c.pickCo('ka');       // 가회사 패널 열림 — 이알피 조회 콜백이 큐에 쌓임(아직 안 끝남)
  c.pickCo('kb');       // 나회사로 옮김 — state.coPick 이 이제 'kb', 콜백이 하나 더 쌓임
  c._resolvePending({ byBiz: {} });   // 조회가 이제야 끝나 큐에 쌓인 콜백 둘 다 불림
  /* 가회사 콜백도 실제로 불리지만(state.coPick 검사에서 걸러져) 이력 칸엔 안 쓰고,
     지금 화면인 나회사 콜백만 실제로 그린다 — 정확히 한 번, 나회사 몫으로만. */
  assert.equal(c._calls.histCalls.length, 1, '가회사 응답이 걸러지지 않고 그대로 그려지면 안 된다');
  assert.equal(c._calls.histCalls[0].name, '나회사', '지금 화면이 아닌 가회사가 그려지면 안 된다');
});

test('같은 회사를 보고 있을 때 응답이 오면 정상적으로 그린다', () => {
  const c = loadPanelBlockAsync([{ key:'ka', name:'가회사', bizno:'', ceo:'', cards:[], extra:{}, folder:'' }]);
  c.pickCo('ka');
  c._resolvePending({ byBiz: {} });
  assert.equal(c._calls.histCalls.length, 1);
  assert.equal(c._calls.histCalls[0].name, '가회사');
});

/* 최종 전체 리뷰 2026-08-14: ESC 로 패널을 닫을 때 closeDetail() 만 부르면 패널은
   시각적으로 닫히지만 state.coPick 은 그대로 남아, 같은 회사를 다시 눌러도 "이미
   열려 있는 걸 닫는다"는 토글로 오인해 아무 반응이 없었다 — closePcDetail() 을
   불러야 한다. 이 리스너는 익명 함수라 다른 검사처럼 함수째 뽑아 실행하기 어려워,
   ESC 분기 블록 안에 closeDetail() 이 아니라 closePcDetail() 이 있는지 직접 본다. */
test('ESC 로 닫을 때는 closeDetail 이 아니라 closePcDetail 을 불러 coPick 도 비운다', () => {
  const markerAt = source.indexOf('ESC: 열린 패널·창 닫기');
  assert.ok(markerAt > 0, 'ESC 분기 주석을 찾지 못했습니다');
  const at = source.indexOf("if(e.key==='Escape'){", markerAt);
  assert.ok(at > 0, 'ESC 분기를 찾지 못했습니다');
  const end = source.indexOf('\n  }', at);
  const block = source.slice(at, end);
  assert.match(block, /closePcDetail\(\)/, 'ESC 분기가 closePcDetail 을 불러야 한다');
  assert.doesNotMatch(block, /\bcloseDetail\(\)/, 'closeDetail() 만 부르면 coPick 이 안 비워진다');
});

test('폴더에 든 회사는 상세 패널에 폴더 딱지가 보인다', () => {
  const c = loadPanelBlock([{ key:'k1', name:'대명크라샤', bizno:'', ceo:'', cards:[], extra:{}, folder:'f1' }]);
  c._coFolders = { f1:{ id:'f1', name:'현장클리닉' } };
  c.openCoDetailPanel('k1');
  assert.match(c._calls.panelHtml, /현장클리닉/);
});
