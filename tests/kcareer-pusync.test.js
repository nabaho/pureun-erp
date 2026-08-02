'use strict';
// pu-erp 실적 동기화 순수 모듈 단위테스트 — 실행: node --test tests/kcareer-pusync.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const PS = require('../js/kcareer-pusync.js');

test('isClosed: closedDate 또는 종료 status만 종료다', () => {
  assert.equal(PS.isClosed({ closedDate: '2026-03-01' }), true);
  assert.equal(PS.isClosed({ status: 'closed' }), true);
  assert.equal(PS.isClosed({ status: 'done' }), true);
  assert.equal(PS.isClosed({ status: '완료' }), true);
  assert.equal(PS.isClosed({ status: '종료' }), true);
  assert.equal(PS.isClosed({ status: 'CLOSED' }), true);          // 대소문자 무시
});

test('isClosed: endDate만 있으면 미종료다 — 예정일일 수 있다', () => {
  assert.equal(PS.isClosed({ endDate: '2026-12-31' }), false);
  assert.equal(PS.isClosed({ status: 'active' }), false);
  assert.equal(PS.isClosed({ status: 'progress' }), false);
  assert.equal(PS.isClosed({ status: 'open', endDate: '2026-01-01' }), false);
  assert.equal(PS.isClosed({}), false);
  assert.equal(PS.isClosed(null), false);
});

const UMAP = { '2001': '권형하', '2003': '박한별' };

test('mapRecord: cases → case 스토어', () => {
  const r = PS.mapRecord('cases', '-Nx1', {
    caseType: '부당해고', companyName: '대운토건', title: '부당해고 구제신청',
    closedDate: '2026-03-15', managerMain: '2001'
  }, UMAP);
  assert.equal(r.store, 'case');
  assert.deepEqual(r.rec, {
    type: '부당해고', org: '대운토건', project: '부당해고 구제신청',
    year: '2026', main: '권형하', status: '완료', puRef: 'cases/-Nx1'
  });
});

test('mapRecord: consultings → consult, funds → fund, other_projects → etc', () => {
  const c = PS.mapRecord('consultings', '-Nc1', {
    consultingType: '일터혁신', companyName: '삼원폴리텍', programName: '임금체계 재설계',
    closedDate: '2025-11-30', workers: [{ sid: '2003', isPrimary: true }]
  }, UMAP);
  assert.equal(c.store, 'consult');
  assert.equal(c.rec.type, '일터혁신');
  assert.equal(c.rec.main, '박한별');            // workers의 isPrimary에서
  assert.equal(c.rec.puRef, 'consultings/-Nc1');

  const f = PS.mapRecord('funds', '-Nf1', {
    fundType: '사내근로복지기금', companyName: '다움', title: '설립 컨설팅',
    status: 'done', endDate: '2026-01-10', managerMain: '2001'
  }, UMAP);
  assert.equal(f.store, 'fund');
  assert.equal(f.rec.year, '2026');              // closedDate 없으면 endDate에서

  const e = PS.mapRecord('other_projects', '-No1', {
    programName: '재기컨설팅', companyName: '중진공', status: '완료', managerMain: '9999'
  }, UMAP);
  assert.equal(e.store, 'etc');
  assert.equal(e.rec.main, '9999');              // 변환표에 없으면 sid 그대로
  assert.equal(e.rec.year, '');                  // 날짜가 아예 없으면 빈 값
});

