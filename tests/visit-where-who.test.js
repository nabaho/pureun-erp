'use strict';
// 현장 방문 「어디에 · 누구와 같이」 — node --test tests/visit-where-who.test.js
//
// 대표 지시(2026-09-05): 「현장방문은 푸른이알피 법인대시보드와 캘린더를 연결해서
//   어디에 현장으로 누구와 같이 가는지 정리되게 해달라.」
//
// 표에는 날짜·사업장·회차·사진만 있었다. 정작 «어디로»(주소)와 «누구와»는 안 보였다.
// 그런데 그 둘 다 정부사업일정 자료에 «이미 있었다» — 화면이 안 쓰고 있었을 뿐이다.
//   s.attId              … 그 일정의 주담당
//   s.coAttIds/defCoAtts … 그 일정에 함께 가는 사람
//   co.coAttIds/defCoAtts … 그 사업장의 기본 동행
//
// 이 검사가 지키는 것
//   ① 같이 가는 사람을 빠짐없이·겹치지 않게 모은다
//   ② «나»는 빼고 보여 준다 (내 이름을 나에게 알릴 까닭이 없다)
//   ③ 없는 것을 지어내지 않는다 (주소가 없으면 안 적는다)
//   ④ 달력에서도 「언제 어디에 누구와」가 보인다
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

function makeBox(cos, staff){
  const box = {
    console, String, Object, Array,
    VIS: { cos: cos || [], gstaff: staff || [], types: [] },
    esc: x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))
  };
  vm.createContext(box);
  vm.runInContext(
    grab('visRows') + '\n' + grab('visName') + '\n' + grab('visCoOf') + '\n'
    + grab('visAttIds') + '\n' + grab('visWithNames') + '\n' + grab('visWhere') + '\n'
    + grab('visWhereCell') + '\n'
    + 'this.ids=visAttIds; this.withs=visWithNames; this.where=visWhere; this.cell=visWhereCell;', box);
  return box;
}

const 직원 = [
  { id:'g1', name:'박한별' }, { id:'g2', name:'김혜민' },
  { id:'g3', name:'권형하' }, { id:'g9', name:'' }        // 이름이 빈 사람
];
const 사업장 = [
  { id:'c1', name:'㈜가나전자', addr:'천안시 서북구 …', coAttIds:['g3'] },
  { id:'c2', name:'다라산업' }                              // 주소도 기본 동행도 없다
];

/* ══════════════════════════════════════
   ① 같이 가는 사람을 모은다
   ══════════════════════════════════════ */
test('주담당이 맨 앞에 온다', () => {
  const b = makeBox(사업장, 직원);
  assert.equal(Array.from(b.ids({ attId:'g1', coId:'c2' }))[0], 'g1');
});

test('일정의 동행자와 사업장의 기본 동행을 함께 모은다', () => {
  const b = makeBox(사업장, 직원);
  const got = Array.from(b.ids({ attId:'g1', coId:'c1', coAttIds:['g2'] }));
  assert.deepEqual(got, ['g1', 'g2', 'g3'], '일정 동행(g2)과 사업장 기본 동행(g3)이 다 와야 한다');
});

test('겹쳐도 한 번만 — 같은 사람이 두 번 적히면 안 된다', () => {
  const b = makeBox(사업장, 직원);
  const got = Array.from(b.ids({ attId:'g3', coId:'c1', coAttIds:['g3', 'g3'] }));
  assert.deepEqual(got, ['g3']);
});

test('옛 칸 이름(defCoAtts)도 읽는다 — 자료가 두 가지 모양으로 남아 있다', () => {
  const b = makeBox(사업장, 직원);
  assert.deepEqual(Array.from(b.ids({ attId:'g1', coId:'c2', defCoAtts:['g2'] })), ['g1', 'g2']);
});

test('빈손이면 빈손 — 없는 것을 지어내지 않는다', () => {
  const b = makeBox(사업장, 직원);
  assert.equal(Array.from(b.ids(null)).length, 0);
  assert.equal(Array.from(b.ids({ coId:'c2' })).length, 0);
});

/* ══════════════════════════════════════
   ② 「나」는 뺀다
   ══════════════════════════════════════ */
test('★ 내 이름은 안 적는다 — 나에게 내가 간다고 알릴 까닭이 없다', () => {
  const b = makeBox(사업장, 직원);
  const got = Array.from(b.withs({ attId:'g1', coId:'c1', coAttIds:['g2'] }, 'g1'));
  assert.deepEqual(got, ['김혜민', '권형하']);
  assert.ok(got.indexOf('박한별') < 0);
});

test('나 혼자 가면 아무도 안 적는다', () => {
  const b = makeBox(사업장, 직원);
  assert.equal(Array.from(b.withs({ attId:'g1', coId:'c2' }, 'g1')).length, 0);
});

test('⚠ 이름을 못 찾은 번호는 버린다 — 번호를 그대로 보여 주면 아무도 못 읽는다', () => {
  const b = makeBox(사업장, 직원);
  const got = Array.from(b.withs({ attId:'g1', coId:'c2', coAttIds:['g9', '없는번호', 'g2'] }, 'g1'));
  assert.deepEqual(got, ['김혜민']);
});

