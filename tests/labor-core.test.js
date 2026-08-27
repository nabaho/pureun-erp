/* 노동법 계산 코어 검산 — js/pu-labor-core.js
   급여는 법적 책임 행위다. "화면에서 눌러 봤더니 맞더라"로는 못 믿는다.
   여기서 법 조문별로 손계산과 맞춰 본다. 실행: node tests/labor-core.test.js */
const path = require('path');
const L = require(path.join(__dirname, '..', 'js', 'pu-labor-core.js'));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function eq(name, got, want) {
  ok(name + ' (=' + want + ')', got === want, '실제 ' + got);
}
function near(name, got, want, tol) {
  ok(name + ' (≈' + want + ')', Math.abs(got - want) <= (tol == null ? 0.01 : tol), '실제 ' + got);
}
function section(t) { console.log('\n── ' + t + ' ──'); }

/* ══════════ 통상임금 (근기법 시행령 6조) ══════════ */
section('통상임금·소정근로시간');
eq('월 통상임금 209만 ÷ 209h = 시급 1만', L.hourlyOrdinary(2090000, { monthlyStdHours: 209 }), 10000);
near('주40h → 월 소정근로시간 208.6h', L.monthlyStdHoursFrom(40), 208.6, 0.1);
eq('주40h 주휴 유급시간 = 8h', L.weeklyHolidayHours(40), 8);
eq('주20h 단시간 주휴 = 4h (비례)', L.weeklyHolidayHours(20), 4);
eq('주14h 초단시간 주휴 = 0 (근기법 18조3항)', L.weeklyHolidayHours(14), 0);

/* ══════════ 근태 집계 ══════════ */
section('근태 — 시간 세기');
eq('09:00~19:30 휴게 60분 = 9.5h', L.dayWorkedHours({ in: '09:00', out: '19:30', breakMin: 60 }), 9.5);
eq('18:00~02:00 야간(22~06) = 240분', L.nightMinutes(L.hm('18:00'), L.hm('02:00')), 240);
eq('09:00~18:00 야간 = 0분', L.nightMinutes(L.hm('09:00'), L.hm('18:00')), 0);
eq('2026-03-02는 월요일', L.dow('2026-03-02'), 1);
eq('주 시작(월요일) 계산', L.weekStart('2026-03-05'), '2026-03-02');

// 월~금 각 10시간 → 일연장 2h×5=10h. 소정내 40h라 주40h 초과는 없다(중복 금지)
const wk10 = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06']
  .map(d => ({ date: d, hours: 10 }));
const a1 = L.summarizeAttendance(wk10, {});
eq('일 8h 초과 연장 = 10h', a1.합계.연장, 10);
eq('연장 중복계산 없음(주40h 초과분 0)', a1.주별[0].주연장추가, 0);
eq('실근로 50h', a1.합계.실근로, 50);

// 월~토 각 7시간 = 42h → 일연장 0, 주40h 초과 2h만 연장
const wk7 = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07']
  .map(d => ({ date: d, hours: 7 }));
const a2 = L.summarizeAttendance(wk7, {});
eq('일연장 0 (하루 7h)', a2.주별[0].일연장, 0);
eq('주 40h 초과분 2h가 연장', a2.합계.연장, 2);

// 주휴 — 월~금 8h 개근
const wk8 = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06']
  .map(d => ({ date: d, hours: 8 }));
const a3 = L.summarizeAttendance(wk8, {});
eq('개근 시 주휴 8h 발생(근기법 55조)', a3.주휴시간, 8);
// 결근이 있으면 주휴 없음
const a4 = L.summarizeAttendance(wk8.slice(0, 4).concat([{ date: '2026-03-06', type: 'absent' }]), {});
eq('결근 있으면 주휴 0', a4.주휴시간, 0);
eq('결근 1일 집계', a4.합계.결근일수, 1);

// 휴일근로 (일요일 2026-03-01)
const a5 = L.summarizeAttendance([{ date: '2026-03-01', hours: 10 }], {});
eq('휴일 8h 이내 = 8h', a5.합계.휴일8이내, 8);
eq('휴일 8h 초과 = 2h', a5.합계.휴일8초과, 2);
eq('휴일근로는 연장에 넣지 않음(중복 금지)', a5.합계.연장, 0);

