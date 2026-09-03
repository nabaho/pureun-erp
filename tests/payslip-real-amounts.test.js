'use strict';
/* 임금명세서가 «실제로 지급된 금액»을 적는다 + 퇴직금 평균임금에 법정수당을 넣는다
   (대표 지시 2026-09-03 — 인사관리 전면 검토에서 나온 ①②번)

   ■ ① 명세서가 «있지도 않은 칸»을 읽고 있었다
     메일 본문과 한글 임금명세서가 dedPension·dedHealth·allowFood… 를 읽는데,
     그 이름으로 «저장하는 코드가 이 저장소에 한 줄도 없었다».
     실제 자료 485건 중 0건 — 반면 진짜 값은 nationalPension·healthInsurance…
     에 448건 들어 있었다. 그래서 명세서는 공제가 전부 0원이고
     실지급액 = 지급총액이었다. 근로자가 받은 통장 금액과 다른 문서를 교부한 셈이다.
     ⚠ 임금명세서 교부는 근로기준법 §48② 이고 «공제 항목별 금액»이 필수 기재사항이다.

   ■ ② 퇴직금 평균임금에서 연장·야간·휴일수당이 빠져 있었다
     그 자리가 «빈 칸»이었고 「자동계산이라 따로 저장 안되어있음」이라 적혀 있었다.
     2026-09-02 에 근태 연동을 고치면서 저장되기 시작했는데도 계속 안 가져가,
     초과근로가 많은 사람일수록 퇴직금이 적게 나왔다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn.js');

const R = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
/* ⚠ 주석을 먼저 걷는다 — 「예전엔 이랬다」고 적어 둔 설명글에 옛 칸 이름이 있다 */
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const code = bare(src);

/* ── payslipLines 를 실제로 돌린다 ── */
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(cutFn(src, 'function payslipLines(') + '\nthis.lines = payslipLines;', ctx);
const { lines } = ctx;

/* 급여대장에서 가져온 달 — 실제로 나간 금액이 칸에 있다 */
const LEDGER = {
  baseSalary: 3000000, overtimePay: 200000, nightPay: 50000, bonus: 100000,
  nonTaxableMeal: 200000,
  nationalPension: 135000, healthInsurance: 106000, longTermCare: 13000,
  employmentInsurance: 27000, incomeTax: 84000, localTax: 8400,
};

/* ══════ ① 명세서 ══════ */

test('★★ 급여대장에서 가져온 달은 «실제로 나간» 공제를 적는다 — 0원이 아니다', () => {
  const m = lines(LEDGER, null);
  assert.equal(m.fromLedger, true, '★ 가져온 달을 못 알아봅니다');
  assert.ok(m.cut > 0,
    '★★ 공제가 0원입니다 — 근로자가 받은 통장 금액과 다른 명세서를 교부하게 됩니다');
  assert.equal(m.cut, 135000 + 106000 + 13000 + 27000 + 84000 + 8400);
  const names = Array.from(m.ded, (x) => x[0]).join(',');
  assert.ok(names.indexOf('국민연금') >= 0 && names.indexOf('소득세') >= 0,
    '★★ 공제 «항목별» 금액은 임금명세서 필수 기재사항입니다 (근기법 §48②)');
});

test('★★ 실지급액이 지급총액과 «달라야» 한다 — 공제를 뺀 값이다', () => {
  const m = lines(LEDGER, null);
  assert.ok(m.net < m.gross,
    '★★ 실지급액 = 지급총액입니다 — 공제가 안 빠졌습니다');
  assert.equal(m.net, m.gross - m.cut);
});

test('★★ 항목을 더한 값이 «합계와 같다» — 안 맞는 명세서는 못 믿는다', () => {
  const m = lines(LEDGER, null);
  const sum = (a) => a.reduce((t, x) => t + x[1], 0);
  assert.equal(sum(m.pay), m.gross, '★★ 지급 항목의 합이 지급합계와 다릅니다');
  assert.equal(sum(m.ded), m.cut, '★★ 공제 항목의 합이 공제합계와 다릅니다');
});

test('★ 지급 항목도 실제 칸에서 가져온다 — 수당이 통째로 0이던 자리다', () => {
  const m = lines(LEDGER, null);
  const map = {};
  m.pay.forEach((x) => { map[x[0]] = x[1]; });
  assert.equal(map['기본급'], 3000000);
  assert.equal(map['연장근로수당'], 200000, '★ 연장수당이 명세서에서 사라집니다');
  assert.equal(map['식대'], 200000, '★ 식대가 명세서에서 사라집니다');
  assert.equal(map['상여·성과급'], 100000);
});

