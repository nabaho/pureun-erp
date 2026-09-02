/* 휴가관리 «합계» 줄이 4줄로 쪼개져 보이던 것 (대표 스크린샷 2026-09-02)
 *
 * ■ 왜 이 검사가 있나
 *   직원별 연차 현황 표 맨 아래 «합계» 줄의 첫 칸은 '합계' + '재직 11명' 처럼
 *   글자 길이가 이름 칸보다 길다. 이름 칸 자체는 폭이 넓지 않아(짧은 이름
 *   기준으로 자리가 잡힘) 줄바꿈이 걸리면, 한글은 공백 없이도 숫자와
 *   글자 사이에서 쪼개질 수 있어(예: «11명» → «11»/«명») 넉 줄까지
 *   갈라져 보였다. 이 칸만은 줄바꿈을 막아야 한다 — 「표 한 칸은 한 줄」
 *   원칙(CLAUDE.md).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');
const lm = cutFn(SRC, 'function LeaveManagement()');

test('★★ 「합계」 줄의 첫 칸은 줄바꿈이 막혀 있다', () => {
  const i = lm.indexOf("'합계', h('span'");
  assert.ok(i >= 0, '합계 줄 표시를 못 찾음 — LeaveManagement 구조가 바뀌었는지 확인');
  const tdOpen = lm.lastIndexOf("h('td',", i);
  const cellSrc = lm.slice(tdOpen, i);
  assert.match(cellSrc, /whiteSpace:'nowrap'/,
    '이 칸에 줄바꿈 금지가 없으면 좁은 화면에서 「합계/재직/11/명」처럼 넉 줄로 쪼개진다');
});
