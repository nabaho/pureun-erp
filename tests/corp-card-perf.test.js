/* 법인 대시보드 직원 카드의 성과 숫자 (2026-08-16 대표 지시: "직원카드 어긋난거 고쳐줘")
   ★ 이 카드만 perfShares 를 안 보고 「입금 전액 × 본인 요율 ×(부담당이면 subRatio)」로
     따로 어림잡고 있었다. 분할%·요율 조정·수습·퇴사·세금 차감이 하나도 반영되지 않아
     성과관리·급여가 내는 «실제 지급액» 과 어긋났다.
   지킬 것: 두 화면이 «같은 답» 을 낸다. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');
function cut(from, to) {
  const s = SRC.indexOf(from);
  assert.ok(s > 0, '코드를 찾지 못했다: ' + from);
  const e = SRC.indexOf(to, s);
  assert.ok(e > s, '끝을 찾지 못했다: ' + to);
  return SRC.slice(s, e);
}

/* 두 함수를 «같은 자료» 위에서 실제로 돌려 본다 — 글자만 보면 어긋나도 통과한다 */
const CODE = cut('function erpPerfBreakdown(', '\nfunction applyPerfOverride(');

const USERS = [{ sid: 'P001', name: '권형하' }, { sid: 'P005', name: '박재원' }];
function run(incomes) {
  const ctx = {
    Object, Math, String, Array, Number, parseInt, console,
    dbGet: (k, d) => (k === 'finance_income' ? incomes : (k === 'user_accounts' ? USERS : d)),
    getActiveUsers: () => USERS
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx);
  return ctx;
}

// 정우신약 같은 건: 주담당 대표(요율 0 → 분배 제외), 부담당 박재원이 다 받는다
const INC = [
  { id: 'a', date: '2026-05-27', amount: 1100000, sourceKind: 'case',
    perfShares: [
      { sid: 'P001', role: '주담당', amount: 0, baseAmount: 0 },
      { sid: 'P005', role: '부담당', amount: 150000, baseAmount: 1000000 }
    ] },
  { id: 'b', date: '2026-05-14', amount: 2000000, sourceKind: 'consulting',
    perfShares: [
      { sid: 'P005', role: '주담당', amount: 135000, baseAmount: 900000 },
      { sid: 'P001', role: '부담당', amount: 45000, baseAmount: 300000 }
    ] },
  // 자문료 — 성과관리에서 일부러 뺀다
  { id: 'c', date: '2026-05-02', amount: 500000, sourceKind: 'company',
    perfShares: [{ sid: 'P005', role: '주담당', amount: 75000, baseAmount: 500000 }] },
  // 개인소득 — 급여 성과에 안 넣는다
  { id: 'd', date: '2026-05-03', amount: 300000, sourceKind: 'other', isPersonalIncome: true,
    perfShares: [{ sid: 'P005', role: '주담당', amount: 45000, baseAmount: 300000 }] },
  // 다른 달
  { id: 'e', date: '2026-06-10', amount: 1000000, sourceKind: 'case',
    perfShares: [{ sid: 'P005', role: '주담당', amount: 150000, baseAmount: 1000000 }] }
];

test('역할별로 나누어 센다', () => {
  const C = run(INC);
  const r = C.erpPerfBreakdown('P005', '2026-05');
  assert.strictEqual(r.mainBonus, 135000, '주담당 성과급');
  assert.strictEqual(r.subBonus, 150000, '부담당 성과급');
  assert.strictEqual(r.mainCnt, 1);
  assert.strictEqual(r.subCnt, 1);
  assert.strictEqual(r.total, 285000);
});

test('금액은 실제 저장된 몫에서 온다 — 다시 셈하지 않는다', () => {
  /* ★ 여기가 어긋났던 자리다. 전에는 「입금 전액 × 요율」로 다시 셌기 때문에
     분할 50:50 이어도 100% 받은 것처럼 나왔다. */
  const C = run(INC);
  const r = C.erpPerfBreakdown('P005', '2026-05');
  assert.strictEqual(r.mainAmt, 900000, '주담당 몫(성과 기준액)은 분할%가 반영된 값이다');
  assert.strictEqual(r.subAmt, 1000000);
});

test('자문료는 뺀다 (성과관리와 같은 규칙)', () => {
  const C = run(INC);
  const r = C.erpPerfBreakdown('P005', '2026-05');
  assert.ok(r.total < 285000 + 75000, '자문료 75,000이 섞였다');
});

