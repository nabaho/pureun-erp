'use strict';
// 팀 전체 도구줄 — node --test tests/team-toolbar.test.js
//
// 왜: 도구줄에 손잡이가 아홉 덩어리였다. 그중 셋은 «눌러도 아무것도 안 걸러지는» 칩이고
//     (미기록 257 = 전체 257 · 2주+ 방치 257 = 전체 · 임박 0),
//     셋은 담당이 한 명뿐일 때도 서 있던 묶기·접기 단추였다.
//     게다가 「한 표로」 칩은 색과 말이 서로 어긋나 지금이 어느 쪽인지 알 수 없었다.
//
// 이 검사가 지키는 것
//   ① 누를 값이 없는 칩은 그리지 않는다 — 다만 켜 놓은 칩은 남긴다(껐다 켤 길)
//   ② 숨긴 숫자는 오른쪽 회색 줄에 사실로 남긴다 — 못 누를 뿐 모르면 안 된다
//   ③ 묶을 사람이 둘 이상일 때만 묶기·접기를 낸다
//   ④ 지금이 담당별인지 한 표인지가 «색»으로 읽힌다
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8').replace(/\r\n/g, '\n');
const CSS = src.slice(src.indexOf('<style>') + 7, src.indexOf('</style>'));
const RT = src.slice(src.indexOf('function renderTeam(){'), src.indexOf('function teamSort('));

/* 도구줄을 짓는 그 조각을 «소스에서 그대로» 잘라 돌린다.
   손으로 옮겨 적으면 검사만 통과하고 화면은 그대로일 수 있다. */
const 조각 = (function(){
  const from = RT.indexOf('  function sbChip(');
  assert.ok(from > 0, 'sbChip 을 못 찾음');
  const to = RT.indexOf("+'</div>';", from);
  assert.ok(to > from, '도구줄 끝을 못 찾음');
  return RT.slice(from, to + "+'</div>';".length);
})();

function bar(opt){
  opt = opt || {};
  const box = {
    String, Number, Array, Object, Math,
    open: { length: opt.total == null ? 257 : opt.total },
    names: { length: opt.people == null ? 12 : opt.people },
    nFold: opt.fold || 0,
    anyF: !!opt.anyF,
    S: { teamFlat: !!opt.flat, teamNolog: !!opt.nolog, teamStale: !!opt.stale },
    nolog: { length: opt.nolog_n || 0 },
    stale: { length: opt.stale_n || 0 },
    due7:  { length: opt.due7 || 0 },
    totLogs: opt.logs || 0,
    doneWk: { length: opt.done || 0 },
    qBox: () => '<!--검색-->',
    fBtn: () => '<!--담당깔때기-->',
    fOpen: () => false, fVals: () => [], fOnly: () => !!opt.d7on,
    fPass: () => true, preF: () => true, fToggleOne(){}, renderTeam(){}
  };
  box.window = box;
  vm.createContext(box);
  vm.runInContext('var h="";\n' + 조각 + '\nthis.out=h;', box);
  return box.out;
}

// 캡쳐와 같은 사정 — 진행 257건, 기록 0줄, 기한 없음
const 지금 = { total:257, people:12, nolog_n:257, stale_n:257, due7:0 };

/* ────────────────────────────────────────────────
   ① 누를 값이 없는 칩은 그리지 않는다
   ──────────────────────────────────────────────── */
test('전체와 숫자가 같은 칩은 안 그린다 — 눌러도 한 건도 안 걸러진다', () => {
  const h = bar(지금);
  assert.ok(h.indexOf('>미기록 257<') < 0, '미기록 칩이 남아 있다');
  assert.ok(h.indexOf('>2주+ 방치 257<') < 0, '방치 칩이 남아 있다');
});

test('0건인 칩도 안 그린다 — 누르면 아무것도 안 남는다', () => {
  assert.ok(bar(지금).indexOf('임박') < 0);
});

test('회색으로 죽여 두지 않고 아예 뺀다 — 죽어도 자리는 그대로 먹었다', () => {
  assert.ok(bar(지금).indexOf('dead') < 0);
  assert.ok(CSS.indexOf('.sb.dead{') < 0, '안 쓰는 규칙은 남기지 않는다');
});

test('누를 값이 생기면 칩이 저절로 돌아온다', () => {
  const h = bar({ total:257, people:12, nolog_n:180, stale_n:96, due7:14 });
  assert.match(h, />미기록 180</);
  assert.match(h, />2주\+ 방치 96</);
  assert.match(h, />임박 14</);
});

test('⚠ 켜 놓은 칩은 값이 어떻든 남긴다 — 안 그러면 껐다 켤 길이 사라진다', () => {
  const h = bar(Object.assign({}, 지금, { nolog:true }));
  assert.match(h, /class="sb am on"[^>]*>미기록 257</);
});

test('임박 칩도 켜 놓았으면 0건이어도 남는다', () => {
  const h = bar(Object.assign({}, 지금, { d7on:true }));
  assert.match(h, /class="sb dg on"[^>]*>임박 0</);
});

/* ────────────────────────────────────────────────
   ② 숨긴 숫자는 사실로 남는다
   ──────────────────────────────────────────────── */
