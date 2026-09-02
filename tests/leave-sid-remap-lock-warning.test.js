/* 퇴사자 사번 T-정리 도구가 마감된 달을 건드릴 때 미리 알리는가 (대표 지시 2026-09-02)
 *
 * ■ 왜 이 검사가 있나
 *   convertRetiredSids()는 payroll_monthly·overtime_records·attendance_records
 *   를 dbSet 으로 통째로 다시 써서 사번을 재매핑한다 — 급여관리의
 *   마감잠금(isPayrollLocked)을 전혀 보지 않고 지나간다. 완전히 막지는
 *   않되(정당한 관리 작업이라 막으면 정작 필요한 정리를 못 함), 마감된
 *   달의 기록도 함께 바뀐다는 사실을 확인창 문구에 «미리» 보여주도록
 *   고쳤다.
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

function makeSandbox(store, lockedYms) {
  const confirms = [];
  const ctx = {
    dbGet: function (k, d) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : d; },
    dbSet: function (k, v) { store[k] = v; },
    isPayrollLocked: function (ym) { return (lockedYms || []).indexOf(ym) >= 0; },
    showToast: function () {},
    showConfirm: function (msg, opts) { confirms.push(msg); return Promise.resolve(false); },
    console: { log: function () {} },
    Object: Object, JSON: JSON, Promise: Promise, setTimeout: function () {},
  };
  vm.createContext(ctx);
  const fn = cutFn(SRC, 'function convertRetiredSids(){');
  vm.runInContext(fn + '\nvar __api = convertRetiredSids;', ctx);
  return { confirms, api: ctx.__api };
}

function baseStore() {
  return {
    user_accounts: [
      { sid: 'T-777', name: '퇴사자', status: 'retired', hireDate: '2020-01-01' },
      { sid: 'A-001', name: '재직자', status: 'active', hireDate: '2019-01-01' },
    ],
    finance_income: [],
    payroll_monthly: [{ id: 'p1', empSid: 'T-777', ym: '2026-03' }],
    overtime_records: [],
    attendance_records: [],
    companies: [], cases: [], consultings: [], funds: [], other_projects: [],
  };
}

test('★★ 마감된 달의 급여 기록이 섞이면 확인창 문구에 경고가 뜬다', () => {
  const { confirms, api } = makeSandbox(baseStore(), ['2026-03']);
  api();
  assert.strictEqual(confirms.length, 1, '확인창이 안 떴다');
  assert.ok(confirms[0].indexOf('마감') >= 0 && confirms[0].indexOf('2026-03') >= 0,
    '마감된 달(2026-03) 경고가 문구에 없다: ' + confirms[0]);
});

test('마감된 달이 없으면 경고 문구가 없다', () => {
  const { confirms, api } = makeSandbox(baseStore(), []);
  api();
  assert.strictEqual(confirms.length, 1);
  assert.ok(confirms[0].indexOf('마감') < 0, '안 잠겼는데 마감 경고가 떴다: ' + confirms[0]);
});

test('★★ 재매핑 대상이 아닌 사번의 마감 기록은 경고에 안 들어간다', () => {
  const store = baseStore();
  store.payroll_monthly.push({ id: 'p2', empSid: 'A-001', ym: '2026-04' });
  const { confirms, api } = makeSandbox(store, ['2026-03', '2026-04']);
  api();
  assert.ok(confirms[0].indexOf('2026-03') >= 0, '재매핑 대상(T-777)의 잠긴 달은 있어야 한다');
  assert.ok(confirms[0].indexOf('2026-04') < 0, '재직자(A-001, 재매핑 대상 아님)의 잠긴 달까지 섞였다: ' + confirms[0]);
});
