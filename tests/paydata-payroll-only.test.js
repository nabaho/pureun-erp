'use strict';
/* 급여데이터함은 「급여」 업체만 다룬다 — 실행: node --test tests/*.test.js
   2026-08-17 대표: "급여데이터함은 푸른이알피 업체관리에서 사업장을 연결해서
   관리하려는 것이다. 왜 모든 사업장 다 가져왔나?" 업체관리 371곳이 통째로
   나오는 바람에 급여 112곳을 찾을 수 없었다. 유형 「급여」·계약중단 제외로 좁힌다.
   ⚠ 감추는 것일 뿐 자료는 그대로다 — 그것까지 여기서 검사한다(offType). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
const STORE_SRC = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');

function loadStore() {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(STORE_SRC, { filename: 'store.js' }).runInContext(sandbox);
  const S = sandbox.window.PuPaydataStore;
  S.init({ uid: 'U1' });
  return S;
}

function loadSitesModel() {
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(STORE_SRC, { filename: 'store.js' }).runInContext(sandbox);
  function cut(name) {
    const m = HTML.match(new RegExp('function ' + name + '[\\s\\S]*?\\n\\}'));
    assert.ok(m, name + ' 함수를 찾을 수 없습니다');
    return m[0];
  }
  new vm.Script('const S = window.PuPaydataStore; S.init({uid:"U1"});\n'
    + cut('companyDocCount') + '\n' + cut('sitesModel')
    + '\nwindow.sitesModel = sitesModel;', { filename: 'model.js' }).runInContext(sandbox);
  return sandbox.window.sitesModel;
}

/* 업체관리(푸른이알피)가 실제로 쓰는 칸 이름 그대로다 —
   typeCode: 자문/급여/노조/기금/사무대행, status: active/closed/suboffice,
   suspended: status 와 따로 켜지는 계약중단 체크 */
const RAW = {
  c1: { name: '화담원', typeCode: '급여', status: 'active', managerMain: 'p-001' },
  c2: { name: '이비', typeCode: '자문', status: 'active', managerMain: 'p-001' },
  c3: { name: '노조업체', typeCode: '노조', status: 'active' },
  c4: { name: '기금업체', typeCode: '기금', status: 'active' },
  c5: { name: '중단업체', typeCode: '급여', status: 'active', suspended: true },
  c6: { name: '종료업체', typeCode: '급여', status: 'closed' },
  c7: { name: '두번째급여', typeCode: '급여', status: 'active', managerMain: 'p-002' }
};

test('★ 유형·상태·계약중단을 업체관리에서 그대로 들고 온다', () => {
  const S = loadStore();
  const list = S.normalizeCompanies(RAW);
  const byId = {}; list.forEach(c => { byId[c.id] = c; });
  assert.equal(byId.c1.typeCode, '급여');
  assert.equal(byId.c1.status, 'active');
  assert.equal(byId.c5.suspended, true);
  assert.equal(byId.c6.status, 'closed');
});

test('★ 유형이 「급여」인 곳만 남긴다 — 자문·노조·기금은 뺀다', () => {
  const S = loadStore();
  const only = S.payrollCompanies(S.normalizeCompanies(RAW));
  assert.equal(only.map(c => c.name).sort().join(','), '두번째급여,화담원');
});

test('★ 계약중단·종료한 업체는 목록에서 뺀다 (대표 결정 2026-08-17)', () => {
  const S = loadStore();
  assert.equal(S.isPayrollCompany({ typeCode: '급여', status: 'active', suspended: true }), false);
  assert.equal(S.isPayrollCompany({ typeCode: '급여', status: 'closed' }), false);
  assert.equal(S.isPayrollCompany({ typeCode: '급여', status: 'active' }), true);
});

test('유형이 비어 있으면 급여 업체로 치지 않는다', () => {
  const S = loadStore();
  // 유형을 안 고른 줄까지 끌어오면 371곳으로 되돌아간다
  assert.equal(S.isPayrollCompany({ name: '유형없음', status: 'active' }), false);
  assert.equal(S.isPayrollCompany(null), false);
});

test('★ 첫 화면이 급여 업체만 그린다', () => {
  const S = loadStore();
  const sitesModel = loadSitesModel();
  const all = S.normalizeCompanies(RAW);
  const out = sitesModel(S.payrollCompanies(all), {}, {}, '2026-08', 0, '', all);
  assert.equal(out.rows.length, 2);
});

test('★ 급여 업체가 아닌 곳에 담긴 자료는 이름과 함께 남는다 — 감출 뿐 없애지 않는다', () => {
  const S = loadStore();
  const sitesModel = loadSitesModel();
  const all = S.normalizeCompanies(RAW);
  // c2(자문)에 두 장이 이미 담겨 있다
  const arrivals = { c2: { 202608: { attend: { a: 1, b: 1 }, last: 1 } } };
  const out = sitesModel(S.payrollCompanies(all), {}, arrivals, '2026-08', 0, '', all);
  assert.equal(out.offType.length, 1);
  assert.equal(out.offType[0].name, '이비');   // 번호가 아니라 이름이어야 찾아간다
  assert.equal(out.offType[0].count, 2);
  assert.equal(out.unlisted.length, 0);        // 「지워진 업체」로 섞이면 안 된다
});

test('업체관리에서 아예 못 찾은 번호는 그대로 unlisted 다', () => {
  const S = loadStore();
  const sitesModel = loadSitesModel();
  const all = S.normalizeCompanies(RAW);
  const arrivals = { co_없음: { 202608: { attend: { a: 1 }, last: 1 } } };
  const out = sitesModel(S.payrollCompanies(all), {}, arrivals, '2026-08', 0, '', all);
  assert.equal(out.unlisted.length, 1);
  assert.equal(out.offType.length, 0);
});

/* ══════ 배선 — 계산이 맞아도 화면이 안 부르면 371곳으로 되돌아간다 ══════ */

test('★ 화면이 업체 명단을 급여만으로 걸러 담는다', () => {
  assert.match(HTML, /App\.companies\s*=\s*S\.payrollCompanies\(/,
    'loadSites 가 S.payrollCompanies 로 거르지 않으면 371곳이 다시 다 나온다');
  assert.match(HTML, /App\.allCompanies\s*=\s*companies/,
    '전체 명단을 안 남기면 급여 아닌 곳에 담긴 자료가 번호로만 보인다');
});

test('★ 사업장 전체 설명에 「급여」 기준임을 적는다', () => {
  // 걸러 놓고 말을 안 하면 이번에는 "내 업체가 왜 없나"가 된다
  assert.match(HTML, /업체관리에서 유형이 「급여」인 곳/);
});
