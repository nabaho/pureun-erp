/* 회사 상세 팝업에 이알피 컨설팅·사건 이력을 사업자번호로 매칭해 읽기 전용으로
   보여준다. 기록이 없으면 칸 자체를 안 그린다(메모 없으면 메모 칸을 안 그리는 것과
   같은 결). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function loadHistBlock(){
  const nameAt = source.indexOf('function erpConsTypeName');
  const nameEnd = source.indexOf('\n}', nameAt) + 2;
  /* ⚠ 2026-08-24: 이력이 카드에서 «줄»로 바뀌고(erpHistRowHtml), 깔때기·정렬이 붙어
     그리는 일이 coHistPaint 로 갈렸다. 지킬 것은 이 파일의 네 가지 뜻이지 함수 이름이
     아니므로 겨누는 자리를 옮겼다. 더 촘촘한 것은 cards-co-hist-funnel.test.js 가 본다. */
  const cardAt = source.indexOf('function erpHistRowHtml');
  assert.ok(cardAt > 0, 'erpHistRowHtml 을 찾지 못했습니다');
  const renderAt = source.indexOf('function renderCoErpHistory');
  assert.ok(renderAt > 0, 'renderCoErpHistory 를 찾지 못했습니다');
  /* 그리는 몸통(coHistPaint)까지 담아야 한다 — 안 담으면 renderCoErpHistory 가
     그것을 부르다 ReferenceError 로 죽는다. */
  const renderEnd = source.indexOf('\n/* 회사가 어떤 사업으로 들어왔는지');
  assert.ok(renderEnd > renderAt, '이력 묶음의 끝을 찾지 못했습니다');
  /* erpConsTypeName 바로 뒤에 erpMgrName 이 붙어 있고(브리프 Step 3), 그 뒤로
     erpHistCardHtml·renderCoErpHistory 가 이어진다 — 넷 다 소스에서 한 덩어리로 붙어
     있으므로 nameAt~renderEnd 를 통째로 잘라야 erpMgrName 이 안 빠진다. [nameAt,nameEnd]
     + [cardAt,renderEnd] 로 나눠 자르면 그 사이의 erpMgrName 정의가 통째로 누락되어
     erpHistCardHtml 이 부르는 erpMgrName 이 ReferenceError 로 죽는다. */
    /* 유형 코드 도우미(erpTypeCodeOf 등)도 함께 떠 온다 — 흉내 내면 진짜와 어긋난다 */
  const _pureAt = source.indexOf('/* \u2550\u2550\u2550\u2550\u2550\u2550 \uc774\uc54c\ud53c \ucf54\ub4dc\ud45c \uc77d\uae30 \u2014 \uc21c\uc218 \ub85c\uc9c1');
  const _pureEnd = source.indexOf('/* \u2550\u2550\u2550\u2550\u2550\u2550 \uc774\uc54c\ud53c \ucf54\ub4dc\ud45c \uc77d\uae30 \u2014 \ud654\uba74');
  assert.ok(_pureAt > 0 && _pureEnd > _pureAt, '\uc774\uc54c\ud53c \ucf54\ub4dc\ud45c \uc21c\uc218 \ub85c\uc9c1 \ubb36\uc74c\uc744 \ucc3e\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4');
  const _pure = source.slice(_pureAt, _pureEnd);
const code = _pure + '\n' + source.slice(nameAt, renderEnd);

  const calls = { boxHtml: '' };
  const ctx = {
    Object, Array, String, Number, Boolean, Math, Date, JSON,
    esc: s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    digits: s => String(s||'').replace(/\D/g,''),
    _norm: s => String(s||'').replace(/\s|\(주\)|주식회사|㈜/g,'').replace(/[.#$/[\]]/g,'').toLowerCase(),
    _erpConsTypes: [{ code:'cons-ilteo', name:'일터상생혁신', agency:'노사발전재단' }],
    _erpHistTypes: { consulting: [{ code:'cons-ilteo', name:'일터상생혁신', agency:'노사발전재단' }] },
    ErpMatch: { nameByEmail: {} },
    /* 2026-08-26(2단계): coHistPaint 가 서류 붙임새를 함께 셈한다 —
       이 검사들은 이력 줄만 보므로 «붙일 서류가 없다»고 답하는 대역을 준다. */
    docCasePlan: function(){ return { byCase:{}, left:[] }; },
    coLeftDocsPaint: function(){},
    coCaseDocsHtml: function(){ return ''; },
    $: id => { if(id==='coErpHistBox') return { set innerHTML(v){ calls.boxHtml=v; }, get innerHTML(){ return calls.boxHtml; } }; return null; }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx._calls = calls;
  return ctx;
}

test('기록이 없으면 칸을 비운다', () => {
  const c = loadHistBlock();
  c.renderCoErpHistory({ bizno:'312-81-49225', name:'가나' }, null);
  assert.equal(c._calls.boxHtml, '');
  c.renderCoErpHistory({ bizno:'312-81-49225', name:'가나' }, { byBiz:{}, byName:{} });
  assert.equal(c._calls.boxHtml, '');
});

test('사업자번호로 매칭되는 기록만 줄로 나열한다', () => {
  const c = loadHistBlock();
  const data = { byBiz: { '3128149225': [
    { _kind:'case', typeName:'부당해고 구제신청', status:'pending', brief:'해고 구제 신청', managerMain:'p001' },
    { _kind:'consulting', typeCode:'cons-ilteo', status:'active', contractFee:1000000, balanceFee:500000, startDate:'2025-03-01', endDate:'2025-06-30', managerMain:'p002' }
  ] } };
  c.renderCoErpHistory({ bizno:'312-81-49225', name:'가나' }, data);
  assert.match(c._calls.boxHtml, /부당해고 구제신청/);
  assert.match(c._calls.boxHtml, /일터상생혁신/, '컨설팅은 typeCode 를 사람이 읽는 이름으로 바꿔 보여줘야 한다');
  assert.match(c._calls.boxHtml, /1,500,000/, '계약금과 잔금을 합쳐 보여줘야 한다');
});

test('다른 회사(다른 사업자번호·다른 이름)의 기록은 안 섞인다', () => {
  const c = loadHistBlock();
  const data = { byBiz: { '9999999999': [{ _kind:'case', typeName:'남의 회사 사건' }] },
                 byName: { '남의회사': [{ _kind:'case', typeName:'남의 회사 사건2' }] } };
  c.renderCoErpHistory({ bizno:'312-81-49225', name:'가나기업' }, data);
  assert.equal(c._calls.boxHtml, '');
});

test('이력 줄은 담당자 사번을 이름으로 바꿔 보여준다', () => {
  const c = loadHistBlock();
  c.ErpMatch.nameByEmail = { 'p001@pureun.kr': '김혜민' };
  const row = c.erpHistRow({ _kind:'case', typeName:'부당해고', managerMain:'p001',
                             receiveDate:'2024-01-02' }, c._erpHistTypes);
  assert.match(c.erpHistRowHtml(row, true), /김혜민/);
});
