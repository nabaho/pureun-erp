/* 근태관리 「이달 초과근로」가 실제 급여 계산에 반영되는가 (대표 지시 2026-09-02)
 *
 * ■ 왜 이 검사가 있나
 *   대표: 「근태관리를 어떻게 자동화 해야되나 … 정확하게 분석해서 문제점
 *          모두 찾아달라」. 정밀 분석(세 조사자) 결과, 근태관리 화면의
 *   「이달 초과근로」 입력은 payroll_monthly 의 «최상위» overtimeHours 등에
 *   저장하는데, 실제 급여명세서 금액을 계산하는 calcLegalAllowances() 는
 *   rec.legalAllowances.overtimeHours 라는 «중첩된» 자리만 읽었다.
 *   화면엔 「→ 월별급여 자동반영」이라 적혀 있었지만, 실제로는 급여 계산에
 *   0으로 들어갔다 — 담당자가 급여관리에서 같은 숫자를 «또» 입력해야 했다.
 *
 * ★★ 게다가 레코드를 찾는 열쇠도 서로 달랐다 — 급여 쪽(getRec·updateLegal)은
 *   payroll_monthly 를 «empSid» 로만 찾는데, 근태관리는 새 레코드를 «sid» 로
 *   만들었다. 레코드가 아직 없을 때 근태관리를 먼저 쓰면, 급여 화면이 못
 *   찾는 고아 레코드가 생기고 나중에 레코드가 두 개(중복) 만들어질 뻔했다.
 *
 * ⚠ 2026-09-02 라이브 자료 확인: 지금까지 이 입력칸을 실전에서 쓴 적이
 *   없어(옮길 옛 자료 없음), 마이그레이션 없이 필드만 통일하면 된다.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const R = path.join(__dirname, '..');
const ERP = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const SRC = bare(ERP);
function cutFn(src, head) {
  const i = src.indexOf(head);
  assert.ok(i >= 0, '못 찾음: ' + head);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('닫는 괄호 없음: ' + head);
}

/* ── 실제로 돌려 본다: setOT/getOT/syncOTToPayroll을 모래상자에서 실행 ── */
function makeSandbox(initialPayroll) {
  const store = { payroll_monthly: initialPayroll || [], overtime_records: [], locked_payroll_months: [] };
  const ctx = {
    selSid: 'A-777', selYM: '2026-09',
    dbGet: function (k, d) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : d; },
    dbSet: function (k, v) { store[k] = v; },
    dbUpsert: function (k, item) {
      const arr = store[k] || (store[k] = []);
      const i = arr.findIndex((x) => x.id === item.id);
      if (i >= 0) arr[i] = item; else arr.push(item);
      return true;
    },
    dbRemove: function (k, id) { store[k] = (store[k] || []).filter((x) => x.id !== id); },
    isPayrollLocked: function (ym) { return (store.locked_payroll_months || []).indexOf(ym) >= 0; },
    showToast: function () {},
    Date: Date, Math: Math, parseFloat: parseFloat, Object: Object, console: console,
  };
  vm.createContext(ctx);
  const getOT = cutFn(SRC, '  function getOT(field){');
  const getOTRecords = cutFn(SRC, '  function getOTRecords(){');
  const syncOTToPayroll = cutFn(SRC, '  function syncOTToPayroll(){');
  const setOT = cutFn(SRC, '  function setOT(field, val){');
  vm.runInContext(
    getOT + '\n' + getOTRecords + '\n' + syncOTToPayroll + '\n' + setOT +
    '\nvar __api = { getOT:getOT, getOTRecords:getOTRecords, syncOTToPayroll:syncOTToPayroll, setOT:setOT };',
    ctx
  );
  return { ctx, store, api: ctx.__api };
}

test('★★ setOT 가 급여 계산이 읽는 legalAllowances 에 쓴다 (평면 필드가 아니라)', () => {
  const { store, api } = makeSandbox([]);
  api.setOT('overtimeHours', 5);
  assert.strictEqual(store.payroll_monthly.length, 1, '레코드가 안 생겼다');
  const rec = store.payroll_monthly[0];
  assert.strictEqual(rec.legalAllowances && rec.legalAllowances.overtimeHours, 5,
    '★★ legalAllowances.overtimeHours 에 안 들어갔다 — 급여 계산이 이 값을 못 읽는다');
  assert.strictEqual(rec.overtimeHours, undefined,
    '★ 옛 최상위 필드에도 남아 있다 — 두 자리에 값이 갈라지면 나중에 또 헷갈린다');
});

test('★★ 새 레코드를 만들 때 empSid 로 만든다 — sid 로 만들면 급여 화면이 못 찾는다', () => {
  const { store, api } = makeSandbox([]);
  api.setOT('nightHours', 2);
  const rec = store.payroll_monthly[0];
  assert.strictEqual(rec.empSid, 'A-777', '★★ empSid 가 없다 — 급여관리 화면(getRec)이 empSid 로만 찾으므로 이 레코드를 영영 못 본다');
});