test('개인소득도 뺀다', () => {
  const C = run(INC);
  const r = C.erpPerfBreakdown('P005', '2026-05');
  assert.ok(r.total !== 330000, '개인소득 45,000이 섞였다');
});

test('0원인 사람은 세지 않는다', () => {
  /* 요율 0%인 대표는 분배에서 빠진다 — 0원짜리 줄을 세면 「건수」가 거짓말한다 */
  const C = run(INC);
  const r = C.erpPerfBreakdown('P001', '2026-05');
  assert.strictEqual(r.mainCnt, 0, '0원짜리 주담당 줄을 셌다');
  assert.strictEqual(r.subBonus, 45000);
  assert.strictEqual(r.total, 45000);
});

test('달과 해를 둘 다 본다', () => {
  const C = run(INC);
  assert.strictEqual(C.erpPerfBreakdown('P005', '2026-05').total, 285000);
  assert.strictEqual(C.erpPerfBreakdown('P005', '2026').total, 285000 + 150000);
});

test('마이너스 조정도 반영한다', () => {
  const C = run([{ id: 'x', date: '2026-05-01', amount: 100, sourceKind: 'case',
    perfShares: [{ sid: 'P005', role: '주담당', amount: -50000, baseAmount: 0 }] }]);
  assert.strictEqual(C.erpPerfBreakdown('P005', '2026-05').total, -50000);
});

test('옛 자료(사번 자리에 이름)도 찾는다', () => {
  const C = run([{ id: 'y', date: '2026-05-01', amount: 100, sourceKind: 'case',
    perfShares: [{ sid: '박재원', role: '주담당', amount: 10000, baseAmount: 0 }] }]);
  assert.strictEqual(C.erpPerfBreakdown('P005', '2026-05').total, 10000);
});

test('빈 값에도 안 터진다', () => {
  const C = run([]);
  assert.strictEqual(C.erpPerfBreakdown('', '2026-05').total, 0);
  assert.strictEqual(C.erpPerfBreakdown('P005', '').total, 0);
});

/* ── 급여가 쓰는 함수와 «같은 답» 인가 ── */
test('합계가 급여의 calcPerfBonus 와 정확히 같다', () => {
  /* ★ 이것이 이번 고침의 핵심이다. 두 화면이 다른 답을 내면 안 된다.
     낱말이 아니라 «같은 자료로 두 함수를 돌려» 대조한다. */
  const C = run(INC);
  vm.runInContext(cut('function calcPerfBonus(', '\n// ===== 성과급 건별 수동조정'), C);
  ['P001', 'P005'].forEach(function (sid) {
    const mine = C.erpPerfBreakdown(sid, '2026-05').total;
    const pay = C.calcPerfBonus(sid, '2026-05').total;
    assert.strictEqual(mine, pay, sid + ' — 카드 ' + mine + ' vs 급여 ' + pay);
  });
});

/* ── 화면이 실제로 그것을 쓰는가 ── */
const CARD = cut("'🏆', '성과 (' + period + ')'", '표시 데이터는 각 모듈');
// 주석 글귀가 아니라 «코드의 자리» 로 잡는다 — 주석은 고칠 수 있는 것이다
const CALC = cut("var mgrRates = dbGet('mgr_rates', {}) || {};", '// 카드 공통 스타일');

test('대시보드가 새 함수를 쓴다', () => {
  assert.strictEqual(/erpPerfBreakdown\(/.test(CALC), true);
});

test('옛 어림셈이 사라졌다', () => {
  /* 「입금 전액 × 요율 × subRatio」로 다시 세던 길이 남아 있으면 언젠가 그리로 돌아간다 */
  assert.strictEqual(/subRatio/.test(CALC), false, '옛 subRatio 셈이 남아 있다');
  assert.strictEqual(/perfMain \+= amt/.test(CALC), false, '옛 입금 전액 합산이 남아 있다');
});

test('「입금」이 아니라 「몫」이라고 적는다', () => {
  /* 분할%가 반영된 값이므로 「입금」이라 적으면 숫자가 거짓말이 된다 */
  assert.strictEqual(/주담당 입금/.test(CARD), false, '옛 이름표가 남아 있다');
  assert.strictEqual(/성과 기준액/.test(CARD), true);
});
