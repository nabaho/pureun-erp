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

test('mapRecord: 모르는 컬렉션은 null', () => {
  assert.equal(PS.mapRecord('unknown', 'k', {}, {}), null);
});

test('buildSyncPlan: 종료 건만, puRef 처음인 것만 들어온다', () => {
  const collData = {
    cases: {
      k1: { caseType: '부당해고', companyName: 'A사', title: '사건1', closedDate: '2026-01-01', managerMain: '2001' },
      k2: { caseType: '임금체불', companyName: 'B사', title: '사건2', status: 'active' },            // 진행 중 → 제외
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

  assert.equal(plan.adds.length, 2);                                                                  // k1 + c1
  assert.deepEqual(plan.counts, { case: 1, consult: 1, fund: 0, etc: 0 });
  assert.equal(plan.skippedOpen, 1);                                                                  // k2
  assert.equal(plan.skippedKnown, 1);                                                                 // k3
  const refs = plan.adds.map((a) => a.rec.puRef).sort();
  assert.deepEqual(refs, ['cases/k1', 'consultings/c1']);
});

test('buildSyncPlan: 배열형 컬렉션(Firebase가 배열로 줄 때)도 처리한다', () => {
  const collData = { cases: [null, { caseType: '사건', companyName: 'E사', title: 't', closedDate: '2025-05-05' }],
                     consultings: null, funds: null, other_projects: null };
  const plan = PS.buildSyncPlan(collData, new Set(), {});
  assert.equal(plan.adds.length, 1);
  assert.equal(plan.adds[0].rec.puRef, 'cases/1');                                                    // 배열 인덱스가 키
});