test('mapRecord: caseType이 비면 사건번호에서 유형·연도를 뽑는다', () => {
  // pu-erp 사건은 caseType이 비어 있고 진행중이라 종료일도 없다.
  // 그런데 사건번호에 둘 다 들어 있다 — 부해등-2026-003 → 유형 부해등, 연도 2026 (실사용)
  const r = PS.mapRecord('cases', 'k1', {
    companyName: '충남사회서비스원', caseNo: '부해등-2026-003', managerMain: '2001'
  }, UMAP);
  assert.equal(r.rec.type, '부해등');
  assert.equal(r.rec.year, '2026');
  assert.equal(r.rec.project, '부해등-2026-003');
  assert.equal(r.rec.main, '권형하');

  // 쉼표가 든 유형도 그대로 — 성,직괴-2026-001
  const r2 = PS.mapRecord('cases', 'k2', { companyName: '롯데리아', caseNo: '성,직괴-2026-001' }, UMAP);
  assert.equal(r2.rec.type, '성,직괴');
  assert.equal(r2.rec.year, '2026');

  // caseType이 있으면 그것을 우선한다
  const r3 = PS.mapRecord('cases', 'k3', { caseType: '부당해고', caseNo: '부해등-2026-004' }, UMAP);
  assert.equal(r3.rec.type, '부당해고');

  // 종료일이 있으면 연도는 종료일에서 (사건번호보다 우선)
  const r4 = PS.mapRecord('cases', 'k4', { caseNo: '임금체불-2025-001', closedDate: '2026-03-15' }, UMAP);
  assert.equal(r4.rec.year, '2026');

  // 사건번호 형식이 아니면 유형은 비운다
  const r5 = PS.mapRecord('cases', 'k5', { companyName: 'A사', title: '윤성진아버지 유족사건' }, UMAP);
  assert.equal(r5.rec.type, '');
  assert.equal(r5.rec.project, '윤성진아버지 유족사건');
});

test('mapRecord: 모르는 컬렉션은 null', () => {
  assert.equal(PS.mapRecord('unknown', 'k', {}, {}), null);
});

test('mapRecord: 상태를 pu-erp 실제 상태로 옮긴다 — 진행중도 가져온다', () => {
  // 사건 13건 중 11건이 진행중이었다(실사용). 종료만 받으면 실적이 영원히 안 들어온다.
  const open = PS.mapRecord('cases', 'k9', {
    caseType: '임금체불', companyName: '오철진', title: '임금체불사건', managerMain: '2001'
  }, UMAP);
  assert.equal(open.rec.status, '진행');
  const closed = PS.mapRecord('cases', 'k8', {
    caseType: '산재', companyName: 'B사', title: 't', status: 'closed', managerMain: '2001'
  }, UMAP);
  assert.equal(closed.rec.status, '완료');
});

test('buildSyncPlan: 진행중도 담되 종료 건수를 따로 센다', () => {
  const collData = {
    cases: { v: {
      k1: { caseType: '산재', companyName: 'A사', title: 't1', status: 'closed', managerMain: '2001' },
      k2: { caseType: '임금체불', companyName: 'B사', title: 't2', managerMain: '2001' }   // 진행중
    }, u: 1 },
    consultings: null, funds: null, other_projects: null
  };
  const plan = PS.buildSyncPlan(collData, new Set(), UMAP);
  assert.equal(plan.adds.length, 2, '진행중도 들어와야 합니다');
  assert.equal(plan.closedCount, 1, '종료 건수를 따로 세어 미리보기에 보여준다');
  assert.equal(plan.openCount, 1);
  assert.equal(plan.skippedOpen, 0, '진행중을 제외하지 않는다');
});

test('buildStatusUpdates: 진행 → 완료로 바뀐 것만 상태를 맞춘다', () => {
  const collData = {
    cases: { v: {
      k1: { caseType: '산재', companyName: 'A사', status: 'closed', closedDate: '2026-05-01' },  // 종료됨
      k2: { caseType: '임금체불', companyName: 'B사', status: 'active' },                        // 여전히 진행
      k3: { caseType: '부해', companyName: 'C사', status: 'closed' }                             // 이미 완료로 반영됨
    }, u: 1 },
    consultings: null, funds: null, other_projects: null
  };
  const existing = [
    { id: 'CS0001', puRef: 'cases/k1', status: '진행', year: '' },
    { id: 'CS0002', puRef: 'cases/k2', status: '진행', year: '2026' },
    { id: 'CS0003', puRef: 'cases/k3', status: '완료', year: '2025' },
    { id: 'CS0004', status: '진행' },                    // 손으로 등록한 건 — puRef 없으면 건드리지 않는다
    { id: 'CS0005', puRef: 'cases/없음', status: '진행' } // pu-erp에서 사라진 건
  ];
  const ups = PS.buildStatusUpdates(collData, existing);
  assert.equal(ups.length, 1, '바뀐 것만 나와야 합니다');
  assert.equal(ups[0].puRef, 'cases/k1');
  assert.equal(ups[0].status, '완료');
  assert.equal(ups[0].year, '2026', '종료일에서 연도를 채운다');
});

