/* 관계망 올리기 — 다른 프로그램이 쓸 수 있게 (6단계 ㉡, 2026-09-04)
 *
 * ■ 무엇이 없었나
 *   확정 관계망이 «파일 내려받기»뿐이었다. 그래서 볼 때마다 처음부터 다시 훑어야 했고,
 *   다른 프로그램은 관계망을 아예 몰랐다. 서버에 쓰는 코드가 한 줄도 없었다.
 *
 * ■ ★ 가장 위험한 자리 — 이 저장소가 처음으로 «온톨로지가 서버에 쓰는» 길을 낸다
 *   그래서 지킬 것을 기계로 못 박는다. 사람이 눈으로 보는 것으로는 모자란다.
 *
 *   ① 원본을 향해 한 글자도 안 쓴다 — 모든 경로가 ontology/ 로 시작한다
 *   ② ★ current(지금 볼 판)를 «맨 마지막»에 쓴다 — 먼저 쓰면 반쯤 올라간 판을 남이 읽는다
 *   ③ ★ 추정 후보는 안 올린다 — 확정(신뢰도 1.0)만
 *   ④ ★ 이름·금액·연락처가 값에 «없다» — 색인은 원본 payload 를 복제하지 않는다
 *   ⑤ ★ 사람·재무 칸이 «경로로» 갈라져 있다 — 규칙이 그 자리에 걸릴 수 있어야 한다
 *   ⑥ 한 번에 다 쓰지 않는다 — 실시간DB 는 16MB 까지만 받는다(기금에서 실제로 맞았다)
 *   ⑦ 파이어베이스 규칙이 사람·재무를 관리자에게만 연다
 * 실행: node --test tests/ontology-upload.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const O = require('../js/pu-ontology.js');

const root = path.join(__dirname, '..');
const erp = fs.readFileSync(path.join(root, 'pu-erp.html'), 'utf8');

/* 사람 이름·금액이 섞인 진짜배기 자료 — 그것이 «안 올라가는지»를 봐야 한다 */
function 관계망() {
  const rep = O.auditIntegrated({
    companies: [{ id: 'co1', name: '천성가축약품', bizNo: '123-45-67890' }],
    contracts: [{ id: 'ct1', companyId: 'co1', companyName: '천성가축약품', managerMain: 'P-001' }],
    cases: [{ id: 'cs1', companyName: '천성가축약품' }],   /* companyId 없음 → 추정 후보 */
    user_accounts: [{ sid: 'P-001', name: '권형하' }],
    attendance_records: [{ id: 'att1', sid: 'P-001', date: '2026-08-01' }],
    payroll_monthly: [{ id: 'pay1', empSid: 'P-001', ym: '2026-08', netPay: 4200000 }],
    finance_income: [{ id: 'in1', companyId: 'co1', amount: 3300000 }]
  }, {}, {});
  return { rep, snap: O.buildSnapshot(rep) };
}

test('★★① 원본을 향해 한 글자도 안 쓴다', () => {
  const plan = O.uploadPlan(관계망().snap);
  assert.ok(plan.writes.length > 0, '쓸 것이 하나도 없습니다');
  for (const w of plan.writes) {
    assert.ok(w.path.indexOf('ontology/') === 0,
      '★★ 원본 자리에 씁니다: ' + w.path + ' — 색인은 원본을 향해 아무것도 안 합니다');
  }
  assert.equal(plan.sourceMutation, 'never');
});

test('★★② current 를 «맨 마지막»에 쓴다 — 반쯤 올라간 판을 남이 보면 안 된다', () => {
  const plan = O.uploadPlan(관계망().snap);
  const at = plan.writes.findIndex((w) => w.path === 'ontology/v1/current');
  assert.equal(at, plan.writes.length - 1,
    '★★ current 가 ' + (at + 1) + '번째입니다 — 먼저 바꾸면 아직 안 올라간 판을 가리킵니다');
  assert.equal(plan.writes[at].value, plan.generationId);
  /* 새 판은 옛 판을 «덮지 않는다» — 판 번호가 자리 이름에 들어간다 */
  assert.ok(plan.writes.every((w) => w.path === 'ontology/v1/current'
    || w.path.indexOf('ontology/v1/gen/' + plan.generationId) === 0),
    '★ 판 번호 밖에 씁니다 — 올리다 끊기면 보던 판이 망가집니다');
});

test('★③ 추정 후보는 안 올린다 — 확정만', () => {
  const { rep, snap } = 관계망();
  /* 이 자료에는 이름으로 맞춘 후보가 실제로 들어 있다 */
  assert.ok(rep.edges.some((e) => Number(e.confidence) !== 1),
    '시험 자료에 추정 후보가 없어 이 검사가 헛돕니다');
  const plan = O.uploadPlan(snap);
  assert.ok(plan.excluded > 0, '★ 제외한 후보 수를 안 셉니다');
  for (const w of plan.writes) {
    if (!/\/edges$/.test(w.path)) continue;
    for (const k of Object.keys(w.value)) {
      assert.equal(w.value[k].confidence, 1,
        '★ 추정 후보가 올라갑니다 — 사람이 확정하기 전에는 저장 대상이 아닙니다');
    }
  }
});