test('숨긴 칩의 숫자는 오른쪽 회색 줄에 남는다 — 못 누를 뿐 모르면 안 된다', () => {
  const h = bar(지금);
  const note = h.slice(h.indexOf('class="fnote"'));
  assert.match(note, /미기록 257 · 2주\+ 방치 257 · 이 주 기록/);
});

test('0건은 회색 줄에도 안 적는다 — 0을 굳이 알릴 것이 없다', () => {
  assert.ok(bar(지금).indexOf('임박 0') < 0);
});

test('칩으로 나온 숫자는 회색 줄에 또 적지 않는다 — 같은 숫자가 두 번 나오면 헷갈린다', () => {
  const h = bar(Object.assign({}, 지금, { nolog:true }));
  assert.equal((h.match(/미기록 257/g) || []).length, 1);
});

test('일부만 해당하는 숫자는 회색 줄에 안 적는다 — 그건 칩이 이미 보여 준다', () => {
  const h = bar({ total:257, people:12, nolog_n:180, stale_n:96, due7:14 });
  const note = h.slice(h.indexOf('class="fnote"'));
  assert.ok(note.indexOf('미기록 180') < 0);
});

test('이 주 성적표는 언제나 남는다 — 걸러 보는 게 아니라 사실이다', () => {
  assert.match(bar({ total:257, people:12, logs:77, done:9 }),
    /이 주 기록 <b>77<\/b>줄 · 완료 <b>9<\/b>건/);
});

/* ────────────────────────────────────────────────
   ③ 묶을 사람이 둘 이상일 때만
   ──────────────────────────────────────────────── */
test('담당이 한 명뿐이면 묶기·접기를 안 낸다 — 묶음이 하나인데 접었다 폈다 할 일이 없다', () => {
  const h = bar({ total:45, people:1, nolog_n:45, stale_n:45 });
  assert.ok(h.indexOf('담당별') < 0);
  assert.ok(h.indexOf('모두 접기') < 0);
  assert.ok(h.indexOf('모두 펼치기') < 0);
});

test('담당이 둘 이상이면 낸다', () => {
  const h = bar(지금);
  assert.match(h, /👤 담당별/);
  assert.match(h, /▸ 모두 접기/);
  assert.match(h, /▾ 모두 펼치기/);
});

test('한 표로 볼 때는 접기·펼치기가 없다 — 접을 묶음이 없다', () => {
  const h = bar(Object.assign({}, 지금, { flat:true }));
  assert.ok(h.indexOf('모두 접기') < 0);
  assert.match(h, /▤ 한 표/, '보기 고르는 것은 남는다');
});

test('한 사람만 걸러 봐도 조건 풀 길은 남는다', () => {
  assert.match(bar({ total:45, people:1, anyF:true }), /✕ 필터/);
});

/* ────────────────────────────────────────────────
   ④ 지금이 어느 쪽인지 색으로 읽힌다
   ──────────────────────────────────────────────── */
test('담당별·한 표를 세그먼트로 — 보기 고르는 단추와 같은 모양', () => {
  assert.match(bar(지금), /class="vseg"/);
});

test('⚠ 묶여 있으면 「담당별」에 색이 온다 — 예전에는 「한 표로」가 파랗게 켜져 거꾸로 읽혔다', () => {
  const h = bar(지금);
  assert.match(h, /<span class="on"[^>]*>👤 담당별<\/span>/);
  assert.match(h, /<span class=""[^>]*>▤ 한 표<\/span>/);
});

test('한 표로 보면 「한 표」에 색이 온다', () => {
  const h = bar(Object.assign({}, 지금, { flat:true }));
  assert.match(h, /<span class="on"[^>]*>▤ 한 표<\/span>/);
  assert.match(h, /<span class=""[^>]*>👤 담당별<\/span>/);
});

test('누르면 «그 쪽으로» 간다 — 토글이 아니라 고르기라 두 번 눌러도 그대로다', () => {
  const h = bar(지금);
  assert.match(h, /onclick="S\.teamFlat=false;renderTeam\(\)"/);
  assert.match(h, /onclick="S\.teamFlat=true;renderTeam\(\)"/);
  assert.ok(h.indexOf('S.teamFlat=!') < 0, '토글로 두면 색과 말이 다시 어긋난다');
});

/* ────────────────────────────────────────────────
   ⑤ 줄어든 만큼
   ──────────────────────────────────────────────── */
test('캡쳐와 같은 사정에서 도구줄 덩어리가 줄어든다', () => {
  const h = bar(지금);
  // 칩 세 개가 사라진다 (미기록·방치·임박)
  assert.equal((h.match(/class="sb /g) || []).length, 0);
});

test('한 사람만 골라 들어온 자리에서는 검색·담당·조건풀기만 남는다', () => {
  const h = bar({ total:45, people:1, nolog_n:45, stale_n:45, anyF:true });
  assert.equal((h.match(/class="sb /g) || []).length, 0, '칩 없음');
  assert.equal((h.match(/class="vseg"/g) || []).length, 0, '묶기 없음');
  assert.equal((h.match(/class="chipbtn/g) || []).length, 1, '✕ 필터 하나만');
});