test('unwrap: pu-erp의 {v,u} 봉투를 벗긴다', () => {
  // pu-erp는 data/{키} = {v:실제값, u:타임스탬프} 로 저장하고 자신은 data/{키}/v 로 읽는다.
  // 봉투를 안 벗기면 컬렉션마다 v·u 두 개가 레코드로 세어진다(4×2=8건 유령 레코드).
  assert.deepEqual(PS.unwrap({ v: [1, 2], u: 123 }), [1, 2]);
  assert.deepEqual(PS.unwrap({ v: { a: 1 }, u: 1 }), { a: 1 });
  assert.equal(PS.unwrap({ v: null, u: 1 }), null);          // 빈 봉투
  assert.deepEqual(PS.unwrap([1, 2]), [1, 2]);               // 봉투 없으면 그대로
  assert.deepEqual(PS.unwrap({ k1: { a: 1 } }), { k1: { a: 1 } });
  assert.equal(PS.unwrap(null), null);
});

test('buildSyncPlan: 봉투에 싸인 컬렉션도 제대로 읽는다', () => {
  const closed = { caseType: '부당해고', companyName: 'A사', title: '사건1', closedDate: '2026-01-01', managerMain: '2001' };
  const collData = {
    cases: { v: { k1: closed }, u: 1770000000000 },          // pu-erp 실제 형태
    consultings: { v: {}, u: 1 },
    funds: null,
    other_projects: null
  };
  const plan = PS.buildSyncPlan(collData, new Set(), UMAP);
  assert.equal(plan.adds.length, 1);
  assert.equal(plan.adds[0].rec.puRef, 'cases/k1');
  assert.equal(plan.skippedOpen, 0, '봉투의 u(타임스탬프)를 레코드로 세면 안 됩니다');
});

test('buildSyncPlan: puRef 처음인 것만 들어오고 이미 있는 건 건너뛴다', () => {
  const collData = {
    cases: {
      k1: { caseType: '부당해고', companyName: 'A사', title: '사건1', closedDate: '2026-01-01', managerMain: '2001' },
      k2: { caseType: '임금체불', companyName: 'B사', title: '사건2', status: 'active' },            // 진행 중 → 상태만 '진행'으로
      k3: { caseType: '산재', companyName: 'C사', title: '사건3', status: 'closed', managerMain: '2001' }
    },
    consultings: {
      c1: { consultingType: '일터혁신', companyName: 'D사', title: '컨설팅1', status: 'done', managerMain: '2003' }
    },
    funds: null,                                                                                      // 컬렉션이 비어도 죽지 않는다
    other_projects: {}
  };
  const existing = new Set(['cases/k3']);                                                             // 이미 들어온 것(배제 포함)
  const plan = PS.buildSyncPlan(collData, existing, UMAP);

  assert.equal(plan.adds.length, 3);                                                                  // k1 + k2 + c1
  assert.deepEqual(plan.counts, { case: 2, consult: 1, fund: 0, etc: 0 });
  assert.equal(plan.closedCount, 2);                                                                  // k1 · c1
  assert.equal(plan.openCount, 1);                                                                    // k2
  assert.equal(plan.skippedKnown, 1);                                                                 // k3
  const refs = plan.adds.map((a) => a.rec.puRef).sort();
  assert.deepEqual(refs, ['cases/k1', 'cases/k2', 'consultings/c1']);
  assert.equal(plan.adds.find((a) => a.rec.puRef === 'cases/k2').rec.status, '진행');
});

test('buildSyncPlan: 배열형 컬렉션(Firebase가 배열로 줄 때)도 처리한다', () => {
  const collData = { cases: [null, { caseType: '사건', companyName: 'E사', title: 't', closedDate: '2025-05-05' }],
                     consultings: null, funds: null, other_projects: null };
  const plan = PS.buildSyncPlan(collData, new Set(), {});
  assert.equal(plan.adds.length, 1);
  assert.equal(plan.adds[0].rec.puRef, 'cases/1');                                                    // 배열 인덱스가 키
});
