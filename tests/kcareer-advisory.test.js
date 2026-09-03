'use strict';
/* 자문·고문 실적 가져오기 — 실행: node --test tests/kcareer-advisory.test.js
   대표 지시 2026-09-03 「노무법인에서 수행한 사업도 경력관리에서 가지고 와야한다」.

   ⚠★ 출처는 `contracts`가 아니라 `companies`다.
     `contracts`는 「상담접수 → 계약협의 → 계약확정」 파이프라인이고, 계약이 확정되면
     업체관리(`companies`)로 이관된다. contracts를 가져오면 «아직 계약도 안 된»
     협의 중인 곳까지 자문 실적으로 센다. 이 착각을 검사로 막는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const S = require('../js/kcareer-pusync.js');
const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');

function funcSource(name) {
  const m = source.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 함수가 있어야 합니다');
  return m[0];
}

/* pu-erp 업체관리 한 줄 — 실제 칸 이름을 그대로 쓴다(pu-erp.html 80320줄 근처) */
function co(over) {
  return Object.assign({
    name: '(주)한빛', bizNo: '123-45-67890', typeCode: 'company-adv',
    bizType: '제조업', bizCategory: '자동차부품', companySize: '중기업',
    employmentInsuredCount: 148, managerMain: 'P-001',
    monthlyAdvisoryFee: 440000, vatType: 'unspecified',
    contractStartDate: '2019-04-01', contractEndDate: '',
    status: 'active', note: ''
  }, over || {});
}
const USERMAP = { 'P-001': '권형하', 'P-002': '박한별' };
const TYPEMAP = { company: [{ code: 'company-adv', short: '자문', name: '자문' },
                            { code: 'company-cons', short: '컨설', name: '컨설팅' }] };

/* ───────── 매핑 ───────── */

test('업체관리 한 줄이 자문 실적으로 옮겨진다', () => {
  const m = S.mapRecord('companies', 'co1', co(), USERMAP, TYPEMAP);
  assert.ok(m, 'companies를 알아봐야 합니다');
  assert.equal(m.store, 'advisory');
  assert.equal(m.rec.org, '(주)한빛');
  assert.equal(m.rec.type, '자문', '유형은 biz_company_types 코드표에서 온다');
  assert.equal(m.rec.year, '2019', '자문 시작일의 연도가 실적 연도다');
  assert.equal(m.rec.main, '권형하');
  assert.equal(m.rec.status, '진행');
  assert.equal(m.rec.puRef, 'companies/co1');
});

test('이름 없이 세기 위한 칸을 함께 담는다', () => {
  const r = S.mapRecord('companies', 'co1', co(), USERMAP, TYPEMAP).rec;
  assert.equal(r.bizType, '제조업');
  assert.equal(r.bizCategory, '자동차부품');
  assert.equal(r.size, '중기업');
  assert.equal(r.insured, 148, '고용보험 피보험자 수 = 근로자 규모');
});

test('★ 월 자문료는 가져오지 않는다', () => {
  // pu-erp 자신도 canSeeAmount() 로 가리는 값이다. 공모 지원에 쓸 일이 없고
  // 담으면 유출 위험만 늘어난다. 이 검사를 지우지 말 것.
  const r = S.mapRecord('companies', 'co1', co(), USERMAP, TYPEMAP).rec;
  const keys = Object.keys(r).join(' ');
  assert.ok(!/fee|amount|자문료|금액/i.test(keys), '금액 칸이 있으면 안 됩니다: ' + keys);
  Object.keys(r).forEach((k) => {
    assert.notEqual(r[k], 440000, k + ' 에 월 자문료가 새어 들었습니다');
  });
});

test('해지된 업체도 실적이다 — 종료로 담고 시작연도는 그대로 둔다', () => {
  const r = S.mapRecord('companies', 'co2',
    co({ status: 'closed', closedDate: '2023-06-30', closedReason: '계약만료',
         contractEndDate: '2023-06-30' }), USERMAP, TYPEMAP).rec;
  assert.equal(r.status, '종료');
  assert.equal(r.year, '2019', '해지돼도 자문을 시작한 해가 실적 연도다');
  assert.equal(r.closedReason, '계약만료');
  assert.equal(r.period, '2019-04-01 ~ 2023-06-30');
});

test('진행 중인 곳은 기간이 열려 있다', () => {
  const r = S.mapRecord('companies', 'co1', co(), USERMAP, TYPEMAP).rec;
  assert.equal(r.period, '2019-04-01 ~ 현재');
});

test('유형 코드표가 없으면 유형을 지어내지 않는다', () => {
  const r = S.mapRecord('companies', 'co1', co(), USERMAP, {}).rec;
  assert.equal(r.type, '', '모르면 비워 둔다 — 틀린 유형을 넣으면 안 된다');
});

test('담당 사번을 못 찾으면 사번을 그대로 보여 준다', () => {
  const r = S.mapRecord('companies', 'co1', co({ managerMain: 'P-099' }), USERMAP, TYPEMAP).rec;
  assert.equal(r.main, 'P-099');
});

/* ───────── ⚠ contracts 는 가져오지 않는다 ───────── */

test('★★ 계약 파이프라인(contracts)은 실적으로 가져오지 않는다', () => {
  // contracts 는 상담접수·계약협의·계약확정 단계다. 이것을 실적으로 세면
  // 아직 계약도 안 된 곳이 자문 실적이 된다. 되살리지 말 것.
  const m = S.mapRecord('contracts', 'ct1',
    { companyName: '(주)협의중', kinds: ['company'], status: 'review' }, USERMAP, TYPEMAP);
  assert.equal(m, null, 'contracts 는 알아보지 않아야 합니다');
  const plan = S.buildSyncPlan({ contracts: { ct1: { companyName: '(주)협의중', kinds: ['company'] } } },
    [], USERMAP, TYPEMAP, []);
  assert.equal(plan.adds.length, 0, 'contracts 는 한 건도 들어오면 안 됩니다');
});

