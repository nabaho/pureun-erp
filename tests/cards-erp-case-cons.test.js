/* 이알피(pu-erp.html)의 사건관리·컨설팅관리 기록을 읽기 전용으로 불러온다.
   ⚠ data/cases/v/{id}, data/consultings/v/{id} 에 있다 — 기업정보가 이미 쓰는
     data/companies(ErpMatch, 업체관리)와는 다른 자리다. 절대 여기에 쓰지 않는다.
   ⚠ data/biz_cons_types 는 레코드별 자리(.../v/{id})가 아니라 통째 배열 자리다 —
     컨설팅 기록엔 typeName 이 없고 typeCode 만 있어서, 사람이 읽는 이름은
     이 사전을 따로 찾아봐야 한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function loadErpCaseConsBlock(){
  const digitsAt = source.indexOf('const digits = s =>');
  const digitsEnd = source.indexOf('\n', digitsAt);
  const at = source.indexOf('let _erpCaseCons');
  assert.ok(at > 0, '_erpCaseCons 캐시를 찾지 못했습니다');
  const end = source.indexOf('\nfunction erpConsTypeName', at);
  assert.ok(end > at, 'erpConsTypeName 앞까지 자르지 못했습니다');
  const nameAt = source.indexOf('function erpConsTypeName');
  const nameEnd = source.indexOf('\n}', nameAt) + 2;
  /* "let _erpCaseCons/_erpCaseConsLoading/_erpConsTypes" 세 줄은 일부러 안 담는다 —
     vm 에서 top-level let 은 컨텍스트 객체의 프로퍼티가 아니라 별도 렉시컬 환경에
     들어가서, 밖에서 ctx._erpConsTypes 로 손을 못 댄다(cards-co-tag-hide.test.js 의
     loadTagHideBlock 과 같은 방식). 선언을 빼고 ctx 프로퍼티로 미리 쥐여준다. */
  const declEnd = source.indexOf('function loadErpCaseCons', at);
  assert.ok(declEnd > at, 'loadErpCaseCons 정의를 찾지 못했습니다');
  /* ⚠ 2026-08-24: 읽는 자리를 목록(ERP_HIST_KINDS)에서 만들고, 사업자번호가 없는
     기록은 이름(_norm)으로 색인한다 — 둘을 함께 떠야 한다. 손으로 베끼면 진짜와 어긋난다. */
  const kindsDecl = source.match(/^const ERP_HIST_KINDS = \[[\s\S]*?\n\];$/m);
  assert.ok(kindsDecl, 'ERP_HIST_KINDS 를 찾지 못했습니다');
  const normDecl = source.match(/^const _norm = s => [^\n]*;$/m);
  assert.ok(normDecl, '_norm 을 찾지 못했습니다');

  const calls = { onceCalls: [] };
  const ctx = {
    Store: { mode:'firebase' },
    firebase: { database: () => ({ ref: p => ({ once: evt => {
      calls.onceCalls.push(p);
      const val = ctx._fixtures[p];
      return Promise.resolve({ val: () => val });
    } }) }) },
    _fixtures: {},
    _erpCaseCons: null,
    _erpCaseConsLoading: false,
    _erpConsTypes: null,
    _erpHistTypes: {},
    _erpCaseConsWaiters: []
  };
  const code = kindsDecl[0] + '\n' + normDecl[0] + '\n'
    + source.slice(digitsAt, digitsEnd) + '\n' + source.slice(declEnd, end) + '\n'
    + source.slice(nameAt, nameEnd);
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx._calls = calls;
  return ctx;
}

/* ⚠ 2026-08-24: 대표 지시로 기금·기타사업까지 넷을 읽는다(넷 + 유형 사전 셋 = 일곱).
   지킬 것은 「정해진 자리만 읽고, 그 밖은 안 건드린다」이지 「두 자리」라는 숫자가 아니다. */
/* ⚠ 2026-08-31: 계약(data/contracts/v)을 더했다 — 이 앱의 이름표가 「사업자·명함·계약서」인데
     정작 계약을 한 번도 안 읽고 있었다(점검 C1).
   ⚠ 이 목록은 «손으로» 적는다. ERP_HIST_KINDS 에서 뽑아 만들면 무엇을 더해도 저절로
     맞아떨어져 검사가 아무것도 안 지키게 된다 — 자리가 느는 것은 요금이 느는 일이라
     사람이 한 번 더 보고 적어야 한다. */
const ERP_READ_PATHS = ['data/biz_cons_types','data/biz_fund_types','data/biz_other_types',
                        'data/cases/v','data/consultings/v','data/contracts/v',
                        'data/funds/v','data/other_projects/v'];

test('loadErpCaseCons 는 이알피의 정해진 자리만 읽는다', async () => {
  const c = loadErpCaseConsBlock();
  c._fixtures = { 'data/cases/v': { c1:{ id:'c1', bizNo:'312-81-49225', typeName:'부당해고' } },
                  'data/consultings/v': { k1:{ id:'k1', bizNo:'312-81-49225', typeCode:'cons-ilteo' } } };
  let got = null;
  await new Promise(res => c.loadErpCaseCons(data => { got = data; res(); }));
  assert.deepEqual(c._calls.onceCalls.sort(), ERP_READ_PATHS);
  assert.equal(got.byBiz['3128149225'].length, 2);
});

