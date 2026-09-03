'use strict';
/* 인사관리 검토에서 «남겨 뒀던» 것들 (대표 지시 2026-09-03 「남은것 해라」)

   ③ 퇴직금 — 급여 기록이 없으면 «0원»이 아니라 「셈할 수 없다」고 말한다
      예전에는 대상이 맞다고 하면서 0원을 내놓았다. 그 숫자를 믿으면
      줘야 할 돈을 안 주게 된다. 0원과 «모른다»는 다른 말이다.

   ④ 퇴직금 — 근속연수를 365.25 가 아니라 365 로 나눈다
      법정 퇴직금은 재직일수 ÷ 365 다. 0.25 를 더 나누면 근속연수가 짧아져
      퇴직금이 늘 «적게» 나온다. 적게 주는 쪽으로 기우는 반올림은 안 한다.

   ⑥ 연차 촉진 안내 — 같은 이름이 둘이면 «아예 안 적는다»
      연차대장이 «이름+연도»로 담겨 사번이 없다. 이름으로 찾을 수밖에 없는데,
      동명이인이 생기면 «남의 잔여 연차»가 그 사람 임금명세서에 실린다.
      사번으로 바꾸려면 대장 구조부터 바꿔야 한다(별건). 그때까지는 비운다.

   ⑦ 「회계연도 기준」 — 고르면 «아직 안 쓰인다»고 크게 알린다
      부여 일수를 셈하는 곳은 늘 12월 31일 기준이다. 고르기만 하고 숫자가
      그대로면 화면이 조용히 틀린 연차를 말한다. 연차는 곧 돈이다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn.js');

const R = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/* ── 퇴직금 계산을 실제로 돌린다 ── */
function severanceOf(rows, hire, retire){
  const c = {
    dbGet: (k, d) => (k === 'payroll_monthly' ? rows : d),
    Date, Math, parseInt, parseFloat, isFinite,
  };
  vm.createContext(c);
  vm.runInContext(
    cutFn(src, 'function calcLegalAllowances(') + '\n'
    + cutFn(src, 'function calcAverageWage(') + '\n'
    + cutFn(src, 'function calcOrdinaryDailyWage(') + '\n'
    + cutFn(src, 'function calcLegalSeverance(') + '\n'
    + 'this.run = calcLegalSeverance;', c);
  return c.run('A-001', hire, retire);
}
const PAY = (ym) => ({ empSid: 'A-001', ym: ym, status: 'confirmed', baseSalary: 3000000 });

/* ══════ ③ 자료가 없으면 «모른다»고 말한다 ══════ */

test('★★ 급여 기록이 없으면 퇴직금 «0원»을 내놓지 않는다', () => {
  const got = severanceOf([], '2020-01-01', '2026-06-30');
  assert.notEqual(got.severance, 0,
    '★★ 0원을 내놓으면 그 숫자를 믿고 줘야 할 돈을 안 주게 됩니다');
  assert.equal(got.cannotCalc, true, '★★ 「셈할 수 없다」고 밝혀야 합니다');
  assert.match(got.reason, /셈할 수 없/, '★ 까닭을 사람 말로 적어야 합니다');
});

test('★★ 「자료 없음」을 「대상 아님」으로 읽히게 두지 않는다', () => {
  /* 화면이 !eligible 하나로 두 경우를 함께 그린다 — 딸린 설명이 갈려야 한다. */
  const at = src.indexOf('calc.cannotCalc');
  assert.ok(at > 0, '★★ 화면이 두 경우를 안 가릅니다');
  const box = bare(src.slice(at, at + 500));
  assert.match(box, /아니라는 뜻이 아닙니다/,
    '★★ 「1년 미만이라 대상 아님」으로 읽히면, 줘야 할 퇴직금을 안 주게 됩니다');
});

test('★ 급여 기록이 있으면 예전처럼 셈한다 — 막아 놓고 다 막으면 안 된다', () => {
  const got = severanceOf(['2026-04', '2026-05', '2026-06'].map(PAY), '2020-01-01', '2026-06-30');
  assert.equal(got.eligible, true);
  assert.ok(got.severance > 0, '★ 멀쩡한 경우까지 막혔습니다');
});

/* ══════ ④ 365 로 나눈다 ══════ */

test('★★ 근속연수를 365 로 나눈다 — 365.25 는 늘 «적게» 준다', () => {
  const body = bare(cutFn(src, 'function calcLegalSeverance('));
  assert.ok(body.indexOf('365.25') < 0,
    '★★ 365.25 로 나누면 근속연수가 짧아져 퇴직금이 늘 적게 나옵니다');
  /* 딱 4년(윤년 하나 낀 구간)이면 4.00년이 나와야 한다 */
  const got = severanceOf(['2026-04', '2026-05', '2026-06'].map(PAY), '2022-07-01', '2026-06-30');
  assert.ok(got.years >= 4.0,
    '★★ 4년 근속이 ' + got.years + '년으로 셈됐습니다 — 짧게 잡으면 퇴직금이 줍니다');
});

/* ══════ ⑥ 동명이인이면 안 적는다 ══════ */

test('★★ 같은 이름이 둘이면 연차 안내를 «아예 안 적는다»', () => {
  const body = bare(cutFn(src, 'function getLeavePromoNotice('));
  assert.match(body, /_same\.length > 1\) return null;/,
    '★★ 동명이인이면 «남의 잔여 연차»가 그 사람 명세서에 실립니다 — 남의 개인정보입니다');
  /* 퇴직자는 세지 않는다 — 옛 동명이인 때문에 멀쩡한 안내가 사라지면 안 된다 */
  assert.match(body, /!u\.retireDate/,
    '★ 퇴직한 동명이인까지 세면, 아무 문제 없는 사람의 안내가 사라집니다');
});

/* ══════ ⑦ 회계연도는 «아직 안 쓴다»고 알린다 ══════ */

test('★★ 「회계연도 기준」을 고르면 «아직 적용 안 됨»을 알린다', () => {
  const at = src.indexOf("f.basis === 'fiscalYear'");
  assert.ok(at > 0, '휴가 정책 화면을 못 찾았습니다');
  const box = bare(src.slice(at, at + 1200));
  assert.match(box, /아직 적용 안 됨/,
    '★★ 고르면 숫자가 바뀔 것으로 믿게 됩니다 — 연차는 곧 돈이라 조용히 틀리면 안 됩니다');
  assert.match(box, /입사일 기준/,
    '★ «지금 무엇으로 셈하는지»를 안 적으면, 무엇이 틀린지 모릅니다');
  assert.match(box, /먼저 알려 주세요/,
    '★ 바꾸고 싶을 때 어디로 가야 하는지 안 적으면 거기서 길이 끊깁니다');
});

test('★ 셈하는 곳은 «아직 그대로»다 — 반쯤 바꾸면 그게 더 위험하다', () => {
  /* 회계연도로 진짜 바꾸는 일은 부여·이월·퇴직정산이 함께 움직여야 한다.
     지금 반만 바꿔 두면 화면마다 다른 연차가 나온다. 안 건드린 것을 못 박는다. */
  const grant = bare(cutFn(src, '  function calcGrantDays('));
  assert.match(grant, /new Date\(parseInt\(year\), 11, 31\)/,
    '★★ 부여 일수 셈을 «반쯤» 바꿨습니다 — 화면마다 다른 연차가 나옵니다');
});