/* ══════════════════════════════════════
   ③ 어디로 가는지
   ══════════════════════════════════════ */
test('사업장에 주소가 있으면 적는다', () => {
  assert.match(makeBox(사업장, 직원).where({ coId:'c1' }), /천안시 서북구/);
});

test('⚠ 주소가 없으면 빈손 — 없는 주소를 지어내지 않는다', () => {
  assert.equal(makeBox(사업장, 직원).where({ coId:'c2' }), '');
  assert.equal(makeBox(사업장, 직원).where({ coId:'없는곳' }), '');
});

test('주소 칸 이름이 여러 가지라 다 본다', () => {
  const b = makeBox([{ id:'x', name:'가', address:'주소2' }], 직원);
  assert.equal(b.where({ coId:'x' }), '주소2');
});

/* ══════════════════════════════════════
   ④ 표 한 칸에 어떻게 담기나
   ══════════════════════════════════════ */
test('사업장 이름이 굵게, 주소와 동행이 그 아래 작게', () => {
  const h = makeBox(사업장, 직원).cell({ attId:'g1', coId:'c1', coAttIds:['g2'] }, 'g1');
  assert.match(h, /<b>㈜가나전자<\/b>/);
  assert.match(h, /📍 천안시 서북구/);
  assert.match(h, /👥 김혜민 · 권형하 와 함께/);
});

test('없는 것은 줄도 안 만든다 — 빈 줄이 자리만 먹지 않게', () => {
  const h = makeBox(사업장, 직원).cell({ attId:'g1', coId:'c2' }, 'g1');
  assert.match(h, /<b>다라산업<\/b>/);
  assert.ok(h.indexOf('📍') < 0);
  assert.ok(h.indexOf('👥') < 0);
});

test('사업장을 못 찾아도 칸이 깨지지 않는다', () => {
  assert.match(makeBox(사업장, 직원).cell({ coId:'없는곳' }, 'g1'), /<b>-<\/b>/);
});

/* ══════════════════════════════════════
   ⑤ 표와 달력에 실제로 달려 있다
   ══════════════════════════════════════ */
test('두 표(이 달·밀린 것) 모두 그 칸을 쓴다', () => {
  // ⚠ 함수를 «만드는» 줄도 같은 글자라 함께 세어진다 — «부르는» 모양으로 센다
  assert.equal((W.match(/\+ visWhereCell\(s, gid\) \+/g) || []).length, 2);
});

test('표 머리가 「어디에 · 누구와」로 바뀌었다', () => {
  assert.equal((W.match(/<th>어디에 · 누구와<\/th>/g) || []).length, 2);
});

test('★ 달력에 「현장 방문」 거르개가 있다', () => {
  const L = W.match(/var CAL_LAYERS=\[[\s\S]*?\];/)[0];
  assert.match(L, /\['vis', '현장 방문'/);
  assert.match(L, /'erp'\]/, '푸른이알피에서 온 자료 묶음에 넣는다');
});

test('⚠ 기본은 꺼 둔다 — 컨설팅이 많으면 달력이 방문으로 뒤덮인다', () => {
  const L = W.match(/var CAL_LAYERS=\[[\s\S]*?\];/)[0];
  assert.match(L, /\['vis', '현장 방문',\s*'#\w+',\s*0,/);
});

test('달력에는 «현장»만 올린다 — 사무실 일정은 현장 방문이 아니다', () => {
  const B = grab('calBuild');
  assert.match(B, /s\.isField === false/);
});

test('달력 줄에도 「누구와」가 붙는다', () => {
  assert.match(grab('calBuild'), /visWithNames\(s, _vg\)/);
  assert.match(grab('calBuild'), /와 함께/);
});

test('★ 달력 줄을 누르면 정부사업일정의 그 일정이 열린다 — 사진도 거기서 넣는다', () => {
  assert.match(grab('calEvHTML'), /e\.go\?' onclick="event\.stopPropagation\(\);visGo\(/);
  assert.match(grab('calBuild'), /go:s\.id/);
});

test('⚠ 달력에서는 끌어 옮길 수 없다 — 원본은 정부사업일정이고 여기는 보기만 한다', () => {
  const B = grab('calBuild');
  const i = B.indexOf("k:'vis'");
  assert.ok(B.slice(i - 200, i + 300).indexOf('drag:1') < 0);
});

test('★ 켰을 때만 «한 번» 읽는다 — 달력 때문에 컨설팅일정을 거듭 내려받지 않는다', () => {
  const B = grab('calBuild');
  assert.match(B, /if\(L\.vis && !VIS\.scheds && !_visCalT\)\{/);
  assert.match(B, /_visCalT = 1;/);
  assert.match(W, /var _visCalT = 0;/);
});

test('안 켰으면 아무것도 안 읽는다 — 끈 사람에게 요금을 물리지 않는다', () => {
  assert.match(grab('calBuild'), /if\(L\.vis && !VIS\.scheds/);
});
