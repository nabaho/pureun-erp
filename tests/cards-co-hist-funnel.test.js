'use strict';
/* 기업 상세 — 「이 회사에서 한 일」: 깔때기·정렬 (대표 승인 목업 2026-08-24)

   대표 지시: "동일 사업장에서 다양한 컨설팅을 여러 번 한 경우에 몇 년도 어떤 컨설팅
   얼마 금액 등에 대한 기록들을 모두 연결시켜 남겨 둬라. 그렇게 해야 한 번에 관리가
   된다." · "좀 더 깔끔하게 정리하고 정렬해서 확인할 수 있게 보고 싶다. 깔때기 같은
   기능도 필요할 것 같다."

   ■ 이력 칸은 이미 있었는데 대표님 화면에는 하나도 안 나왔다. 까닭 셋:
     ① **사업자번호로만** 이었다 — 컨설팅 건에 번호가 비어 있으면 이름이 똑같아도 버렸다.
     ② 컨설팅·사건만 읽었다 — 기금·기타사업은 아예 안 읽었다.
     ③ 해가 안 보였다 — 기간만 나와서 몇 년도 것이 몇 건인지 눈으로 세야 했다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8');

/* 순수 로직 묶음 + 화면 묶음을 함께 떠서 **실제로 돌린다** — 모양만 보면
   「앞 덩이가 이긴다·빈 칸만 채운다」 같은 것을 증명할 수 없다. */
function load() {
  const pureAt = app.indexOf('/* ══════ 이알피 코드표 읽기 — 순수 로직');
  const pureEnd = app.indexOf('/* ══════ 이알피 코드표 읽기 — 화면');
  assert.ok(pureAt > 0 && pureEnd > pureAt, '순수 로직 묶음을 찾지 못했습니다');
  const box = { html: '' };
  const ctx = {
    Object, Array, String, Number, Boolean, Math, JSON, Date, console,
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
      c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])),
    digits: s => String(s || '').replace(/\D/g, ''),
    _norm: s => String(s || '').replace(/\s|\(주\)|주식회사|㈜/g, '').replace(/[.#$/[\]]/g, '').toLowerCase(),
    _erpConsTypes: null,
    _erpHistTypes: {},
    ErpMatch: { nameByEmail: {} },
    /* 2026-08-26(2단계): coHistPaint 가 서류 붙임새를 함께 셈한다 —
       이 검사들은 이력 줄만 보므로 «붙일 서류가 없다»고 답하는 대역을 준다. */
    docCasePlan: function(){ return { byCase:{}, left:[] }; },
    coLeftDocsPaint: function(){},
    /* 2026-08-26(3단계): 사업 줄이 받는 자리가 되면서 열쇠를 짓는다 —
       이 검사들은 이력 줄만 보므로 빈 열쇠를 주는 대역으로 둔다. */
    /* 2026-08-29: coHistPaint 가 취업규칙 회차를 함께 붙인다 —
       이 검사들은 이알피 이력 줄만 보므로 «회차가 없다»고 답하는 대역을 준다. */
    coRulesRecs: function(){ return []; },
    caseKeyOf: function(){ return ''; },
    coCaseDocsHtml: function(){ return ''; },
    $: id => (id === 'coErpHistBox'
      ? { set innerHTML(v) { box.html = v; }, get innerHTML() { return box.html; } } : null)
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext([
    /* 읽는 자리 목록은 순수 묶음 «밖»에 있다 — 그것을 손으로 베끼면 진짜와 어긋난다 */
    app.match(/^const ERP_HIST_KINDS = \[[\s\S]*?\n\];$/m)[0],
    app.slice(pureAt, pureEnd),
    cutFn(app, 'function erpMgrName('),
    cutFn(app, 'function erpHistRowHtml('),
    'var _coHist = { o:null, data:null, pick:null };',
    cutFn(app, 'function coHistFresh('),
    cutFn(app, 'function renderCoErpHistory('),
    cutFn(app, 'function coHistSet('),
    cutFn(app, 'function coHistPaint('),
    /* ⚠ top-level const/let 은 vm 컨텍스트의 프로퍼티가 «되지 않는다» — 밖에서
       c.ERP_HIST_SORTS 로 손댈 수 없다. 한 줄로 옮겨 담는다. */
    'globalThis._C = { KINDS: ERP_HIST_KINDS, SORTS: ERP_HIST_SORTS, LABEL: ERP_HIST_LABEL };'
  ].join('\n'), ctx);
  ctx._box = box;
  return ctx;
}
/* ⚠ vm 안에서 만든 배열·객체는 이 쪽 realm 의 것과 **참조가 다르다** — deepEqual 이
   「같은 모양인데 참조가 다르다」로 운다. 모양만 견준다(이 저장소에서 여러 번 겪었다). */
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));

