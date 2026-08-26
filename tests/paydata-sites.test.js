'use strict';
// 업체관리 명단 읽기 — 실행: node --test tests/*.test.js
//   사업장 서랍의 기준은 푸른이알피 업체관리다(대표 결정 2026-08-13).
//   데이터함이 제 명단을 만들면 이름 글자 맞추기 어긋남이 늘어난다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadStore() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-paydata-store.js'), 'utf8');
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'pu-paydata-store.js' }).runInContext(sandbox);
  const S = sandbox.window.PuPaydataStore;
  S.init({ uid: 'U1' });
  return S;
}

test('★ 업체관리 자리를 본다 — 최상위 companies 가 아니다', () => {
  const S = loadStore();
  // 콘솔 규칙에 최상위 companies 열쇠도 있지만 어느 파일도 그 자리를 쓰지 않는다.
  // 실데이터는 data/companies 에 있다(기업정보함이 그 자리를 읽는다).
  assert.equal(S.ERP_COMPANIES, 'data/companies');
});

test('배열형 명단을 읽는다', () => {
  const S = loadStore();
  const out = S.normalizeCompanies([{ id: 'co_1', 업체명: '화담원' }, { id: 'co_2', 업체명: '(주)이비' }]);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, 'co_1');
  assert.equal(out[0].name, '화담원');
});

test('★ 객체형 명단도 읽는다', () => {
  const S = loadStore();
  // 푸른이알피는 배열형과 객체형(id 맵)을 둘 다 쓴다. 한쪽만 읽으면 명단이 통째로 빈다.
  const out = S.normalizeCompanies({ co_1: { id: 'co_1', 업체명: '화담원' }, co_2: { 업체명: '이비' } });
  assert.equal(out.length, 2);
  const ids = out.map(o => o.id).join(',');
  assert.ok(ids.indexOf('co_1') >= 0);
  assert.ok(ids.indexOf('co_2') >= 0, '열쇠를 번호로 못 쓰면 그 업체가 사라집니다');
});

test('★ 감싸기를 벗긴다', () => {
  const S = loadStore();
  // data/companies = {v: 목록, u: 갱신시각}
  const out = S.normalizeCompanies({ v: [{ id: 'co_1', 업체명: '화담원' }], u: 123 });
  assert.equal(out.length, 1);
  assert.equal(out[0].name, '화담원');
});

test('감싸기 안이 객체형이어도 읽는다', () => {
  const S = loadStore();
  const out = S.normalizeCompanies({ v: { co_1: { 업체명: '화담원' } }, u: 123 });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'co_1');
});

test('이름이 없는 줄은 버리고 번호가 없는 줄은 살린다', () => {
  const S = loadStore();
  const out = S.normalizeCompanies([{ id: 'co_1' }, { 업체명: '이름만' }, { id: 'co_3', 업체명: '둘 다' }]);
  const names = out.map(o => o.name).join(',');
  // 이름 없는 줄은 화면에 그릴 수 없다. 번호 없는 줄은 이름으로라도 쓴다.
  assert.ok(names.indexOf('이름만') >= 0);
  assert.equal(out.length, 2);
});

test('빈 자료·못 읽은 자료에도 빈 목록을 준다 — 터지지 않는다', () => {
  const S = loadStore();
  assert.equal(S.normalizeCompanies(null).length, 0);
  assert.equal(S.normalizeCompanies('').length, 0);
  assert.equal(S.normalizeCompanies(123).length, 0);
  assert.equal(S.normalizeCompanies({ v: null }).length, 0);
});

test('★ 이름으로 업체를 맞출 때 앞가지·괄호를 무시한다', () => {
  const S = loadStore();
  const list = S.normalizeCompanies([{ id: 'co_1', 업체명: '(주)화담원' }]);
  // 급여관리 설정카드는 「화담원 아산점」처럼 적혀 있다. 글자가 똑같지 않다.
  assert.equal(S.matchCompanyName('화담원', list).id, 'co_1');
  assert.equal(S.matchCompanyName('주식회사 화담원', list).id, 'co_1');
  assert.equal(S.matchCompanyName('화담원 아산점_25년 07월_급여대장.xlsx', list).id, 'co_1');
  assert.equal(S.matchCompanyName('없는곳', list), null);
  assert.equal(S.matchCompanyName('', list), null);
});

/* ══════ 담당자별 대시보드 — 업체는 푸른이알피에서 당겨온다 (대표 지시 2026-08-13) ══════ */

test('★ 업체관리의 담당자(managerMain·managerSubs)를 그대로 가져온다', () => {
  const S = loadStore();
  const out = S.normalizeCompanies([{ id: 'co_1', 업체명: '화담원', managerMain: 'p-001', managerSubs: ['p-002'] }]);
  assert.equal(out[0].managerMain, 'p-001');
  assert.equal(out[0].managerSubs.join(','), 'p-002');
});

test('담당자가 없는 업체도 빈 값으로 정상 처리된다', () => {
  // vm 안에서 만든 배열은 Array 프로토타입이 달라 deepStrictEqual 이 실패한다 — 길이로 견준다.
  const S = loadStore();
  const out = S.normalizeCompanies([{ id: 'co_1', 업체명: '화담원' }]);
  assert.equal(out[0].managerMain, '');
  assert.equal(out[0].managerSubs.length, 0);
});

test('★ 주담당이면 내 업체다', () => {
  const S = loadStore();
  const co = { managerMain: 'p-001', managerSubs: [] };
  assert.equal(S.isMyCompany(co, 'p001@pureun.kr'), true);
});

test('★ 부담당이어도 내 업체다', () => {
  const S = loadStore();
  const co = { managerMain: 'p-002', managerSubs: ['p-001', 'p-003'] };
  assert.equal(S.isMyCompany(co, 'p001@pureun.kr'), true);
});

test('담당이 아니면 내 업체가 아니다', () => {
  const S = loadStore();
  const co = { managerMain: 'p-002', managerSubs: ['p-003'] };
  assert.equal(S.isMyCompany(co, 'p001@pureun.kr'), false);
});

test('이메일 대소문자를 가리지 않는다', () => {
  const S = loadStore();
  const co = { managerMain: 'p-001', managerSubs: [] };
  assert.equal(S.isMyCompany(co, 'P001@PUREUN.KR'), true);
});

test('업체나 이메일이 없으면 조용히 false — 터지지 않는다', () => {
  const S = loadStore();
  assert.equal(S.isMyCompany(null, 'p001@pureun.kr'), false);
  assert.equal(S.isMyCompany({ managerMain: 'p-001' }, ''), false);
});

test('★ 짧은 이름이 긴 이름을 가로채지 않는다', () => {
  const S = loadStore();
  const list = S.normalizeCompanies([
    { id: 'co_1', 업체명: '화담원' },
    { id: 'co_2', 업체명: '화담원산업' }
  ]);
  // 긴 이름부터 봐야 「화담원산업 근태」가 화담원으로 잡히지 않는다.
  assert.equal(S.matchCompanyName('화담원산업 근태.jpg', list).id, 'co_2');
});