// 연장 주 12시간 한도(근기법 53조) — 막지 않고 알린다
const wk16 = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06']
  .map(d => ({ date: d, hours: 12 }));
const a6 = L.summarizeAttendance(wk16, {});
eq('연장 20h → 주 12h 한도 초과 경고', a6.연장한도초과주.length, 1);

/* ══════════ 법정수당 (근기법 56조) ══════════ */
section('법정수당 — 가산');
const al1 = L.statutoryAllowances(a1, 10000, {});
eq('연장 10h × 1.5 = 150,000', al1.연장수당, 150000);
const al2 = L.statutoryAllowances(a5, 10000, {});
eq('휴일 8h×1.5 + 2h×2.0 = 160,000', al2.휴일수당, 160000);
const alNight = L.statutoryAllowances({ 합계: { 야간: 4 }, 주휴시간: 0 }, 10000, {});
eq('야간 4h × 0.5(가산분) = 20,000', alNight.야간수당, 20000);
// 5인 미만은 가산 미적용(근기법 56조 적용 제외)
const al3 = L.statutoryAllowances(a1, 10000, { policy: { fiveOrMore: false } });
eq('5인 미만 연장 10h × 1.0 = 100,000', al3.연장수당, 100000);
eq('5인 미만 야간가산 0', L.statutoryAllowances({ 합계: { 야간: 4 } }, 10000, { policy: { fiveOrMore: false } }).야간수당, 0);
// 주휴수당은 월급제에 이미 포함 → 이중지급 금지
eq('월급제 주휴수당 0 (월급에 포함)', L.statutoryAllowances(a3, 10000, { payType: 'monthly' }).주휴수당, 0);
eq('시급제 주휴수당 8h = 80,000', L.statutoryAllowances(a3, 10000, { payType: 'hourly' }).주휴수당, 80000);

section('포괄임금 차액 · 최저임금');
const fx = L.checkFixedOT(100000, { 법정수당합계: 150000 });
eq('고정 연장수당 부족액 50,000', fx.부족액, 50000);
eq('부족 판정', fx.판정, 'short');
eq('충분하면 ok', L.checkFixedOT(200000, { 법정수당합계: 150000 }).판정, 'ok');
const mw = L.checkMinWage({ 산입임금: 1800000, 소정근로시간: 209, 주휴시간: 0, minWageHourly: 10320 });
eq('최저임금 위반 판정', mw.판정, 'violation');
eq('환산시급 8,612원', mw.환산시급, 8612);
eq('최저임금 충족 판정', L.checkMinWage({ 산입임금: 2200000, 소정근로시간: 209, minWageHourly: 10320 }).판정, 'ok');

/* ══════════ 연차 (근기법 60조) ══════════ */
section('연차 발생');
eq('1년 미만 5개월 개근 = 5일', L.accrueAnnual({ hireDate: '2026-01-01', asOf: '2026-06-01' }).발생일수, 5);
eq('1년 미만 한도 11일', L.accrueAnnual({ hireDate: '2025-01-01', asOf: '2025-12-25' }).발생일수, 11);
eq('1년차 = 15일', L.accrueAnnual({ hireDate: '2025-01-01', asOf: '2026-01-01' }).발생일수, 15);
eq('3년차 = 16일 (가산 1)', L.accrueAnnual({ hireDate: '2023-01-01', asOf: '2026-01-01' }).발생일수, 16);
eq('5년차 = 17일 (가산 2)', L.accrueAnnual({ hireDate: '2021-01-01', asOf: '2026-01-01' }).발생일수, 17);
eq('21년차 = 25일 (한도)', L.accrueAnnual({ hireDate: '2005-01-01', asOf: '2026-01-01' }).발생일수, 25);
eq('25년차도 25일 한도 유지', L.accrueAnnual({ hireDate: '2001-01-01', asOf: '2026-01-01' }).발생일수, 25);
eq('5인 미만 = 연차 0 (60조 적용 제외)',
  L.accrueAnnual({ hireDate: '2020-01-01', asOf: '2026-01-01', policy: { fiveOrMore: false } }).발생일수, 0);
