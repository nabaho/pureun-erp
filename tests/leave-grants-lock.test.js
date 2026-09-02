/* 연차 부여일수(leave_grants) 수정도 마감된 해는 막는다 (대표 지시 2026-09-02)
 *
 * ■ 왜 이 검사가 있나
 *   근태·휴가관리 전면 분석 결과, ATTEND_LOCK_TABLES(attendance_records·
 *   overtime_records·comp_leave_records)만 마감잠금을 지키고, 연차
 *   부여일수 오버라이드(leave_grants)는 dbSet 으로 곧장 저장되어 마감과
 *   «무관하게» 언제든 바뀔 수 있었다. 연차 일수는 퇴직정산·연차수당과
 *   이어지는 돈 값이라 근태의 초과근로와 같은 원칙(마감된 달/해는 잠금)
 *   을 적용했다. 단위가 「달」이 아니라 「해」라서 그 해 12월이 잠겼는지로
 *   판단한다.
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

function makeSandbox(lockedYms, initialGrants) {
  const store = { leave_grants: initialGrants || {} };
  const toasts = [];
  let confirmAnswer = true;
  const ctx = {
    modalSid: 'A-002', selSid: 'A-002', selYear: '2026',
    mForm: { total: 16, carryOver: 2 },
    setModalSid: function () {},
    dbGet: function (k, d) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : d; },
    dbSet: function (k, v) { store[k] = v; },
    isPayrollLocked: function (ym) { return (lockedYms || []).indexOf(ym) >= 0; },
    showToast: function (msg) { toasts.push(msg); },
    popConfirm: function () { return Promise.resolve(confirmAnswer); },
    parseInt: parseInt, Object: Object, Promise: Promise, console: console,
  };
  vm.createContext(ctx);
  const saveOverride = cutFn(SRC, 'function saveOverride(){');
  const resetOverride = cutFn(SRC, 'async function resetOverride(){');
  vm.runInContext(
    saveOverride + '\n' + resetOverride +
    '\nvar __api = { saveOverride:saveOverride, resetOverride:resetOverride };',
    ctx
  );
  return { store, toasts, api: ctx.__api };
}

test('★★ 마감된 해(12월 잠김)에는 부여일수를 저장하지 못한다', () => {
  const { store, toasts, api } = makeSandbox(['2026-12']);
  api.saveOverride();
  assert.strictEqual(Object.keys(store.leave_grants).length, 0, '잠긴 해인데 저장돼 버렸다');
  assert.ok(toasts.some((t) => t.indexOf('마감') >= 0), '잠김 안내 토스트가 없다');
});

test('잠기지 않은 해는 정상 저장된다', () => {
  const { store, api } = makeSandbox([]);
  api.saveOverride();
  assert.strictEqual(store.leave_grants['A-002']['2026'].total, 16);
});

test('★★ 마감된 해는 되돌리기(resetOverride)도 막는다', async () => {
  const { store, toasts, api } = makeSandbox(['2026-12'], { 'A-002': { '2026': { total: 20, carryOver: 0 } } });
  await api.resetOverride();
  assert.ok(store.leave_grants['A-002']['2026'], '잠긴 해인데 지워져 버렸다');
  assert.ok(toasts.some((t) => t.indexOf('마감') >= 0), '잠김 안내 토스트가 없다');
});