test('★★ 급여관리 화면이 이미 만들어 둔 레코드(legalAllowances 안에 다른 값 있음)를 «병합»한다', () => {
  const existing = [{ id:'pay-A-777-2026-09', empSid:'A-777', ym:'2026-09', status:'draft',
    baseSalary:3000000, legalAllowances:{ weeklyHolidayPay:50000, autoWeeklyHoliday:true } }];
  const { store, api } = makeSandbox(existing);
  api.setOT('overtimeHours', 3);
  const rec = store.payroll_monthly.find((r) => r.empSid === 'A-777');
  assert.strictEqual(rec.legalAllowances.weeklyHolidayPay, 50000,
    '★★ 급여관리에서 이미 넣어 둔 다른 수당(주휴수당 등)을 덮어썼다 — 통째로 덮으면 안 되고 병합해야 한다');
  assert.strictEqual(rec.legalAllowances.overtimeHours, 3);
  assert.strictEqual(rec.baseSalary, 3000000, '★ 기본급 등 다른 필드를 잃어버렸다');
});

test('★★ getOT 가 legalAllowances 에서 읽는다 — setOT 로 쓴 값을 그대로 되읽어야 한다', () => {
  const { api } = makeSandbox([]);
  api.setOT('holidayHours', 4);
  assert.strictEqual(api.getOT('holidayHours'), 4, '★★ 쓴 값을 못 읽는다 — 화면에 0으로 보인다');
});

test('★★ 일자별 기록(overtime_records) 합계도 legalAllowances 로 동기화된다', () => {
  const { store, api } = makeSandbox([]);
  store.overtime_records.push({ id:'ot-1', sid:'A-777', date:'2026-09-05', kind:'overtime', hours:2 });
  store.overtime_records.push({ id:'ot-2', sid:'A-777', date:'2026-09-12', kind:'night', hours:1.5 });
  api.syncOTToPayroll();
  const rec = store.payroll_monthly.find((r) => r.empSid === 'A-777');
  assert.ok(rec, '레코드가 안 생겼다');
  assert.strictEqual(rec.legalAllowances.overtimeHours, 2);
  assert.strictEqual(rec.legalAllowances.nightHours, 1.5);
});

test('★★ 마감된 달은 근태관리에서도 건드릴 수 없다 — 급여관리 직접수정과 같은 보호를 받는다', () => {
  const { store, api } = makeSandbox([{ id:'pay-A-777-2026-09', empSid:'A-777', ym:'2026-09', status:'closed', legalAllowances:{overtimeHours:10} }]);
  store.locked_payroll_months.push('2026-09');
  api.setOT('overtimeHours', 99);
  const rec = store.payroll_monthly.find((r) => r.empSid === 'A-777');
  assert.strictEqual(rec.legalAllowances.overtimeHours, 10,
    '★★ 마감된 달인데도 근태관리를 거치면 급여 숫자가 바뀐다 — 급여관리 화면의 잠금을 우회하는 구멍이다');
});

test('★★ syncOTToPayroll 도 마감된 달에는 저장하지 않는다', () => {
  const { store, api } = makeSandbox([{ id:'pay-A-777-2026-09', empSid:'A-777', ym:'2026-09', status:'closed', legalAllowances:{overtimeHours:10} }]);
  store.locked_payroll_months.push('2026-09');
  store.overtime_records.push({ id:'ot-1', sid:'A-777', date:'2026-09-05', kind:'overtime', hours:99 });
  api.syncOTToPayroll();
  const rec = store.payroll_monthly.find((r) => r.empSid === 'A-777');
  assert.strictEqual(rec.legalAllowances.overtimeHours, 10,
    '★★ 일자별 기록을 추가/삭제하는 것만으로도 마감된 달의 급여가 바뀐다');
});

/* ── 급여 계산이 실제로 이 자리를 읽는지도 함께 잠근다 ── */
test('★ calcLegalAllowances 는 rec.legalAllowances 를 읽는다 — 그 짝이 맞아야 이 고침이 뜻이 있다', () => {
  const fn = cutFn(SRC, 'function calcLegalAllowances(rec, ordinaryMonthly){');
  assert.match(fn, /var la = rec\.legalAllowances \|\| \{\};/,
    '★ 급여 계산 함수의 자리가 바뀌면, 근태관리를 legalAllowances 로 맞춘 의미가 없어진다');
});

test('★ 급여관리 화면(getRec)도 empSid 로 찾는다 — 그 짝이 맞아야 한다', () => {
  const fn = cutFn(SRC, '  function getRec(sid){');
  assert.match(fn, /r\.empSid===sid && r\.ym===props\.selYM/,
    '★ 급여관리 쪽 열쇠가 바뀌면, 근태관리를 empSid 로 맞춘 의미가 없어진다');
});