test('★★④ 이름·금액·연락처가 값에 «없다»', () => {
  const plan = O.uploadPlan(관계망().snap);
  const 글 = JSON.stringify(plan.writes);
  for (const 값 of ['천성가축약품', '권형하', '123-45-67890', '4200000', '3300000']) {
    assert.ok(글.indexOf(값) < 0,
      '★★ 관계망에 「' + 값 + '」 이 들어갔습니다 — 색인은 원본 payload 를 복제하지 않습니다');
  }
});

test('★⑤ 사람·재무 칸이 «경로»로 갈라져 있다 — 규칙이 그 자리에 걸린다', () => {
  const plan = O.uploadPlan(관계망().snap);
  const 칸 = new Set(plan.writes
    .map((w) => (/\/gen\/[^/]+\/([a-z]+)\//.exec(w.path) || [])[1])
    .filter(Boolean));
  for (const v of ['personal', 'financial']) {
    assert.ok(칸.has(v), '★ ' + v + ' 칸이 제 경로를 안 씁니다 — 규칙을 걸 자리가 없습니다');
  }
  /* 한 경로에 두 칸이 섞이면 안 된다 */
  for (const w of plan.writes) {
    const m = /\/gen\/[^/]+\/([a-z]+)\/(entities|edges)$/.exec(w.path);
    if (m) assert.ok(['internal', 'source', 'personal', 'financial'].includes(m[1]),
      '알 수 없는 칸: ' + m[1]);
  }
});

test('★⑥ 한 번에 다 쓰지 않는다 — 실시간DB 는 16MB 까지만 받는다', () => {
  /* 기금 스냅샷에서 write_too_big 을 실제로 맞은 적이 있다. 큰 관계망을 만들어 본다. */
  const big = { companies: [], contracts: [] };
  for (let i = 0; i < 900; i++) {
    big.companies.push({ id: 'co' + i, name: '회사' + i });
    big.contracts.push({ id: 'ct' + i, companyId: 'co' + i });
  }
  const plan = O.uploadPlan(O.buildSnapshot(O.auditIntegrated(big, {}, {})));
  const 쪼갠것 = plan.writes.filter((w) => /\/internal\/(entities|edges)$/.test(w.path));
  assert.ok(쪼갠것.length >= 4,
    '★ 1,800칸을 ' + 쪼갠것.length + '번에 몰아 씁니다 — 자라면 조용히 실패합니다');
  for (const w of 쪼갠것) {
    assert.ok(Object.keys(w.value).length <= 400, '한 번에 너무 많이 씁니다');
    assert.equal(w.merge, true, '★ set 으로 쓰면 앞서 쓴 조각이 통째로 지워집니다');
  }
});

test('★⑦ 파이어베이스 규칙이 사람·재무를 «관리자에게만» 연다', () => {
  const out = execFileSync('node', [path.join(root, 'scripts/make-firebase-rules.js')],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const r = JSON.parse(out).rules;
  assert.ok(r.ontology && r.ontology.v1, '★ 관계망 자리에 규칙이 없습니다 — 올려도 거절당합니다');
  const g = r.ontology.v1.gen.$gen;
  for (const v of ['personal', 'financial']) {
    assert.match(g[v]['.read'], /isAdmin/,
      '★★ ' + v + ' 칸을 재직 직원이 읽습니다 — 원본보다 넓게 열렸습니다');
  }
  for (const v of ['internal', 'source']) {
    assert.ok(!/isAdmin/.test(g[v]['.read']), v + ' 칸은 직원이 봅니다');
    /* 쓰기 문턱을 칸 전체에 두면 한 번 통과한 관리자가 기존 개체도 덮어쓴다.
       이제 낱개 개체·관계에 두어 «관리자 + 새 값(또는 같은 값 재시도)»까지 본다. */
    assert.match(g[v].entities.$id['.write'], /isAdmin/, '★ 아무나 관계망 개체를 덮어쓸 수 있습니다');
    assert.match(g[v].edges.$id['.write'], /isAdmin/, '★ 아무나 관계망 관계를 덮어쓸 수 있습니다');
  }
  assert.match(r.ontology.v1.current['.write'], /isAdmin/, '★ 「지금 볼 판」을 아무나 바꿉니다');
});

test('★ 화면이 «올리기 전에» 무엇이 올라가는지 말하고, 그만둘 수 있다', () => {
  const at = erp.indexOf('function uploadGraph()');
  assert.ok(at > 0, '올리는 자리가 화면에 없습니다');
  const fn = erp.slice(at, erp.indexOf('\n  function ', at + 10));
  assert.match(fn, /window\.confirm\(/, '★ 묻지 않고 올립니다');
  assert.match(fn, /추정 후보/, '무엇이 빠지는지 안 말합니다');
  assert.match(fn, /원본은 바뀌지 않습니다/, '원본이 안전한지 안 말합니다');
  /* 순서를 화면이 지키는가 — plan.writes 를 «차례대로» 밟아야 한다 */
  assert.match(fn, /차례\.shift\(\)/, '★ 순서를 안 지키면 current 가 먼저 바뀔 수 있습니다');
  assert.ok(!/Promise\.all\(\s*plan\.writes/.test(fn),
    '★★ 한꺼번에 던지면 current 가 먼저 닿을 수 있습니다 — 반쯤 올라간 판을 남이 봅니다');
});
