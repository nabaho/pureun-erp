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
    _erpConsTypes: null
  };
  const code = source.slice(digitsAt, digitsEnd) + '\n' + source.slice(declEnd, end) + '\n' + source.slice(nameAt, nameEnd);
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx._calls = calls;
  return ctx;
}

test('loadErpCaseCons 는 data/cases/v, data/consultings/v 두 자리만 읽는다', async () => {
  const c = loadErpCaseConsBlock();
  c._fixtures = { 'data/cases/v': { c1:{ id:'c1', bizNo:'312-81-49225', typeName:'부당해고' } },
                  'data/consultings/v': { k1:{ id:'k1', bizNo:'312-81-49225', typeCode:'cons-ilteo' } } };
  let got = null;
  await new Promise(res => c.loadErpCaseCons(data => { got = data; res(); }));
  assert.deepEqual(c._calls.onceCalls.sort(), ['data/biz_cons_types','data/cases/v','data/consultings/v']);
  assert.equal(got.byBiz['3128149225'].length, 2);
});

test('사업자번호 10자리 미만인 기록은 색인에서 뺀다', async () => {
  const c = loadErpCaseConsBlock();
  c._fixtures = { 'data/cases/v': { c1:{ id:'c1', bizNo:'123' } }, 'data/consultings/v': {} };
  let got = null;
  await new Promise(res => c.loadErpCaseCons(data => { got = data; res(); }));
  assert.deepEqual(Object.keys(got.byBiz), []);
});

test('한 번 불러온 뒤로는 다시 안 읽고 캐시를 쓴다', async () => {
  const c = loadErpCaseConsBlock();
  c._fixtures = { 'data/cases/v': {}, 'data/consultings/v': {} };
  await new Promise(res => c.loadErpCaseCons(() => res()));
  await new Promise(res => c.loadErpCaseCons(() => res()));
  assert.equal(c._calls.onceCalls.length, 3, '두 번째 부를 때는 실제로 안 읽어야 한다');
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

test('erpConsTypeName 은 등록 안 된 코드면 코드를 그대로 돌려준다', () => {
  const c = loadErpCaseConsBlock();
  c._erpConsTypes = [];
  assert.equal(c.erpConsTypeName('cons-알수없음'), 'cons-알수없음');
});