test('★★ 앱에서 만든 달은 «셈해서» 채운다 — 가져온 칸이 없다고 0원이면 안 된다', () => {
  /* 그 달은 저장된 공제 칸이 아예 없다. 그때는 calcPayroll 이 셈한 값을 쓴다. */
  const drafted = { baseSalary: 3000000, legalAllowances: { overtimeHours: 10 } };
  const fake = () => ({
    pension: 135000, healthIns: 106000, longCare: 13000, empIns: 27000,
    incomeTax: 84000, localTax: 8400,
    legal: { overtime: 215000, night: 0, holiday: 0, weekly: 0 },
  });
  const m = lines(drafted, fake);
  assert.equal(m.fromLedger, false);
  assert.ok(m.cut > 0, '★★ 앱에서 만든 달의 명세서가 공제 0원으로 나갑니다');
  const map = {}; m.pay.forEach((x) => { map[x[0]] = x[1]; });
  assert.equal(map['연장근로수당'], 215000, '★ 셈한 연장수당이 안 실립니다');
});

test('★ 0원 항목은 «안 적는다» — 빈 줄만 늘어난 명세서는 읽기 나쁘다', () => {
  const m = lines({ baseSalary: 3000000, nationalPension: 0 }, null);
  const names = Array.from(m.pay, (x) => x[0]).concat(Array.from(m.ded, (x) => x[0]));
  assert.ok(names.indexOf('연차수당') < 0, '★ 0원짜리가 줄로 나옵니다');
});

test('★★ 있지도 않던 옛 칸을 «다시 읽지 않는다»', () => {
  ['dedPension', 'dedHealth', 'dedLtc', 'dedEmp', 'dedIncome', 'dedLocal', 'dedEtc',
    'allowFood', 'allowCar', 'allowChild', 'allowEtc'].forEach(function (k) {
    assert.ok(code.indexOf(k) < 0,
      '★★ ' + k + ' 를 다시 읽고 있습니다 — 이 이름으로 저장하는 코드는 없습니다(늘 0원)');
  });
});

test('★★ 명세서·일괄메일 목록·퇴직정산 누적이 «같은 자리»에서 셈한다', () => {
  /* 셋이 따로 셈하면, 보낼 때 본 금액과 받은 명세서가 달라진다. */
  const n = (code.match(/payslipLines\(/g) || []).length;
  assert.ok(n >= 4,
    '★★ 부르는 곳이 ' + n + '군데뿐입니다 — 셋(명세서·일괄메일·퇴직정산)이 모두 써야 합니다');
});

/* ══════ ② 퇴직금 평균임금 ══════ */

test('★★ 평균임금에 연장·야간·휴일수당이 «들어간다»', () => {
  const body = bare(cutFn(src, 'function calcAverageWage('));
  /* 예전에는 여기가 «빈 if» 였다 — 그 모양으로 돌아가면 걸린다 */
  assert.doesNotMatch(body, /if\(p\.legalAllowances\)\{\s*\}/,
    '★★ 법정수당 자리가 다시 비었습니다 — 초과근로가 많을수록 퇴직금이 적게 나옵니다');
  assert.match(body, /p\.overtimePay/,
    '★★ 실제로 지급된 연장수당을 안 가져갑니다');
  assert.match(body, /p\.nightPay/, '★ 야간수당이 빠집니다');
  assert.match(body, /p\.holidayPay/, '★ 휴일수당이 빠집니다');
  /* 더한 값이 임금총액에 실제로 들어가야 한다 — 셈해 놓고 안 쓰면 뜻이 없다 */
  assert.match(body, /w \+= lw;/, '★★ 셈해 놓고 임금총액에 안 더하고 있습니다');
});

test('★ 앱에서 만든 달은 «시간×통상시급»으로 셈해서 넣는다', () => {
  const body = bare(cutFn(src, 'function calcAverageWage('));
  assert.match(body, /calcLegalAllowances\(p,/,
    '★ 저장된 금액이 없는 달은 셈해서라도 넣어야 합니다');
  /* 실제 지급액이 있으면 그것이 먼저 — 오늘 요율로 다시 셈하면 옛 달이 틀어진다 */
  assert.match(body, /if\(!lw && p\.legalAllowances\)/,
    '★★ 실제 지급액을 두고 다시 셈하면, 옛 달의 퇴직금이 오늘 요율로 틀어집니다');
});
