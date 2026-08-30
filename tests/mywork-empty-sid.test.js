'use strict';
/* 「나의 업무」에 남의 업무가 들어오지 않는다 — 2026-08-30 대표 신고

   김동현 님 「나의 업무」에 «남의 업무가 통째로» 들어와 있었다(82건).
   그리고 대표 말: 「본인이 로그인했음을 전혀 찾을 수 없다, 확인이 어렵다」.

   ★ 두 신고의 뿌리는 «하나»다 — 로그인한 사람을 못 알아본 것.
     CURRENT_USER 는 화면이 뜨는 그 순간 한 번만 정해지는데(buildCurrentUser),
     SSO 로 들어오면 그때는 직원 명단이 아직 안 내려와 있어 «아무도 아님»이 된다.
     그러면 sid 가 '' 이고, 담당이 안 정해진 업무는 managerMain 도 '' 이라
     ''==='' 가 «참»이 되어 담당 없는 업무가 전부 「내 것」이 됐다.
     이름도 비어 있으니 화면에는 「 · 담당자 · 2026-08 기준」만 떴다.

   ⚠ 이 검사는 «빈 값끼리 견주지 않는다»를 지킨다. 사람을 다시 알아보게 하는
     일(CURRENT_USER 다시 계산)은 권한까지 걸린 문제라 따로 다룬다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn.js');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/* 「내 것인가」를 가리는 함수를 «실제로 돌려» 본다 — 글자만 보면 못 잡는다. */
function myItemWith(sid) {
  const at = app.indexOf('function _myItem(item){');
  assert.ok(at > 0, '_myItem 을 찾지 못했습니다');
  let d = 0, j = at;
  for (;; j++) { if (app[j] === '{') d++; else if (app[j] === '}') { d--; if (!d) { j++; break; } } }
  const ctx = { sid: sid, _meUser: null, name: '' };
  vm.createContext(ctx);
  vm.runInContext(app.slice(at, j) + '\nthis.f = _myItem;', ctx);
  return ctx.f;
}

const NOBODY = { id: 'x', managerMain: '', managerSubs: [] };          // 담당 없는 업무
const UNSET = { id: 'y', managerSubs: [] };                            // 칸 자체가 없는 옛 자료
const MINE = { id: 'm', managerMain: 'S7', managerSubs: [] };
const SUB = { id: 's', managerMain: 'S9', managerSubs: ['S7'] };
const OTHER = { id: 'o', managerMain: 'S9', managerSubs: [] };

test('★★ 누구인지 모르면(sid 빔) 「내 것」이 하나도 없다 — 82건이 이렇게 들어왔다', () => {
  const f = myItemWith('');
  assert.equal(f(NOBODY), false, '★ 담당 없는 업무가 「내 것」이 됩니다');
  assert.equal(f(UNSET), false, '★ 담당 칸이 없는 옛 업무가 「내 것」이 됩니다');
  assert.equal(f(MINE), false);
  assert.equal(f(OTHER), false);
});

test('sid 가 undefined·null 이어도 마찬가지', () => {
  assert.equal(myItemWith(undefined)(NOBODY), false);
  assert.equal(myItemWith(null)(UNSET), false);
});

test('★ 제대로 알아봤으면 «내 것만» 나온다 — 막느라 다 지워 버리면 안 된다', () => {
  const f = myItemWith('S7');
  assert.equal(f(MINE), true, '★ 주담당인 내 업무가 안 나옵니다');
  assert.equal(f(SUB), true, '★ 부담당인 내 업무가 안 나옵니다');
  assert.equal(f(OTHER), false, '남의 업무가 나옵니다');
  assert.equal(f(NOBODY), false, '담당 없는 업무가 나옵니다');
  assert.equal(f(UNSET), false);
});

test('★ 대시보드 사건 셈도 같은 구멍이 없다 — 한쪽만 고치면 숫자가 어긋난다', () => {
  /* ⚠ 고정 폭으로 자르지 않는다 — 괄호를 세어 «함수 끝까지» 본다.
       (tests/test-cut-truncation.test.js 가 이 규칙을 기계로 지킨다) */
  const fn = cutFn(app, 'var myCases = allCases.filter(function(c){\n    if(isItemClosed(c)) return false;');
  assert.match(bare(fn), /if\(!sid\) return false;/,
    '★ 누구인지 몰라도 담당 없는 사건을 세고 있습니다');
});

test('★ 직원별 집계(isAssigned)도 빈 값끼리 안 견준다', () => {
  const fn = cutFn(app, 'function isAssigned(');
  assert.match(bare(fn), /if\(!S\) return false;/,
    '★ 사번이 빈 직원에게 담당 없는 업무가 전부 붙습니다');
});

/* ══════ 「누구인지 모른다」를 사람에게 알린다 ══════ */

test('★★ 못 알아봤으면 «빈 목록»이 아니라 까닭을 보여 준다', () => {
  /* 그냥 0건으로 두면 「내 업무가 없네」로 읽힌다 — 대표는 그래서 확인을 못 했다. */
  assert.match(app, /누구로 로그인했는지 확인되지 않았습니다/,
    '★ 못 알아봤다는 말이 화면에 없습니다');
  assert.match(app, /!sid && h\('div'/, '★ 그 띠를 그리는 자리가 없습니다');
  assert.match(app, /새로고침/, '★ 무엇을 하면 되는지 안 알려 줍니다');
});

test('★ 이름 자리가 텅 비지 않는다 — 「 · 담당자 · 2026-08 기준」만 떴었다', () => {
  assert.match(app, /name \|\| '⚠ 로그인한 사람을 못 알아봤습니다'/,
    '★ 이름이 비면 앞이 텅 빈 줄이 됩니다');
});

test('제대로 알아본 사람에게는 그 띠가 안 뜬다 — 늘 떠 있으면 아무도 안 읽는다', () => {
  /* !sid 로 걸었으므로 sid 가 있으면 안 뜬다. 조건이 뒤집히지 않았는지만 본다.
     ⚠ 「sid &&」 로만 찾으면 «!sid &&» 안에서도 걸려 늘 실패한다 — 처음에 그랬다.
       앞 글자가 ! 가 «아닌» 경우만 잡는다. */
  assert.ok(!/[^!]sid && h\('div', \{ style:\{ background:'#fffbeb'/.test(app),
    '★ 조건이 뒤집혀 늘 뜹니다');
  assert.match(app, /!sid && h\('div', \{ style:\{ background:'#fffbeb'/,
    '★ 못 알아봤을 때만 뜨는 조건이 사라졌습니다');
});
