/* 휴가관리 잔여연차 계산이 근태관리와 «같은 잣대」를 쓰는가 (대표 지시 2026-09-02)
 *
 * ■ 왜 이 검사가 있나
 *   근태·휴가관리 전면 분석 결과, 시간연차를 「하루」로 환산할 때
 *   휴가관리(LeaveManagement.calcUsed)는 8시간 고정으로 나누는데,
 *   근태관리(전역 getLeaveRemain)는 직원별 소정근로시간(scheduledHours)
 *   으로 나눴다. 라이브 자료에서 소정근로시간이 8시간이 아닌 직원
 *   (A-002 신욱임, 4시간)이 실제로 있어, 두 화면 숫자가 어긋날 수 있는
 *   상태였다. calcUsed 도 getLeaveRemain 과 같은 잣대(scheduledHours||8)
 *   를 쓰도록 통일했다.
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

/* calcUsed는 LeaveManagement 컴포넌트 안 클로저 함수라 attendance·users를
   자유변수로 참조한다 — vm 컨텍스트 전역에 그대로 얹어서 실제로 돌려 본다. */
function runCalcUsed(attendance, users, sid, year) {
  const ctx = { attendance, users, parseFloat, console };
  vm.createContext(ctx);
  const calcUsed = cutFn(SRC, 'function calcUsed(sid, year){');
  vm.runInContext(calcUsed + '\nvar __r = calcUsed(' + JSON.stringify(sid) + ',' + JSON.stringify(year) + ');', ctx);
  return ctx.__r;
}

test('★★ 소정근로시간 4시간 직원의 시간연차 4시간은 1일로 계산된다 (8시간 고정 아님)', () => {
  const users = [{ sid: 'A-002', name: '신욱임', scheduledHours: 4 }];
  const attendance = [{ sid: 'A-002', date: '2026-05-10', type: 'leave-hour', hours: 4 }];
  const r = runCalcUsed(attendance, users, 'A-002', '2026');
  assert.strictEqual(r.used, 1, '4시간 소정근로자의 4시간 연차는 1일이어야 한다 (8시간 고정 계산이면 0.5)');
});

test('소정근로시간 정보가 없는 직원은 기존대로 8시간 기준', () => {
  const users = [{ sid: 'A-777', name: '보통직원' }];
  const attendance = [{ sid: 'A-777', date: '2026-05-10', type: 'leave-hour', hours: 4 }];
  const r = runCalcUsed(attendance, users, 'A-777', '2026');
  assert.strictEqual(r.used, 0.5, '기본값은 여전히 8시간 기준(4/8=0.5)이어야 한다');
});

test('연차·반차 집계는 그대로 (시간연차 없는 경우 영향 없음)', () => {
  const users = [{ sid: 'A-002', name: '신욱임', scheduledHours: 4 }];
  const attendance = [
    { sid: 'A-002', date: '2026-03-01', type: 'leave' },
    { sid: 'A-002', date: '2026-03-02', type: 'halfday-am' },
  ];
  const r = runCalcUsed(attendance, users, 'A-002', '2026');
  assert.strictEqual(r.used, 1.5, '연차 1 + 반차 0.5 = 1.5, 소정근로시간과 무관');
});