eq('출근율 80% 미만 → 개근 월수만큼(8일)',
  L.accrueAnnual({ hireDate: '2020-01-01', asOf: '2026-01-01', attendanceRate: 0.7, perfectMonths: 8 }).발생일수, 8);
ok('회계연도 첫해 비례 발생 계산됨',
  L.accrueAnnualFiscalFirstYear('2026-07-01').발생일수 > 0 && L.accrueAnnualFiscalFirstYear('2026-07-01').발생일수 < 15,
  JSON.stringify(L.accrueAnnualFiscalFirstYear('2026-07-01')));

section('연차 대장·수당·촉진');
const lg = L.annualLedger({ 발생일수: 15, 이월일수: 3, 사용일수: 20 });
eq('잔여 -2일', lg.잔여일수, -2);
eq('초과사용 2일', lg.초과사용, 2);
ok('초과사용 경고 문구 있음', !!lg.경고);
const up = L.annualUnusedPay({ 미사용일수: 5, 시급: 10000 });
eq('연차수당 5일 × 8h × 1만 = 400,000', up.금액, 400000);
eq('촉진 적법 이행 → 수당 0 (61조)', L.annualUnusedPay({ 미사용일수: 5, 시급: 10000, 촉진적법: true }).금액, 0);
ok('촉진 미이행 → 지급의무 있음', L.annualUnusedPay({ 미사용일수: 5, 시급: 10000, 촉진적법: false }).지급의무 === true);
const ps = L.promotionSchedule('2026-12-31');
eq('1차 촉진 기한 = 소멸 6개월 전', ps['1차촉진기한'], '2026-06-30');
eq('2차 촉진 기한 = 소멸 2개월 전', ps['2차촉진기한'], '2026-10-31');
const ps1 = L.promotionSchedule('2026-12-31', 'under1');
eq('1년 미만은 3개월 전 1차', ps1['1차촉진기한'], '2026-09-30');
eq('1년 미만은 1개월 전 2차', ps1['2차촉진기한'], '2026-11-30');

section('휴가 종류·보상휴가');
ok('법정휴가 12종 이상 등재', L.LEAVE_KINDS.length >= 12, '실제 ' + L.LEAVE_KINDS.length);
eq('배우자 출산휴가 20일', L.leaveKind('spouse').days, 20);
eq('출산전후휴가 90일(다태아 120)', L.leaveKind('maternity').days, 90);
eq('육아휴직 무급(고용보험)', L.leaveKind('childcare').paid, false);
eq('가족돌봄휴가 10일', L.leaveKind('family').days, 10);
const cl = L.compLeaveHours({ 합계: { 연장: 3.5 } });
eq('보상휴가 연장 3.5h → 5.25h (57조)', cl.휴가시간, 5.25);

/* ══════════ 퇴직금 (퇴직급여법) ══════════ */
section('평균임금·퇴직금');
const aw = L.averageWage({ 기간임금총액: 9000000, 기간일수: 91, 통상일급: 100000 });
eq('평균임금 < 통상임금 → 통상임금 적용(근기법 2조2항)', aw.통상임금적용, true);
eq('일평균임금 = 통상일급 100,000', aw.일평균임금, 100000);
near('산정 평균임금 98,901', aw.산정평균임금, 98901.1, 0.2);
const aw2 = L.averageWage({ 기간임금총액: 12000000, 기간일수: 91, 통상일급: 100000, 연간상여: 4000000 });
ok('상여 3/12 산입됨', aw2.상여산입액 === 1000000, '실제 ' + aw2.상여산입액);
ok('평균임금이 통상임금보다 크면 그대로', aw2.통상임금적용 === false && aw2.일평균임금 > 100000);

const sv = L.severancePay({ 일평균임금: 100000, 입사일: '2024-01-01', 퇴사일: '2025-12-31' });
eq('재직일수 731일', sv.재직일수, 731);
eq('퇴직금 = 1일평균 × 30 × 731/365', sv.금액, 6008219);
eq('1년 미만 퇴직금 0', L.severancePay({ 일평균임금: 100000, 입사일: '2025-01-01', 퇴사일: '2025-12-30' }).금액, 0);
eq('주 15h 미만 퇴직금 대상 아님',
  L.severancePay({ 일평균임금: 100000, 재직일수: 800, 주소정근로시간: 10 }).지급의무, false);

