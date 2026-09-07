/* 퇴직정산 — 「0원으로 산정된 건」을 화면이 스스로 짚는다 (2026-09-05)
 *
 * ■ 무슨 일이 있었나
 *   급여 기록의 사번 칸은 `empSid` 인데, 퇴직정산의 평균임금 계산만 `p.sid` 로 찾고
 *   있었다. 그래서 **최근 3개월을 늘 못 찾았고**, 1일 평균임금이 0 이 됐다.
 *   법정 퇴직금 = 평균임금 × 30 × 근속연수 이므로 **퇴직금도 0** 이 된다.
 *   2026-09-04 에 고쳤다(f85c123). 그러나 **그 전에 산정해 둔 기록은 0 인 채로 남는다.**
 *
 * ■ ★ 그래서 「고쳤다」로 끝내지 않는다
 *   이미 저장된 건은 열어도 다시 계산하지 않는다(있는 값을 그대로 보여 준다).
 *   조용히 두면 아무도 모른다 — 화면이 «먼저 말해야» 한다.
 *
 * ■ 지키는 규칙
 *   ① ★ 0원이어도 «급여 기록이 없으면» 짚지 않는다 — 그때는 0 이 맞는 값이다
 *   ② ★ 사람이 손으로 적어 둔 값이 «이긴다» — 흠과 상관없다
 *   ③ ★ 자동으로 안 고친다 — 이미 지급한 건일 수 있다. 사람이 누른다
 *   ④ 다시 셀 때도 «손으로 적어 둔 값»은 안 건드린다
 *   ⑤ 화면이 「이미 지급한 건이면 먼저 정하라」고 말한다
 * 실행: node --test tests/retire-zero-wage.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

function 떼어오기(이름들, extra) {
  const ctx = Object.assign({ String, Number, Math, Object, Array }, extra || {});
  vm.createContext(ctx);
  for (const n of 이름들) {
    const at = src.indexOf('function ' + n + '(');
    assert.ok(at > 0, n + ' 을 찾지 못했습니다');
    let d = 0, i = src.indexOf('{', at);
    for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) break; } }
    vm.runInContext(src.slice(at, i + 1), ctx);
  }
  return ctx;
}

const 급여 = [{ empSid: 'P-7', ym: '2026-05' }, { empSid: 'P-7', ym: '2026-06' },
               { empSid: 'P-7', ym: '2026-07' }, { empSid: 'P-7', ym: '2026-09' }];
const 판정 = () => 떼어오기(['retireMonthsBefore', 'retireZeroSuspect']);

test('★ 0원이고 급여 기록이 있으면 «짚는다»', () => {
  const c = 판정();
  assert.equal(c.retireZeroSuspect({ sid: 'P-7', retireDate: '2026-08-15', avgWageBase: 0 }, 급여), true,
    '★ 0원으로 산정된 건을 조용히 넘기면 퇴직금이 적게 나간 것을 아무도 모릅니다');
  /* 퇴직 달 «앞»의 것만 센다 — 퇴직 뒤의 급여는 평균임금 기초가 아니다 */
  assert.equal(c.retireMonthsBefore({ sid: 'P-7', retireDate: '2026-08-15' }, 급여), 3,
    '★ 퇴직 뒤(2026-09) 급여까지 셌습니다');
});

test('★★① 급여 기록이 «없으면» 안 짚는다 — 그때는 0 이 맞는 값이다', () => {
  const c = 판정();
  assert.equal(c.retireZeroSuspect({ sid: 'P-9', retireDate: '2026-08-15', avgWageBase: 0 }, 급여), false,
    '★★ 급여가 없어 0 인 건까지 짚으면, 진짜 짚어야 할 건이 그 속에 묻힙니다');
  /* 입사 첫 달 퇴직 — 앞선 급여가 하나도 없다 */
  assert.equal(c.retireZeroSuspect({ sid: 'P-7', retireDate: '2026-05-01', avgWageBase: 0 }, 급여), false);
});

test('★★② 사람이 손으로 적어 둔 값이 «이긴다»', () => {
  const c = 판정();
  assert.equal(c.retireZeroSuspect(
    { sid: 'P-7', retireDate: '2026-08-15', avgWageBase: 0, avgWageBaseOverride: '90000' }, 급여), false,
    '★★ 사람이 정한 값을 두고 「흠입니다」라고 하면, 맞는 것을 고치게 만듭니다');
});

test('멀쩡히 산정된 건은 안 짚는다', () => {
  const c = 판정();
  assert.equal(c.retireZeroSuspect({ sid: 'P-7', retireDate: '2026-08-15', avgWageBase: 88000 }, 급여), false);
});

test('★★③ 자동으로 안 고친다 — 사람이 누른다', () => {
  /* 짚는 자리에 «고치는 일»이 붙어 있으면 안 된다 */
  const at = src.indexOf('function retireZeroSuspect(');
  const fn = src.slice(at, src.indexOf('\nfunction ', at + 10));
  assert.ok(!/setSettleModal|dbUpsert|dbSet/.test(fn),
    '★★ 짚기만 해야 하는 자리에서 값을 고칩니다 — 이미 지급한 건일 수 있습니다');
  assert.match(src, /onClick:function\(\)\{ retireRecalc\(settleModal, setSettleModal\); \}/,
    '★ 사람이 누를 자리가 없습니다');
});

test('★④ 다시 셀 때도 «손으로 적어 둔 값»은 안 건드린다', () => {
  const ctx = 떼어오기(['retireRecalc'], {
    dbGet: () => [{ empSid: 'P-7', ym: '2026-05', grossPay: 3000000 },
                  { empSid: 'P-7', ym: '2026-06', grossPay: 3000000 },
                  { empSid: 'P-7', ym: '2026-07', grossPay: 3000000 }],
    calcPayroll: (p) => ({ grossPay: p.grossPay }),
    showToast: () => {}
  });
  let 나온것 = null;
  ctx.retireRecalc({ sid: 'P-7', retireDate: '2026-08-15', workYears: 3,
    avgWageBase: 0, avgWageBaseOverride: '90000', severancePayOverride: '9990000' },
    (v) => { 나온것 = v; });
  assert.ok(나온것, '다시 세지 않았습니다');
  assert.equal(나온것.avgWageBase, 100000, '1일 평균임금을 잘못 셌습니다');
  assert.equal(나온것.avgWageBaseOverride, '90000',
    '★ 사람이 적어 둔 평균임금을 덮었습니다');
  assert.equal(나온것.severancePayOverride, '9990000',
    '★ 사람이 적어 둔 퇴직금을 덮었습니다');
});

test('★⑤ 화면이 «이미 지급한 건이면 먼저 정하라»고 말한다', () => {
  assert.match(src, /평균임금이 0원으로 산정된 건입니다/, '무엇이 문제인지 안 말합니다');
  assert.match(src, /이미 지급한 건이면/,
    '★ 되돌리기 어려운 일인데 그 사실을 안 알려 줍니다');
  assert.match(src, /개월치/, '★ 급여 기록이 몇 달치 있는지 안 보여 주면 판단할 수가 없습니다');
});

test('★ 급여 사번 칸을 «둘 다» 본다 — 급여는 empSid, 옛 기록은 sid', () => {
  const c = 판정();
  assert.equal(c.retireMonthsBefore({ sid: 'P-7', retireDate: '2026-08-15' },
    [{ sid: 'P-7', ym: '2026-06' }]), 1,
    '★ 옛 기록(sid)을 못 찾으면 짚어야 할 건을 놓칩니다');
});