/* 실데이터 모양대로 — 사업마다 유형 사전이 따로다 */
const TYPES = {
  consulting: [{ code: 'cons-clinic', name: '현장클리닉' }, { code: 'cons-techguard', name: '기술보호울타리' },
               { code: 'cons-ilteo', name: '일터혁신' }],
  fund: [{ code: 'fund-setup', name: '복지기금 설립' }],
  other: [{ code: 'oth-edu', name: '관리자 교육' }]
};
const REC = {
  clinic: { _kind:'consulting', typeCode:'cons-clinic', startDate:'2026-03-02', endDate:'2026-06-30',
            contractFee:1650000, balanceFee:1650000, status:'active', managerMain:'p001', no:'클릭-012' },
  guard:  { _kind:'consulting', typeCodes:{ consulting:'cons-techguard' }, startDate:'2026-05-11',
            contractFee:5500000, status:'active', managerMain:'p002', no:'기보-004', _byName:true },
  ilteo:  { _kind:'consulting', typeCode:'cons-ilteo', startDate:'2025-04-01', endDate:'2025-11-28',
            contractFee:4400000, status:'closed', managerMain:'p001', no:'일혁-031' },
  fund:   { _kind:'fund', typeCodes:{ fund:'fund-setup' }, startDate:'2025-09-15', endDate:'2025-12-20',
            contractFee:3300000, status:'closed', managerMain:'p003', no:'복기-007' },
  edu:    { _kind:'other', typeCodes:{ other:'oth-edu' }, startDate:'2026-07-01',
            fee:1200000, status:'pending', managerMain:'p003', no:'교육-021' },
  case1:  { _kind:'case', typeName:'부당해고 구제신청', receiveDate:'2023-06-08', closeDate:'2023-10-02',
            retainerFee:1100000, successFee:1100000, status:'closed', managerMain:'p002' }
};
const ALL = [REC.clinic, REC.guard, REC.edu, REC.ilteo, REC.fund, REC.case1];

function paint(ctx, o, data) {
  ctx._erpHistTypes = TYPES;
  ctx.renderCoErpHistory(o, data);
  return ctx._box.html;
}

/* 색인을 «만드는» 길도 실제로 돌린다. 걸러기만 재고 만들기를 안 재면, 번호 없는
   기록을 버리는 옛 규칙으로 되돌려도 검사가 조용히 통과한다(실제로 그랬다). */
