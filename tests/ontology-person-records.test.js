/* 인사·급여 기록이 «사람»에게 붙는다 (대표 판단 2026-09-04 「1」)
 *
 * ■ 무엇이 문제였나
 *   근로계약·근태·휴가·급여 네 종류는 개체로는 진작 만들어지고 있었는데
 *   («STORE_TYPES» 에 있다) **어디에도 이어지지 않았다.** 그래서 관계망에
 *   개체만 떠 있고, 사람 화면에도 업체 화면에도 안 나왔다.
 *
 * ■ ★ 어제 목업이 틀렸던 대목 — 이것을 못 박아 둔다
 *   목업은 「근로계약 38건이 사업장에 붙는다」로 그렸다. 그런데 코드를 열어 보니
 *   이 넷은 **푸른노무법인 «직원»** 자료다(id:'ec-'+사번, sid, empSid).
 *   companyId 칸이 아예 없고, 있을 수도 없다.
 *   고객 사업장 근로자는 사건(cases)의 workers 안에 있고, 사건은 이미 업체에 붙는다.
 *   ⚠ 사업장에 붙였다면 **우리 직원 급여·근태가 고객 업체 관계망에 들어갔다.**
 *
 * ■ 지키는 규칙
 *   ① 사전에 관계어가 «먼저» 있다 (CLAUDE.md 규칙)
 *   ② ★ 사번 칸 이름이 갈래마다 다르다 — 급여는 empSid, 나머지는 sid.
 *      한쪽만 보면 급여가 통째로 안 붙는다
 *   ③ ★ 이름으로는 안 맞춘다 — 사번이 없거나 모르는 사번이면 «안 잇고 알린다»
 *   ④ ★ 급여·인사 관계는 «관리자만» 보는 칸에 들어간다
 *   ⑤ 사업장(Organization)에는 안 붙는다 — 붙이면 남의 회사에 우리 급여가 간다
 * 실행: node --test tests/ontology-person-records.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../js/pu-ontology.js');

/* 실제 자료 모양 그대로 — 급여만 empSid 인 것까지 */
function 자료() {
  return {
    user_accounts: [{ sid: 'P-001', name: '권형하' }, { sid: 'P-007', name: '김혜민' }],
    companies: [{ id: 'co1', name: '천성가축약품', bizNo: '123-45-67890' }],
    employment_contracts: [{ id: 'ec-P-007-1', sid: 'P-007', name: '김혜민', type: '근로계약서' }],
    attendance_records: [{ id: 'att-1', sid: 'P-007', date: '2026-08-01', type: 'work' }],
    leave_of_absence: [{ id: 'loa-1', sid: 'P-001', from: '2026-07-01' }],
    payroll_monthly: [{ id: 'pay-P-007-2026-08', empSid: 'P-007', ym: '2026-08' }]
  };
}
const 진단 = (d) => O.audit(d || 자료());
const 관계 = (r, pred) => r.edges.filter((e) => e.predicate === pred);

test('① 사전에 관계어가 «먼저» 있다', () => {
  const p = O.TERMS.predicates.recordedFor;
  assert.ok(p, '★ 사전에 없는 관계어를 만들면 다른 프로그램이 그 말을 모릅니다');
  assert.deepEqual(p, ['Employment|PayrollRecord', 'Person']);
  /* 시작·도착이 사전에 등록된 개체어여야 한다 */
  p.join('|').split('|').forEach((t) => assert.ok(O.TERMS.entityTypes[t], '미등록 개체어 ' + t));
});

test('★② 네 종류가 «모두» 사람에게 붙는다 — 급여(empSid)까지', () => {
  const r = 진단();
  const got = 관계(r, 'recordedFor').map((e) => e.sourceStore).sort();
  assert.deepEqual(got,
    ['attendance_records', 'employment_contracts', 'leave_of_absence', 'payroll_monthly'],
    '★ 붙은 갈래: ' + got.join(', ') + ' — 급여만 사번 칸이 empSid 라 빠지기 쉽습니다');
  /* 도착점이 진짜 사번 개체인가 */
  const 급여 = 관계(r, 'recordedFor').find((e) => e.sourceStore === 'payroll_monthly');
  assert.equal(급여.object, O.canonicalId('Person', 'P-007'),
    '★ 급여가 엉뚱한 사람에게 붙었습니다');
  assert.equal(급여.confidence, 1, '★ 사번은 확정 열쇠입니다 — 추정이면 안 됩니다');
});

test('★③ 사번이 없거나 모르는 사번이면 «안 잇고 알린다»', () => {
  const d = 자료();
  d.attendance_records.push({ id: 'att-x', date: '2026-08-02' });          /* 사번 없음 */
  d.payroll_monthly.push({ id: 'pay-X-2026-08', empSid: 'P-999', ym: '2026-08' }); /* 모르는 사번 */
  const r = 진단(d);
  const 붙은것 = 관계(r, 'recordedFor').map((e) => e.sourceId);
  assert.ok(!붙은것.includes('att-x'), '★ 사번 없는 기록을 이름으로 맞춰 붙였습니다');
  assert.ok(!붙은것.includes('pay-X-2026-08'), '★ 등록되지 않은 사번에 붙였습니다');
  const 알림 = r.issues.map((i) => i.code);
  assert.ok(알림.includes('missing_person_sid'), '★ 사번이 빈 것을 조용히 넘겼습니다');
  assert.ok(알림.includes('orphan_person'), '★ 모르는 사번을 조용히 넘겼습니다');
});

test('★★④ 급여·인사 관계는 «관리자만» 보는 칸에 들어간다', () => {
  const snap = O.buildSnapshot(진단());
  const parts = snap.partitions;
  const 어디에 = (id) => ['internal', 'source', 'personal', 'financial']
    .find((k) => parts[k].edges[id]);
  for (const e of 관계(진단(), 'recordedFor')) {
    const 칸 = 어디에(e.id);
    assert.ok(칸 === 'personal' || 칸 === 'financial',
      '★★ ' + e.sourceStore + ' 관계가 「' + 칸 + '」 칸에 있습니다 — 직원 전원이 봅니다');
  }
  /* 급여는 재무 칸이어야 한다 — 인사보다 좁다 */
  const 급여 = 관계(진단(), 'recordedFor').find((e) => e.sourceStore === 'payroll_monthly');
  assert.ok(parts.financial.edges[급여.id], '★★ 급여 관계가 재무 칸 밖에 있습니다');
});

test('★⑤ 사업장에는 안 붙는다 — 우리 직원 급여가 고객 업체로 가면 안 된다', () => {
  const r = 진단();
  for (const e of r.edges) {
    if (['employment_contracts', 'attendance_records', 'leave_of_absence', 'payroll_monthly']
      .includes(e.sourceStore)) {
      assert.ok(e.object.indexOf('Organization:') !== 0,
        '★ ' + e.sourceStore + ' 이 사업장에 붙었습니다 — 이 넷은 «우리 직원» 자료입니다');
    }
  }
});

test('사업장 재직 관계는 여전히 «미룬 것»으로 남아 있다', () => {
  /* 대표 판단 ①(2026-09-03) — 사업장 근로자에게 영구 번호가 없어 미룬다.
     이번 일로 그것이 «된 것»처럼 지워지면 안 된다. */
  const r = 진단();
  assert.equal(관계(r, 'belongsToOrganization').length, 0,
    '★ 사업장 재직 관계를 만들었습니다 — 근로자 영구 번호가 아직 없습니다');
});