/* ───────── 계획 세우기 ───────── */

test('동기화 계획이 자문을 따로 센다', () => {
  const plan = S.buildSyncPlan(
    { companies: { co1: co(), co2: co({ name: '(주)두빛', contractStartDate: '2021-01-04' }) } },
    [], USERMAP, TYPEMAP, []);
  assert.equal(plan.counts.advisory, 2);
  assert.equal(plan.adds.length, 2);
});

test('이미 가져온 업체는 건너뛴다', () => {
  const plan = S.buildSyncPlan({ companies: { co1: co() } },
    ['companies/co1'], USERMAP, TYPEMAP, []);
  assert.equal(plan.adds.length, 0);
  assert.equal(plan.skippedKnown, 1);
});

test('푸른이알피 봉투를 벗겨야 업체가 보인다', () => {
  // pu-erp 는 data/{키} = {v:값, u:시각} 으로 담는다
  const plan = S.buildSyncPlan({ companies: { v: { co1: co() }, u: 1700000000000 } },
    [], USERMAP, TYPEMAP, []);
  assert.equal(plan.counts.advisory, 1, '봉투를 벗기지 않으면 v·u 를 업체로 셉니다');
});

test('그동안 해지된 업체는 상태만 맞춘다', () => {
  const ups = S.buildStatusUpdates(
    { companies: { co1: co({ status: 'closed', closedDate: '2026-08-31' }) } },
    [{ puRef: 'companies/co1', status: '진행', year: '2019' }]);
  assert.equal(ups.length, 1);
  assert.equal(ups[0].status, '종료');
  assert.equal(ups[0].year, '2019', '⚠ 자문은 시작연도가 실적 연도다 — 해지연도로 덮지 않는다');
});

test('아직 진행 중이면 상태를 건드리지 않는다', () => {
  const ups = S.buildStatusUpdates({ companies: { co1: co() } },
    [{ puRef: 'companies/co1', status: '진행', year: '2019' }]);
  assert.equal(ups.length, 0);
});

/* ───────── kcareer.html 쪽 배선 ───────── */

test('자문·고문 화면과 메뉴가 있다', () => {
  assert.match(source, /<section class="page-view" id="page-advisory"/);
  assert.match(source, /\['page-advisory','자문·고문'\]/);
});

test('CAREER_CFG 에 advisory 가 등록돼 목록 공통 3종을 받는다', () => {
  assert.match(source, /advisory:\{store:'advisory'/);
});

test('★ 유실 감지가 자문 실적을 센다', () => {
  // FB_COUNT_KEYS 에 없으면 백업 재촉·유실 감지가 이 자료를 세지 않는다
  // (위촉장 197→79 사고가 여기서 되풀이된다)
  const m = source.match(/var FB_COUNT_KEYS=\[[^\]]*\]/);
  assert.ok(m, 'FB_COUNT_KEYS 가 있어야 합니다');
  assert.match(m[0], /'advisory'/);
});

test('동기화 스토어 목록에 advisory 가 있다', () => {
  const m = source.match(/var PU_SYNC_STORES = \[[^\]]*\]/);
  assert.ok(m);
  assert.match(m[0], /'advisory'/);
});

test('_puFetchPlan 이 업체관리와 업체 유형 코드표를 읽는다', () => {
  const src = funcSource('_puFetchPlan');
  assert.match(src, /'companies'/, '업체관리를 읽어야 합니다');
  assert.match(src, /biz_company_types/, '업체 유형 코드표를 읽어야 합니다');
  assert.match(src, /_puUnwrap\(/);
});

test('puSyncCommit 이 advisory 를 저장한다', () => {
  const src = funcSource('puSyncCommit');
  assert.match(src, /advisory:\s*get\('advisory'\)/, 'buf 에 advisory 가 있어야 합니다');
  assert.match(src, /advisory:'AD'/, 'ID 접두사가 있어야 합니다');
});

test('동기화 미리보기가 자문 칸을 이름으로 보여 준다', () => {
  const src = funcSource('renderPuSyncPreview');
  assert.match(src, /advisory:'자문·고문'/, '이름표가 없으면 칸이 undefined 로 나옵니다');
});

/* ───────── 되돌리기 ───────── */

test('puUndoSync 가 자문 실적도 되돌린다', () => {
  const store = { case: [], consult: [], fund: [], etc: [], advisory: [] };
  const ctx = {
    get: (k) => store[k].slice(), set: (k, v) => { store[k] = v; },
    toast: () => {}, renderCareer: () => {}, CAREER_CFG: {},
    PU_SYNC_STORES: ['case', 'consult', 'fund', 'etc', 'advisory']
  };
  store.advisory = [
    { id: 'AD0100', syncId: 'PS1' },                                   // 이번에 새로 만든 것 → 삭제
    { id: 'AD0001', puRef: 'companies/co9', linkedSyncId: 'PS1' },      // 붙인 것 → puRef만 해제
    { id: 'AD0002' }                                                    // 손 안 댐
  ];
  vm.runInNewContext(funcSource('puUndoSync') + '\npuUndoSync("PS1");', ctx);
  assert.deepEqual(store.advisory.map((r) => r.id), ['AD0001', 'AD0002']);
  assert.equal(store.advisory.find((r) => r.id === 'AD0001').puRef, undefined);
});