function loadIndexer(fixtures) {
  const kindsDecl = app.match(/^const ERP_HIST_KINDS = \[[\s\S]*?\n\];$/m)[0];
  const at = app.indexOf('function loadErpCaseCons');
  const end = app.indexOf('\nfunction erpUnwrapList');
  assert.ok(at > 0 && end > at, 'loadErpCaseCons 를 잘라내지 못했습니다');
  const seen = [];
  const ctx = {
    Object, Array, String, Number, Promise, console,
    Store: { mode: 'firebase' },
    firebase: { database: () => ({ ref: p => ({ once: () => {
      seen.push(p);
      return Promise.resolve({ val: () => fixtures[p] });
    } }) }) },
    digits: s => String(s || '').replace(/\D/g, ''),
    _norm: s => String(s || '').replace(/\s|\(주\)|주식회사|㈜/g, '').replace(/[.#$/[\]]/g, '').toLowerCase(),
    _erpCaseCons: null, _erpCaseConsLoading: false, _erpConsTypes: null,
    _erpHistTypes: {}, _erpCaseConsWaiters: []
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext([kindsDecl, app.slice(at, end), cutFn(app, 'function erpUnwrapList(')].join('\n'), ctx);
  ctx._seen = seen;
  return ctx;
}
const idx = (fixtures) => new Promise(res => loadIndexer(fixtures).loadErpCaseCons(res));

test('★ 사업자번호가 있는 기록은 번호 색인에 담는다', async () => {
  const got = await idx({ 'data/consultings/v': { k1: { bizNo:'312-81-49225', companyName:'가나기업' } } });
  assert.equal((got.byBiz['3128149225'] || []).length, 1);
  assert.equal(Object.keys(got.byName).length, 0, '번호가 있으면 이름 색인에는 안 담습니다');
});

test('★ 사업자번호가 없으면 «이름 색인»에 담는다 — 예전에는 여기서 버렸다', async () => {
  const got = await idx({ 'data/consultings/v': { k1: { companyName:'(주) 가나기업', typeCode:'cons-clinic' } } });
  assert.equal(Object.keys(got.byBiz).length, 0, '10자리가 아닌 것을 번호 색인에 넣으면 안 됩니다');
  assert.equal((got.byName['가나기업'] || []).length, 1,
    '★ 버리면 그 회사는 이력이 통째로 안 붙습니다 — 대표님 화면이 빈 까닭입니다');
  assert.equal(got.byName['가나기업'][0]._byName, true,
    '★ 이름으로 이은 표를 안 달면 화면이 그 사실을 밝힐 수 없습니다');
});

test('이름 색인의 열쇠는 업체관리 맞추기와 같은 규칙으로 다듬는다', async () => {
  const got = await idx({ 'data/funds/v': { f1: { companyName:'주식회사 가나 기업' } } });
  assert.ok(got.byName['가나기업'], '★ 규칙이 갈리면 같은 회사가 이름 하나 차이로 안 붙습니다: '
    + Object.keys(got.byName).join(','));
});

test('회사 이름이 어느 칸에 있어도 찾는다 — 사업마다 칸 이름이 다르다', async () => {
  const a = await idx({ 'data/cases/v': { c1: { company:'가나기업' } } });
  assert.ok(a.byName['가나기업'], 'company 칸을 안 봅니다');
  const b = await idx({ 'data/cases/v': { c1: { name:'가나기업' } } });
  assert.ok(b.byName['가나기업'], 'name 칸을 안 봅니다');
});

test('이름도 번호도 없는 기록은 어느 색인에도 안 담는다', async () => {
  const got = await idx({ 'data/consultings/v': { k1: { typeCode:'cons-clinic' } } });
  assert.equal(Object.keys(got.byBiz).length, 0);
  assert.equal(Object.keys(got.byName).length, 0);
});

test('★ 넷을 다 읽고, 갈래 표를 제대로 붙인다', async () => {
  const got = await idx({
    'data/consultings/v': { a: { bizNo:'312-81-49225' } },
    'data/cases/v':       { b: { bizNo:'312-81-49225' } },
    'data/funds/v':       { c: { bizNo:'312-81-49225' } },
    'data/other_projects/v': { d: { bizNo:'312-81-49225' } }
  });
  const kinds = (got.byBiz['3128149225'] || []).map(r => r._kind).sort();
  same(kinds, ['case', 'consulting', 'fund', 'other']);
});

test('★ 사업마다 유형 사전을 제 자리에 담는다 — 한 벌로 뭉치면 이름이 섞인다', async () => {
  const c = loadIndexer({
    'data/biz_cons_types':  { v: [{ code:'cons-clinic', name:'현장클리닉' }] },
    'data/biz_fund_types':  { v: [{ code:'fund-setup', name:'복지기금 설립' }] },
    'data/biz_other_types': { v: [{ code:'oth-edu', name:'관리자 교육' }] }
  });
  await new Promise(res => c.loadErpCaseCons(res));
  assert.equal(c._erpHistTypes.consulting[0].name, '현장클리닉');
  assert.equal(c._erpHistTypes.fund[0].name, '복지기금 설립');
  assert.equal(c._erpHistTypes.other[0].name, '관리자 교육');
  assert.equal(c._erpConsTypes[0].name, '현장클리닉', '옛 이름(_erpConsTypes)도 이어져야 합니다');
});

test('★ 다섯과 사전 셋, 여덟 자리를 읽는다 — 그 밖은 안 건드린다', async () => {
  /* ⚠ 2026-08-31: 계약(data/contracts/v)을 더했다(점검 C1). 지킬 것은 「정해진 자리만
     읽는다」이지 「여덟」이라는 숫자가 아니다 — 다만 자리가 느는 것은 요금이 느는 일이라
     손으로 적어 두고 사람이 한 번 더 보게 한다. */
  const c = loadIndexer({});
  await new Promise(res => c.loadErpCaseCons(res));
  same(c._seen.slice().sort(), ['data/biz_cons_types', 'data/biz_fund_types', 'data/biz_other_types',
    'data/cases/v', 'data/consultings/v', 'data/contracts/v',
    'data/funds/v', 'data/other_projects/v']);
});

/* ══════ ① 잇는 방법 — 이것이 안 나오던 까닭이다 ══════ */

test('★ 사업자번호가 맞으면 그 회사 기록만 붙인다', () => {
  const c = load();
  const rows = c.erpHistRecsFor({ byBiz: { '3128149225': [REC.clinic] },
                                  byName: { '가나기업': [REC.ilteo] } }, '312-81-49225', '가나기업');
  assert.equal(rows.length, 1, '★ 번호가 회사를 딱 가리키는데 이름 쪽까지 섞으면 남의 금액이 합계에 듭니다');
  assert.equal(rows[0], REC.clinic);
});

test('★ 사업자번호로 못 찾으면 «이름으로» 잇는다 — 이력이 하나도 안 나온 까닭', () => {
  const c = load();
  const rows = c.erpHistRecsFor({ byBiz: {}, byName: { '가나기업': [REC.ilteo, REC.fund] } },
                                '312-81-49225', '(주) 가나기업');
  assert.equal(rows.length, 2,
    '★ 컨설팅 건에 사업자번호를 안 적는 일이 흔합니다 — 버리면 이력이 통째로 안 붙습니다');
});

test('이름 다듬기는 업체관리 맞추기와 같은 규칙이다 — ㈜·띄어쓰기를 떼고 견준다', () => {
  const c = load();
  const rows = c.erpHistRecsFor({ byBiz: {}, byName: { '가나기업': [REC.ilteo] } }, '', '주식회사 가나 기업');
  assert.equal(rows.length, 1, '규칙이 갈리면 같은 회사가 이름 하나 차이로 안 붙습니다');
});

test('이름도 번호도 없으면 아무것도 안 붙인다 — 남의 기록을 끌어오면 안 된다', () => {
  const c = load();
  assert.equal(c.erpHistRecsFor({ byBiz: {}, byName: { '가나': [REC.ilteo] } }, '', '').length, 0);
  assert.equal(c.erpHistRecsFor(null, '312-81-49225', '가나').length, 0);
});

test('byName 이 없는 옛 꼴로 와도 터지지 않는다', () => {
  const c = load();
  assert.equal(c.erpHistRecsFor({ byBiz: {} }, '312-81-49225', '가나').length, 0);
});

/* ══════ ② 넷을 함께 ══════ */

test('★ 읽는 자리에 기금·기타사업이 들어 있다 — 「한 번에 관리」가 되려면 한자리여야 한다', () => {
  const c = load();
  const stores = c._C.KINDS.map(s => s.store).sort();
  same(stores, ['cases', 'consultings', 'contracts', 'funds', 'other_projects']);
  /* 사전이 «필요 없는» 갈래는 여기 이름으로 적어 둔다 — 제 안에 이름을 담는 것들이다
     (사건은 typeName, 계약은 kind). 목록으로 적어야 사전을 빠뜨린 새 갈래가
     조용히 섞여 들어와 「(이름 없음)」이 되는 것을 막는다. */
  const 사전없이도되는것 = ['case', 'contract'];
  c._C.KINDS.forEach(s => {
    if (사전없이도되는것.includes(s.kind)) return;
    assert.ok(s.types, s.kind + ' 의 유형 사전 자리가 없습니다 — 이름 대신 코드가 그대로 나옵니다');
  });
});

test('★ 기금·기타사업의 유형 이름을 제 사전에서 찾는다 — 옛 코드는 컨설팅으로 몰았다', () => {
  const c = load();
  c._erpHistTypes = TYPES;
  assert.equal(c.erpHistName(REC.fund, TYPES), '복지기금 설립',
    '★ typeCodes.fund 를 안 보면 기금 기록이 「(이름 없음)」이 됩니다');
  assert.equal(c.erpHistName(REC.edu, TYPES), '관리자 교육');
  assert.equal(c.erpHistName(REC.guard, TYPES), '기술보호울타리', '새 자리(typeCodes)를 먼저 봐야 합니다');
  assert.equal(c.erpHistName(REC.clinic, TYPES), '현장클리닉', '옛 자리(typeCode)도 봐야 합니다');
  assert.equal(c.erpHistName(REC.case1, TYPES), '부당해고 구제신청', '사건은 레코드에 이름이 박혀 있습니다');
});

test('갈래 머리를 떼는 규칙도 목록에서 만든다 — 손으로 적으면 기금이 폴더 이름에 남는다', () => {
  const c = load();
  assert.equal(c.erpHistStripKind('기금·복지기금 설립'), '복지기금 설립');
  assert.equal(c.erpHistStripKind('컨설팅·현장클리닉'), '현장클리닉');
  assert.equal(c.erpHistStripKind('사건·부당해고'), '부당해고');
  assert.equal(c.erpHistStripKind('현장클리닉'), '현장클리닉', '머리가 없으면 그대로 둡니다');
});

/* ══════ ③ 값 뽑기 ══════ */

test('★ 해는 시작일에서 뽑고, 없으면 접수일·끝난일을 본다', () => {
  const c = load();
  assert.equal(c.erpHistYear(REC.clinic), 2026);
  /* ⚠ 접수일«만» 있는 것으로 잰다. 끝난일이 함께 있으면 접수일을 안 봐도 같은 해가
     나와서, 접수일을 빼도 검사가 조용히 통과한다(실제로 그랬다). */
  assert.equal(c.erpHistYear({ receiveDate: '2021-02-15' }), 2021,
    '★ 사건은 접수일이 시작입니다 — 안 보면 「해 모름」으로 떨어집니다');
  assert.equal(c.erpHistYear(REC.case1), 2023);
  assert.equal(c.erpHistYear({ closedAt: '2019-08-01T00:00:00Z' }), 2019);
});

test('★ 해를 못 찾으면 0 을 준다 — 오늘 해로 메우면 십 년 전 것이 올해로 올라온다', () => {
  const c = load();
  assert.equal(c.erpHistYear({}), 0);
  assert.equal(c.erpHistYear({ startDate: '' }), 0);
});

test('★ 계약금·잔금·착수금·성공보수를 합친다', () => {
  const c = load();
  assert.equal(c.erpHistFee(REC.clinic), 3300000);
  assert.equal(c.erpHistFee(REC.case1), 2200000, '사건은 착수금+성공보수입니다');
});

test('★ 갈라 담은 것이 있으면 옛 fee 를 «더하지 않는다» — 더하면 두 배가 된다', () => {
  /* 이알피가 옛 자료를 옮길 때 fee 를 반씩 갈라 contractFee/balanceFee 에 넣었다. */
  const c = load();
  assert.equal(c.erpHistFee({ fee: 1000000, contractFee: 500000, balanceFee: 500000 }), 1000000,
    '★ 옛 칸까지 더해 금액이 두 배로 보입니다');
  assert.equal(c.erpHistFee({ fee: 1200000 }), 1200000, '옛 자료만 있으면 그것을 씁니다');
  assert.equal(c.erpHistFee({}), 0);
});

test('★ 상태 낱말이 사업마다 달라도 넷으로 모은다 — 갈리면 「완료」와 「종료」가 따로 세어진다', () => {
  const c = load();
  assert.equal(c.erpHistStat({ status: 'closed' }), 'done');
  assert.equal(c.erpHistStat({ status: 'done' }), 'done');
  assert.equal(c.erpHistStat({ status: 'active' }), 'run');
  assert.equal(c.erpHistStat({ status: 'open' }), 'run');
  assert.equal(c.erpHistStat({ status: 'pending' }), 'wait');
  assert.equal(c.erpHistStat({ status: 'cancelled' }), 'cancel');
  assert.equal(c.erpHistStat({ permanentArchived: true, status: 'active' }), 'done',
    '보관된 것은 끝난 것입니다');
});

test('기간은 월·일만 뽑는다 — 해는 머리줄이나 줄 앞에 따로 붙는다', () => {
  const c = load();
  assert.equal(c.erpHistMd('2026-03-02'), '03-02');
  assert.equal(c.erpHistMd('2026.3.2'), '03-02');
  assert.equal(c.erpHistMd(''), '');
});

/* ══════ ④ 깔때기 ══════ */

function rows(c) { return ALL.map(r => c.erpHistRow(r, TYPES)); }

test('★ 갈래를 하나도 안 켰으면 «전체»다 — 마지막 칩을 끈 순간 비면 고장으로 읽힌다', () => {
  const c = load();
  assert.equal(c.erpHistPick(rows(c), { kinds: {} }).length, 6);
  assert.equal(c.erpHistPick(rows(c), {}).length, 6);
});

test('★ 갈래는 여러 개를 함께 켤 수 있다', () => {
  const c = load();
  assert.equal(c.erpHistPick(rows(c), { kinds: { fund: true } }).length, 1);
  assert.equal(c.erpHistPick(rows(c), { kinds: { fund: true, case: true } }).length, 2,
    '★ 하나만 걸리면 여러 갈래를 함께 볼 수 없습니다');
});

test('해·상태로도 좁힌다', () => {
  const c = load();
  assert.equal(c.erpHistPick(rows(c), { year: '2026' }).length, 3);
  assert.equal(c.erpHistPick(rows(c), { year: 2026 }).length, 3, '숫자로 와도 같아야 합니다');
  assert.equal(c.erpHistPick(rows(c), { stat: 'done' }).length, 3);
  assert.equal(c.erpHistPick(rows(c), { kinds: { consulting: true }, year: '2026' }).length, 2,
    '여러 조건은 함께 걸립니다');
});

test('★ 갈래마다 건수를 센다 — 칩에 숫자를 달고 0건은 칩을 안 만들려고 쓴다', () => {
  const c = load();
  const n = c.erpHistCounts(rows(c));
  assert.equal(n.consulting, 3);
  assert.equal(n.fund, 1);
  assert.equal(n.other, 1);
  assert.equal(n.case, 1);
  assert.equal(n.advisory, undefined, '없는 갈래는 세지 않습니다');
});

/* ══════ ⑤ 정렬 ══════ */

test('★ 최근 해부터가 기본이다', () => {
  const c = load();
  assert.deepEqual(c.erpHistSort(rows(c), 'newest').map(r => r.year), [2026, 2026, 2026, 2025, 2025, 2023]);
  assert.deepEqual(c.erpHistSort(rows(c), undefined).map(r => r.year), [2026, 2026, 2026, 2025, 2025, 2023],
    '정렬을 안 주면 최근 해부터여야 합니다');
});

test('오래된 해부터도 된다', () => {
  const c = load();
  assert.deepEqual(c.erpHistSort(rows(c), 'oldest').map(r => r.year), [2023, 2025, 2025, 2026, 2026, 2026]);
});

test('★ 금액 큰 순', () => {
  const c = load();
  const f = c.erpHistSort(rows(c), 'fee').map(r => r.fee);
  assert.deepEqual(f, [5500000, 4400000, 3300000, 3300000, 2200000, 1200000]);
});

test('★ 금액순·갈래별에서는 해로 «묶지 않는다» — 묶음이 정렬을 이긴다', () => {
  const c = load();
  assert.equal(c.erpHistGrouped('newest'), true);
  assert.equal(c.erpHistGrouped('oldest'), true);
  assert.equal(c.erpHistGrouped('fee'), false,
    '★ 금액 큰 순으로 봤는데 해로 묶으면 550만원이 아래에 있게 됩니다');
  assert.equal(c.erpHistGrouped('kind'), false);
});

test('갈래별은 컨설팅부터 — 회사가 우리에게 맡긴 일의 무게 순이다', () => {
  const c = load();
  assert.deepEqual(c.erpHistSort(rows(c), 'kind').map(r => r.kind),
    ['consulting', 'consulting', 'consulting', 'case', 'fund', 'other']);
});

/* ══════ ⑥ 합계 ══════ */

test('★ 합계는 건수·금액·몇 개 해를 함께 준다', () => {
  const c = load();
  const s = c.erpHistSum(rows(c));
  assert.equal(s.n, 6);
  assert.equal(s.fee, 19900000);
  assert.equal(s.years, 3);
});

test('★ 걸러면 «보이는 것»의 합계를 따로 셀 수 있다 — 전체값을 보여주면 숫자를 잘못 읽는다', () => {
  const c = load();
  const only = c.erpHistPick(rows(c), { kinds: { fund: true } });
  assert.equal(c.erpHistSum(only).fee, 3300000);
  assert.notEqual(c.erpHistSum(only).fee, c.erpHistSum(rows(c)).fee);
});

test('해를 못 찾은 기록은 「몇 개 해」에 안 센다', () => {
  const c = load();
  assert.equal(c.erpHistSum([{ year: 0, fee: 100 }]).years, 0);
});

test('큰 금액은 짧게 적는다', () => {
  const c = load();
  assert.equal(c.erpHistShortWon(19900000), '1,990만원');
  assert.equal(c.erpHistShortWon(391000000), '3.9억원');
  assert.equal(c.erpHistShortWon(0), '0원');
});

/* ══════ ⑦ 화면 ══════ */

test('★ 기록이 없으면 칸 자체를 안 그린다 — 메모 없으면 메모 칸을 안 그리는 것과 같다', () => {
  const c = load();
  assert.equal(paint(c, { bizno: '312-81-49225', name: '가나' }, null), '');
  assert.equal(paint(c, { bizno: '312-81-49225', name: '가나' }, { byBiz: {}, byName: {} }), '');
});

test('★ 줄 하나에 두 층 — 윗층은 갈래·이름·금액, 아랫층은 기간·담당·번호·상태', () => {
  const c = load();
  c.ErpMatch.nameByEmail = { 'p001@pureun.kr': '김혜민' };
  const h = paint(c, { bizno: '312-81-49225', name: '가나' }, { byBiz: { '3128149225': [REC.clinic] } });
  assert.match(h, /class="bd k-consulting">컨설팅</, '갈래 배지가 없습니다');
  assert.match(h, /class="nm">현장클리닉</, '이름이 코드로 나옵니다');
  assert.match(h, /class="fee">3,300,000원</, '금액이 안 나옵니다');
  assert.match(h, /03-02~06-30/, '기간이 안 나옵니다');
  assert.match(h, /김혜민/, '★ 담당자가 사번(p001)으로 나오면 누구인지 알 수 없습니다');
  assert.match(h, /클릭-012/, '관리번호가 안 나옵니다');
  assert.match(h, /class="st s-run">진행중</, '상태가 안 나옵니다');
});

test('★ 이름으로 이은 것은 그 사실을 밝힌다 — 같은 이름 다른 회사일 수 있다', () => {
  const c = load();
  const h = paint(c, { bizno: '', name: '가나기업' }, { byBiz: {}, byName: { '가나기업': [REC.guard] } });
  assert.match(h, /cohist-byname/, '★ 이름으로 이은 것을 숨기면 남의 회사 기록을 제 것으로 읽습니다');
});

test('번호로 이은 것에는 그 표가 안 붙는다', () => {
  const c = load();
  const h = paint(c, { bizno: '312-81-49225', name: '가나' }, { byBiz: { '3128149225': [REC.clinic] } });
  assert.ok(h.indexOf('cohist-byname') < 0, '번호로 이었는데 「이름」 표가 붙습니다');
});

test('★ 해 머리줄에 그 해의 건수·금액을 적는다', () => {
  const c = load();
  const h = paint(c, { bizno: '312-81-49225', name: '가나' }, { byBiz: { '3128149225': ALL } });
  assert.match(h, /class="cohist-yr"[\s\S]*?2026년[\s\S]*?3건 · 10,000,000원/,
    '★ 해마다 몇 건 얼마인지 안 적으면 눈으로 세야 합니다');
});

test('★ 걸러면 합계가 함께 따라오고, 전체값도 곁에 남는다', () => {
  const c = load();
  paint(c, { bizno: '312-81-49225', name: '가나' }, { byBiz: { '3128149225': ALL } });
  assert.match(c._box.html, /모두<\/span><b>19,900,000원<\/b>/, '안 걸렀을 때는 「모두」입니다');
  c.coHistSet('kind', 'fund');
  assert.match(c._box.html, /보이는 것<\/span><b>3,300,000원<\/b>/,
    '★ 걸러 놓고 합계가 전체값이면 숫자를 잘못 읽습니다');
  assert.match(c._box.html, /class="of">모두 6건 1,990만원/, '전체가 얼마였는지도 곁에 있어야 합니다');
});

test('★ 0건인 갈래는 칩을 아예 안 만든다 — 눌러도 안 되는 단추는 고장으로 읽힌다', () => {
  const c = load();
  const h = paint(c, { bizno: '312-81-49225', name: '가나' },
    { byBiz: { '3128149225': [REC.clinic, REC.ilteo, REC.fund] } });
  assert.match(h, /coHistSet\('kind','consulting'\)/);
  assert.match(h, /coHistSet\('kind','fund'\)/);
  assert.ok(h.indexOf("coHistSet('kind','case')") < 0, '★ 사건이 0건인데 사건 칩이 있습니다');
  assert.ok(h.indexOf("coHistSet('kind','other')") < 0);
});

test('★ 건이 셋보다 적으면 깔때기를 아예 안 보인다 — 조작줄 두 줄이 자리만 먹는다', () => {
  const c = load();
  const h2 = paint(c, { bizno: '312-81-49225', name: '가나' }, { byBiz: { '3128149225': [REC.clinic, REC.fund] } });
  assert.ok(h2.indexOf('cohist-funnel') < 0, '★ 두 건 앞에 깔때기를 펴고 있습니다');
  assert.match(h2, /현장클리닉/, '깔때기는 접어도 목록은 나와야 합니다');
  const h3 = paint(c, { bizno: '312-81-49225', name: '가나' }, { byBiz: { '3128149225': ALL } });
  assert.match(h3, /cohist-funnel/, '여섯 건인데 깔때기가 없습니다');
});

test('★ 고른 것이 없으면 왜 없는지 말하고 넓힐 길을 알려 준다', () => {
  const c = load();
  paint(c, { bizno: '312-81-49225', name: '가나' }, { byBiz: { '3128149225': ALL } });
  c.coHistSet('year', '2026');
  c.coHistSet('stat', 'done');
  assert.match(c._box.html, /class="cohist-none"/, '★ 빈 화면만 남으면 고장으로 읽힙니다');
  assert.match(c._box.html, /넓혀/, '어떻게 되돌리는지 안 알려 줍니다');
  assert.match(c._box.html, /cohist-reset/, '되돌리기 단추가 없습니다');
});

test('★ 「전체」 칩은 갈래 고르기를 통째로 푼다', () => {
  const c = load();
  paint(c, { bizno: '312-81-49225', name: '가나' }, { byBiz: { '3128149225': ALL } });
  c.coHistSet('kind', 'fund');
  c.coHistSet('kind', 'case');
  assert.equal(Object.keys(c._coHist.pick.kinds).filter(k => c._coHist.pick.kinds[k]).length, 2);
  c.coHistSet('kind', '');
  assert.equal(Object.keys(c._coHist.pick.kinds).filter(k => c._coHist.pick.kinds[k]).length, 0);
  assert.match(c._box.html, /class="cohist-chip k-all on"/, '푼 뒤에는 「전체」가 켜져 보여야 합니다');
});

test('같은 칩을 두 번 누르면 꺼진다', () => {
  const c = load();
  paint(c, { bizno: '312-81-49225', name: '가나' }, { byBiz: { '3128149225': ALL } });
  c.coHistSet('kind', 'fund');
  assert.equal(c.erpHistPick(rows(c), c._coHist.pick).length, 1);
  c.coHistSet('kind', 'fund');
  assert.equal(c.erpHistPick(rows(c), c._coHist.pick).length, 6);
});

test('되돌리기는 갈래·해·상태·정렬을 모두 처음으로', () => {
  const c = load();
  paint(c, { bizno: '312-81-49225', name: '가나' }, { byBiz: { '3128149225': ALL } });
  c.coHistSet('kind', 'fund'); c.coHistSet('year', '2025');
  c.coHistSet('stat', 'done'); c.coHistSet('sort', 'fee');
  c.coHistSet('reset');
  same(c._coHist.pick, { kinds: {}, year: 'all', stat: 'all', sort: 'newest' });
});

test('★ 다른 회사를 열면 깔때기가 처음 상태로 돌아간다 — 걸어 둔 조건 때문에 「기록 없다」로 읽힌다', () => {
  const c = load();
  const data = { byBiz: { '3128149225': ALL, '2218802146': [REC.fund] } };
  paint(c, { bizno: '312-81-49225', name: '가나' }, data);
  c.coHistSet('kind', 'case');
  c.coHistSet('sort', 'fee');
  paint(c, { bizno: '221-88-02146', name: '다라' }, data);
  same(c._coHist.pick, { kinds: {}, year: 'all', stat: 'all', sort: 'newest' });
  assert.match(c._box.html, /복지기금 설립/,
    '★ 사건만 걸어 둔 채로 다른 회사를 열면 기금 한 건이 안 보여 「기록 없다」가 됩니다');
});

test('★ 해로 묶는 정렬이 아니면 줄 앞에 해가 붙는다 — 안 붙이면 몇 년 것인지 알 수 없다', () => {
  const c = load();
  const row = c.erpHistRow(REC.ilteo, TYPES);
  assert.match(c.erpHistRowHtml(row, false), /2025 · 04-01~11-28/, '★ 금액순으로 보면 해가 사라집니다');
  assert.ok(c.erpHistRowHtml(row, true).indexOf('2025 ·') < 0, '해 머리줄이 있는데 줄에도 또 붙습니다');
});

test('금액이 없는 건은 「—」로 둔다 — 0원이라고 하면 공짜로 한 것처럼 보인다', () => {
  const c = load();
  const h = c.erpHistRowHtml(c.erpHistRow({ _kind:'case', typeName:'상담', startDate:'2024-01-02' }, TYPES), true);
  assert.match(h, /class="fee">—</);
});

test('정렬 목록에 넷이 다 있다', () => {
  const c = load();
  same(c._C.SORTS.map(s => s[0]), ['newest', 'oldest', 'fee', 'kind']);
});

test('★ 이알피 원장에는 절대 쓰지 않는다 — 읽기만 한다', () => {
  const fn = cutFn(app, 'function loadErpCaseCons(');
  assert.match(fn, /\.once\('value'\)/, '읽는 자리가 없습니다');
  ['.set(', '.update(', '.remove(', '.transaction('].forEach(w => {
    assert.ok(fn.indexOf(w) < 0, '★ 이알피 원장에 쓰고 있습니다: ' + w);
  });
  /* ⚠ `.push(` 를 그냥 찾으면 배열에 담는 줄(byBiz[b].push)이 걸린다. 볼 것은
     «실시간DB 자리를 잡은 뒤 무엇을 하는가»다 — 모든 .ref( 뒤는 once 여야 한다. */
  const refs = fn.match(/\.ref\([^)]*\)\.\w+\(/g) || [];
  assert.ok(refs.length > 0, '실시간DB 를 읽는 줄을 찾지 못했습니다');
  refs.forEach(r => assert.match(r, /\.once\($/, '★ 읽기가 아닌 것이 있습니다: ' + r));
});

test('★ 자리를 손으로 늘어놓지 않는다 — 목록 하나만 고치면 읽는 곳이 따라온다', () => {
  const fn = cutFn(app, 'function loadErpCaseCons(');
  assert.match(fn, /ERP_HIST_KINDS\.map\(s=>'data\/'\+s\.store\+'\/v'\)/,
    '★ 손으로 늘어놓으면 사업을 하나 더할 때 한쪽만 늘어납니다');
  assert.match(fn, /ERP_HIST_KINDS\.filter\(s=>s\.types\)/);
});
