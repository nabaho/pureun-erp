'use strict';
// 「내 업무」는 내 것만 — node --test tests/my-is-mine.test.js
//
// 2026-09-05 대표 보고: 사무장(A-001)으로 들어갔는데 「내 업무」 고르개로
// 박한별 노무사의 업무 59건을 열 수 있었고, 「내 현장 방문」도 그 사람 것이 떴다.
// 게다가 그 화면에서 «기록까지» 쓸 수 있었다(「열람 중 · 기록하면 작성자는 최기운」).
//
// 무엇이 잘못인가
//   ① 「내 업무」라는 이름이 거짓이 된다.
//   ② 남의 업무 기록에 다른 사람이 쓴 줄이 끼어든다 — 나중에 누가 한 일인지 흐려진다.
//
// 정리한 것
//   남의 업무를 보는 길은 「팀 전체」 하나뿐이다. 거기서는 «읽기만» 한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const W = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8').replace(/\r\n/g, '\n');

function grab(name){
  const i = W.indexOf('function ' + name + '(');
  assert.ok(i >= 0, '못 찾음: ' + name);
  let d = 0, j = i;
  for(;;j++){ if(W[j] === '{') d++; else if(W[j] === '}'){ d--; if(!d){ j++; break; } } }
  return W.slice(i, j);
}

/* ══════════════════════════════════════════════
   ① 보는 사람은 언제나 로그인 본인
   ══════════════════════════════════════════════ */
function box(S){
  const b = { S: S };
  vm.createContext(b);
  vm.runInContext(grab('viewer') + '\n' + grab('viewingSelf')
    + '\nthis.v=viewer(); this.self=viewingSelf();', b);
  return b;
}

test('★ viewer() 는 로그인 본인을 돌려준다', () => {
  const b = box({ me:{ sid:'A-001', name:'최기운' }, vsid:'P-003', vname:'박한별' });
  assert.equal(b.v.sid, 'A-001');
  assert.equal(b.v.name, '최기운');
});

test('★ S.vsid 에 남의 사번이 들어 있어도 따라가지 않는다', () => {
  // 옛 값이 어딘가에 남아 있어도 «본인» 이 이긴다
  const b = box({ me:{ sid:'A-001', name:'최기운' }, vsid:'P-003', vname:'박한별' });
  assert.notEqual(b.v.sid, 'P-003');
  assert.notEqual(b.v.name, '박한별');
});

test('로그인 정보가 아직 없으면 빈손 — 남의 것으로 넘어가지 않는다', () => {
  const b = box({ vsid:'P-003', vname:'박한별' });
  assert.equal(b.v.sid, '');
  assert.equal(b.v.name, '');
});

test('viewingSelf() 는 언제나 참이다 — 남을 볼 길이 없으므로', () => {
  assert.equal(box({ me:{ sid:'A-001', name:'최기운' }, vsid:'P-003', vname:'박한별' }).self, true);
});

/* ══════════════════════════════════════════════
   ② 남을 고르는 길이 없다
   ══════════════════════════════════════════════ */
test('★ setView 가 아예 없다 — 열람 대상을 바꾸는 길 자체를 없앴다', () => {
  assert.ok(W.indexOf('function setView(') < 0, '함수가 남아 있다');
  assert.ok(W.indexOf('setView(') < 0, '부르는 곳이 남아 있다');
});

test('「내 업무」 머리에 담당자 고르개가 없다', () => {
  const R = grab('renderMy');
  assert.ok(R.indexOf('ownerOptions()') < 0, '고르개를 다시 그리고 있다');
  assert.match(R, /<h1>내 업무<\/h1>/);
  assert.ok(R.indexOf("' 님의 업무'") < 0, '남의 이름을 제목에 쓰고 있다');
});

test('「열람 중 · 기록하면 작성자는 …」 배지가 없다 — 그런 상태 자체가 없어졌다', () => {
  assert.ok(W.indexOf('열람 중 · 기록하면 작성자는') < 0);
});

test('「↩ 내 업무」 되돌아가기 단추도 없다 — 떠날 자리가 없으니 돌아올 일도 없다', () => {
  assert.ok(W.indexOf('내 업무로 돌아가기') < 0);
});

/* 현장 방문에는 «대표가 전 직원을 보는» 길이 따로 있다(VIS.scope='all').
   그것은 없애지 않았다 — 다만 «누가» 를 좁혔다. */
test('★ 전 직원 현장 방문은 대표만 — 재무 권한으로는 못 본다', () => {
  const V = grab('visAdmin');
  assert.match(V, /isAdmin\(\)/);
  assert.ok(V.indexOf('perfFin') < 0,
    '재무 권한이 남아 있다 — 재무는 돈을 보는 권한이지 남의 현장 일정을 보는 권한이 아니다');
});

test('보통은 제목이 「내 현장 방문」이다', () => {
  assert.ok(W.indexOf(": '내 현장 방문';") > 0);
});

test('그 사람을 펼쳐 볼 때만 이름이 붙는다 — 그리고 그 길은 대표에게만 열린다', () => {
  const R = grab('renderVisits');
  assert.match(R, /gName \? esc\(gName\) \+ ' 님 현장 방문'/);
  assert.match(R, /if \(!admin\) \{ VIS\.scope = 'me'; VIS\.pick = ''; \}/,
    '권한이 없으면 제 것으로 되돌린다');
});

/* ══════════════════════════════════════════════
   ③ 남의 업무는 「팀 전체」에서
   ══════════════════════════════════════════════ */
test('★ 업무량에서 사람을 누르면 팀 전체로 간다 — 내 업무를 남의 것으로 바꾸지 않는다', () => {
  assert.ok(W.indexOf("teamOnly(\\''+escJ(r.name)+'\\');go(\\'team\\')") > 0, '업무량 줄이 아직 내 업무로 간다');
});

test('팀 전체의 상태 칩은 읽기용이다 — 남의 업무를 거기서 바꾸지 않는다', () => {
  const R = W.slice(W.indexOf('function renderTeam(){'), W.indexOf('function teamSort('));
  assert.match(R, /stChip\(/);
  assert.ok(R.indexOf('stSelect(') < 0, '남의 상태를 고르는 칸이 생겼다');
});

/* ══════════════════════════════════════════════
   ④ 성과급은 처음부터 본인만이었다 — 그대로인지 못박는다
   ══════════════════════════════════════════════ */
test('성과급은 로그인 본인 사번만 본다 (열람 대상을 따라가지 않는다)', () => {
  assert.match(grab('pcMySid'), /return \(S&&S\.me&&S\.me\.sid\)\|\|'';|return \(S\.me&&S\.me\.sid\)\|\|'';/);
  assert.ok(grab('pcMySid').indexOf('vsid') < 0);
});