section('퇴직연금·퇴직소득세');
const dc = L.dcContribution({ 연간임금총액: 36000000, 실제납입액: 2500000 });
eq('DC 최소부담금 = 연간/12 = 300만', dc.최소부담금, 3000000);
eq('DC 부족액 50만', dc.부족액, 500000);
eq('DC 부족 판정', dc.판정, 'short');
const rt = L.retirementIncomeTax({ 퇴직급여: 30000000, 근속년수: 10 });
eq('근속연수공제 10년 = 1,500만', rt.근속연수공제, 15000000);
eq('환산급여 1,800만', rt.환산급여, 18000000);
eq('환산급여공제 1,400만', rt.환산급여공제, 14000000);
eq('과세표준 400만', rt.과세표준, 4000000);
eq('퇴직소득세 200,000', rt.소득세, 200000);
eq('지방소득세 20,000', rt.지방소득세, 20000);
eq('기본세율 1,400만 이하 6%', L.basicTax(14000000), 840000);
eq('기본세율 5,000만 구간 누진공제', L.basicTax(50000000), 50000000 * 0.15 - 1260000);

/* ══════════ 4대보험·급여 통합 ══════════ */
section('4대보험·지방세');
eq('지방세 = 소득세×10% 10원절사', L.localIncomeTax(123456), 12340);
eq('지방세 0원 처리', L.localIncomeTax(0), 0);
const ins = L.insuranceEmployee({ 과세총액: 3000000 });
eq('국민연금 4.5%', ins.국민연금, 135000);
eq('요율계산 모드', ins.모드, '요율계산');
const ins2 = L.insuranceEmployee({ 과세총액: 3000000, 고지_국민연금: 120000, 고지_건강보험: 100000 });
eq('고지액이 계산값을 이긴다', ins2.국민연금, 120000);
eq('고지액 모드 표시', ins2.모드, '고지액');

section('월 급여 통합 — 지급 − 공제 = 실수령');
const mp = L.monthlyPayroll({
  기본급: 2090000, 근태기록: wk10, 소득세: 30000
});
eq('시급 1만 자동 산출', mp.시급, 10000);
eq('연장수당 150,000 반영', mp.지급.연장수당, 150000);
eq('지급총액 2,240,000', mp.지급.지급총액, 2240000);
ok('지급총액 − 공제총액 = 실수령 (검산)',
  mp.지급.지급총액 - mp.공제.공제총액 === mp.실수령,
  mp.지급.지급총액 + ' - ' + mp.공제.공제총액 + ' ≠ ' + mp.실수령);

/* 2026년 최저임금 10,320원 × 209h = 2,156,880원.
   ⚠ 기본급 209만원은 최저임금 **미달**이다 — 코어가 이것을 잡아내는지 본다.
     (설계할 때 209만/209h=시급1만 을 "정상"이라 착각하기 쉬운 지점) */
const mpUnder = L.monthlyPayroll({ 기본급: 2090000, 최저임금시급: 10320, 소득세: 0 });
ok('최저임금 검증 결과 포함', !!mpUnder.검증.최저임금);
eq('기본급 209만원 = 2026 최저임금 미달 적발', mpUnder.검증.최저임금.판정, 'violation');
const mpOk = L.monthlyPayroll({ 기본급: 2200000, 최저임금시급: 10320, 소득세: 30000 });
eq('기본급 220만원은 최저임금 충족', mpOk.검증.최저임금.판정, 'ok');
eq('충족이면 초록 신호', mpOk.검증.신호, 'green');
const mpBad = L.monthlyPayroll({ 기본급: 1500000, 최저임금시급: 10320, 소득세: 0 });
eq('최저임금 미달이면 빨강 신호', mpBad.검증.신호, 'red');
const mpNoTax = L.monthlyPayroll({ 기본급: 2200000, 최저임금시급: 10320 });
ok('소득세 표 없으면 조용히 0으로 두지 않고 표시', mpNoTax.검증.소득세미정 === true);
eq('소득세 미정이면 주황 신호', mpNoTax.검증.신호, 'orange');

console.log('\n════════════════════════════════');
console.log('  통과 ' + pass + ' · 실패 ' + fail);
console.log('════════════════════════════════');
process.exit(fail ? 1 : 0);
