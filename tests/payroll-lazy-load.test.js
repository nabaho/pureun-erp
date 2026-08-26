'use strict';
/* 급여관리 — 사업장별로 나눠 읽기 (대표 지시 2026-08-17 「①나머지 사업장 올리기」)
   실행: node --test tests/*.test.js

   ⚠ 왜 나눴나: 앱이 payroll_os **전체**를 한 번에 읽고 같은 자리에 구독까지 걸었다.
     파일럿 3곳(342KB)일 때는 티가 안 났지만 70곳이면 7MB다 — 열 때마다 14MB,
     누가 확정을 한 번 누를 때마다 **열려 있는 모든 사람에게 7MB**. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(R, 'payroll-os.html'), 'utf8');

function cut(name) {
  const m = html.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 함수를 찾을 수 없습니다');
  return m[0];
}

/* ══════ 열 때 무엇을 받나 ══════ */

/* ⚠ 이 검사가 이 일의 전부다 — 되돌아가면 70곳이 올라간 순간 앱을 못 쓴다. */
test('★ 열 때 payroll_os 전체를 읽지 않는다', () => {
  const a = cut('afterLogin');
  assert.equal(/ref\(ROOT\)\.once/.test(a), false,
    '★ 전체를 한 번에 읽습니다 — 70곳이면 7MB입니다');
  assert.equal(/ref\(ROOT\)\.on\(/.test(a), false,
    '★ 전체에 구독을 걸면 누가 확정할 때마다 모두에게 7MB가 갑니다');
});

test('★ 열 때는 얇은 것만 받는다 — 목록·설정카드·확정잠금', () => {
  const a = cut('afterLogin');
  ['/site_cards', '/payroll_locked', '/payroll/index'].forEach(p =>
    assert.ok(a.indexOf(p) >= 0, p + ' 를 안 읽습니다'));
  assert.equal(/ROOT\+'\/payroll\/emp'/.test(a), false,
    '★ 직원 표를 열 때 받으면 나눈 뜻이 없습니다');
});

/* 여럿이 동시에 확정할 때 서로 보이려면 그 칸 하나면 되고, 아주 얇다. */
test('★ 구독은 확정잠금에만 건다', () => {
  const a = cut('afterLogin');
  const ons = a.match(/ref\([^)]*\)\.on\(/g) || [];
  assert.equal(ons.length, 1, '구독이 하나가 아닙니다: ' + ons.join(', '));
  assert.match(a, /ROOT\+'\/payroll_locked'\)\.on\(/);
});

/* 새 앱을 올린 순간부터 데이터를 다시 올리기 전까지 화면이 통째로 비면 안 된다. */
test('★ 옛 모양(직원 표가 안에 든 것)도 그대로 읽는다', () => {
  assert.match(cut('afterLogin'), /payroll\/sites/, '옛 모양을 안 읽으면 올리기 전까지 화면이 빕니다');
  assert.match(html, /function payRecs\(site\)\{[^}]*payOld/, '옛 모양을 꺼내 쓰는 길이 없습니다');
});

/* ══════ 직원 표는 그 달을 열 때만 ══════ */

test('★ 직원 표는 그 줄만 받는다', () => {
  const e = cut('ensureEmps');
  assert.match(e, /ROOT\+'\/payroll\/emp\/'\+rec\.id/, '줄 하나만 받아야 합니다');
  assert.match(e, /empLoading\[rec\.id\]/, '두 번 부르면 화면이 깜빡이고 요금만 늡니다');
});

/* ⚠ 빈 표는 「직원이 없다」로 읽혀 명세서가 0명으로 나간다. */
test('★ 직원 표를 못 받으면 빈 표로 두지 않는다', () => {
  const e = cut('ensureEmps');
  const cat = e.slice(e.indexOf('catch'));
  assert.equal(/empBox\[rec\.id\]\s*=\s*\[\]/.test(cat), false,
    '★ 못 받았는데 빈 표를 넣으면 명세서가 0명으로 나갑니다');
});

test('★ 직원 표가 아직 없으면 미리 세어 둔 신호를 쓴다', () => {
  const f = cut('effSig');
  assert.match(f, /표시신호/, '★ 없으면 모든 줄이 「데이터부족」 회색으로 뜹니다');
  assert.match(f, /empsOf\(r\)/, '표를 받은 뒤에는 다시 세야 합니다');
});

/* ══════ 신고는 다르다 ══════ */

/* 신고는 여러 사업장·여러 달의 직원 표를 한꺼번에 본다(취득·상실·퇴직정산·연차).
   그래서 그 화면에 들어갈 때만 통째로 받는다 — 급여 처리는 그대로 가볍다. */
test('★ 신고 화면에서만 직원 표를 통째로 받는다', () => {
  assert.match(cut('ensureAllEmps'), /ROOT\+'\/payroll\/emp'/);
  assert.match(cut('screenReport'), /ensureAllEmps\(\)/, '신고가 직원 표 없이 세면 0건이 됩니다');
  assert.match(cut('screenReport'), /allEmpsState!=='done'/, '다 받기 전에 세면 숫자가 틀립니다');
  /* 급여 처리는 통째로 받으면 안 된다 */
  assert.equal(/ensureAllEmps\(\)/.test(cut('screenPayroll')), false,
    '★ 급여 처리에서 통째로 받으면 나눈 뜻이 없습니다');
});

/* 신고 계산 코드를 손대면 취득·상실·퇴직금 셈이 조용히 달라질 수 있다. */
test('★ 신고 계산에는 옛 모양 그대로 넘긴다 — 계산 코드를 안 건드린다', () => {
  const f = cut('payForReport');
  assert.match(f, /sites:sites/, '옛 모양으로 감싸지 않으면 신고 코드를 다 고쳐야 합니다');
  assert.match(f, /o\.직원=empsOf\(r\)/);
});

/* ══════ 올리기 ══════ */

/* ⚠ 확정 열쇠는 「사업장|시트」다. 이름이 갈리면 확정이 조용히 풀린다. */
test('★ 올릴 때 확정 표시를 새 이름으로 옮긴다', () => {
  const f = cut('relockFor');
  assert.match(f, /moved/, '몇 건을 옮겼는지 세지 않습니다');
  assert.match(f, /lost/, '갈 곳을 못 찾은 것을 안 알립니다');
});

/* 못 찾은 것을 버리면 확정이 사라진다 — 남겨 두면 사람이 눈으로 찾을 수 있다. */
test('★ 갈 곳을 못 찾은 확정은 버리지 않고 그대로 둔다', () => {
  const f = cut('relockFor');
  const tail = f.slice(f.indexOf('else'));
  assert.match(tail, /out\[k\]=locked\[k\]/, '★ 못 찾았다고 지우면 확정이 사라집니다');
});

/* ⚠ 목록을 먼저 올리면, 직원 표가 아직 안 올라간 상태로 화면이 새 것을 가리킨다. */
test('★ 목록은 맨 마지막에 올린다 — 끊겨도 반쯤 들어간 것을 안 보여 준다', () => {
  const f = cut('importPayroll');
  const emp = f.indexOf("/payroll/emp");
  const idx = f.indexOf("/payroll/index");
  assert.ok(emp >= 0 && idx >= 0, '나눠 올리지 않습니다');
  assert.ok(emp < idx, '★ 목록을 먼저 올리면 직원 표 없는 화면이 뜹니다');
});

test('★ 직원 표는 나눠 올린다 — 7MB 한 방으로 쓰지 않는다', () => {
  const f = cut('importPayroll');
  assert.match(f, /update\(part\)/, '묶음으로 나눠 올려야 합니다');
  assert.match(f, /올리는 중/, '오래 걸리는데 아무 말이 없으면 멈춘 줄 압니다');
});

test('옛 모양 파일도 그대로 받는다 — 되돌릴 길을 막지 않는다', () => {
  assert.match(cut('importPayroll'), /raw\.sites&&!raw\.index/);
});

/* ══════ 화면이 옛 모양을 직접 뒤지지 않는다 ══════ */

/* 한 군데라도 남으면 그 화면만 빈다 — 가장 찾기 어려운 종류의 고장이다. */
test('★ 화면 어디에서도 payroll 을 통째로 꺼내 쓰지 않는다', () => {
  assert.equal(/dbGet\('payroll'/.test(html), false,
    '★ 통째로 꺼내 쓰는 곳이 남아 있습니다 — 그 화면만 빈 채로 뜹니다');
});