test('사업자번호 10자리 미만인 기록은 «번호» 색인에서 뺀다 — 이름 색인으로 간다', async () => {
  /* ⚠ 예전에는 통째로 버렸다. 그래서 사업자번호를 안 적은 컨설팅 건은 이력이 하나도
     안 붙었다(대표 화면 2026-08-24). 이제 이름으로 담는다 — 다만 아무 열 자리를
     번호로 우기지는 않는다. */
  const c = loadErpCaseConsBlock();
  c._fixtures = { 'data/cases/v': { c1:{ id:'c1', bizNo:'123', companyName:'가나기업' } },
                  'data/consultings/v': {} };
  let got = null;
  await new Promise(res => c.loadErpCaseCons(data => { got = data; res(); }));
  assert.deepEqual(Object.keys(got.byBiz), [], '10자리가 아닌 것을 번호 색인에 넣으면 안 된다');
  assert.equal((got.byName['가나기업']||[]).length, 1, '이름으로는 담아야 한다');
});

test('한 번 불러온 뒤로는 다시 안 읽고 캐시를 쓴다', async () => {
  const c = loadErpCaseConsBlock();
  c._fixtures = { 'data/cases/v': {}, 'data/consultings/v': {} };
  await new Promise(res => c.loadErpCaseCons(() => res()));
  await new Promise(res => c.loadErpCaseCons(() => res()));
  assert.equal(c._calls.onceCalls.length, ERP_READ_PATHS.length,
    '두 번째 부를 때는 실제로 안 읽어야 한다');
});

test('클라우드 모드가 아니면 콜백에 null 을 준다', async () => {
  const c = loadErpCaseConsBlock();
  c.Store.mode = 'demo';
  let got = 'unset';
  await new Promise(res => c.loadErpCaseCons(data => { got = data; res(); }));
  assert.equal(got, null);
  assert.equal(c._calls.onceCalls.length, 0);
});

test('erpConsTypeName 은 등록된 코드를 사람이 읽는 이름으로 바꾼다', () => {
  const c = loadErpCaseConsBlock();
  c._erpConsTypes = [{ code:'cons-ilteo', short:'일혁', name:'일터상생혁신', agency:'노사발전재단', sortOrder:10 }];
  assert.equal(c.erpConsTypeName('cons-ilteo'), '일터상생혁신');
});

/* 최종 전체 리뷰 2026-08-14: 조회가 도는 중에 또 부르면 예전엔 cb(null) 로 바로
   답했다 — 가회사 패널을 연 직후(첫 조회 시작) 나회사 패널로 바꾸면, 나회사는
   틀린 답(null)을 먼저 받고, 나중에 가회사의 응답이 늦게 도착해 그 콜백이 지금
   화면(나회사)의 이력 칸에 가회사 기록을 써 버리는 사고로 이어졌다. 이제는 도는
   중이면 콜백을 큐에 담아 뒀다가, 실제 결과가 오면 그때 큐에 담긴 모두를 부른다 —
   아무도 틀린 답을 먼저 받지 않는다. */
test('조회가 도는 중에 또 부르면 기다렸다가 실제 결과를 받는다 — 미리 null 을 안 준다', async () => {
  const c = loadErpCaseConsBlock();
  c._fixtures = { 'data/cases/v': { c1:{ id:'c1', bizNo:'312-81-49225', typeName:'부당해고' } }, 'data/consultings/v': {} };
  const firstGot = []; const secondGot = [];
  const p1 = new Promise(res => c.loadErpCaseCons(data => { firstGot.push(data); res(); }));
  const p2 = new Promise(res => c.loadErpCaseCons(data => { secondGot.push(data); res(); }));
  await Promise.all([p1, p2]);
  assert.equal(c._calls.onceCalls.length, ERP_READ_PATHS.length,
    '두 번째 요청도 실제로는 한 번만 읽어야 한다');
  assert.equal(firstGot.length, 1);
  assert.notEqual(firstGot[0], null, '먼저 부른 쪽이 실제 결과를 받아야 한다');
  assert.equal(secondGot.length, 1);
  assert.notEqual(secondGot[0], null, '도는 중에 또 불렀다고 null 을 먼저 주면 안 된다 — 실제 결과를 기다려야 한다');
  assert.deepEqual(Object.keys(firstGot[0].byBiz), Object.keys(secondGot[0].byBiz), '둘 다 같은 실제 결과를 받아야 한다');
});

test('erpConsTypeName 은 등록 안 된 코드면 코드를 그대로 돌려준다', () => {
  const c = loadErpCaseConsBlock();
  c._erpConsTypes = [];
  assert.equal(c.erpConsTypeName('cons-알수없음'), 'cons-알수없음');
});
