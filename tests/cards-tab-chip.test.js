/* 기업정보함 — 탭 칩: 종류를 갈라 보이기 + 고른 명함을 칩으로 바로 담기.
   실행: node --test tests/*.test.js

   대표 보고 2026-08-15: "전문가 안에서 이미 만들어진 변호사 탭으로 옮기려는데 계속 복잡하다."

   까닭은 **탭이 두 종류인데 구분이 안 되는 것**이었다.
     · 조건 탭 — 검색·필터를 저장한 탭. 자료가 바뀌면 자동으로 따라온다. **담을 수 없다.**
     · 담는 탭 — 명함을 골라 넣는 칸.
   같은 「＋ 탭 추가」가 그때 조건이 걸렸는지에 따라 둘 중 하나를 만드는데,
   칩이 🏷 와 🔖 로 거의 똑같이 생겨 눈으로 못 갈랐다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function load(){
  const a = '/* ══════ 탭 칩 — 순수 로직 (테스트 대상) ══════';
  const b = '/* ══════ 탭 칩 — 화면 ══════ */';
  const i = src.indexOf(a), j = src.indexOf(b);
  assert.ok(i >= 0, '시작 표식 못찾음');
  assert.ok(j > i, '끝 표식 못찾음');
  const ctx = { console, Object, Array, String, Number, JSON };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j), ctx);
  return ctx;
}

const 담는탭 = { id:'t1', name:'변호사', manual:true };
const 조건탭 = { id:'t2', name:'변호사', manual:false };

/* ── ① 두 종류를 한눈에 ── */

test('★ 두 종류가 서로 다른 그림표를 쓴다', () => {
  /* 예전에는 🏷 와 🔖 로 거의 같아 보여 무엇이 무엇인지 몰랐다. */
  const C = load();
  assert.equal(C.tabIcon(담는탭), '🏷');
  assert.equal(C.tabIcon(조건탭), '🔍');
  assert.notEqual(C.tabIcon(담는탭), C.tabIcon(조건탭), '두 종류가 같아 보입니다');
});

test('manual 표시가 아예 없으면 조건 탭으로 본다', () => {
  /* 옛 탭에는 manual 칸이 없다 — 없으면 담을 수 없는 쪽이 안전하다. */
  const C = load();
  assert.equal(C.tabIcon({ id:'x', name:'옛탭' }), '🔍');
  assert.equal(C.tabIcon(null), '🔍');
});

/* ── ③ 고른 명함을 칩으로 바로 담기 ── */

test('고른 것이 없으면 예전 그대로 — 그 탭을 본다', () => {
  const C = load();
  assert.equal(C.tabChipAction(담는탭, 0), 'apply');
  assert.equal(C.tabChipAction(조건탭, 0), 'apply');
});

test('★ 고른 것이 있고 담는 탭이면 담는다', () => {
  const C = load();
  assert.equal(C.tabChipAction(담는탭, 93), 'add');
});

test('★ 조건 탭에는 담지 않는다 — 담을 수 없는 칸이다', () => {
  /* 조건 탭은 조건으로 자동으로 모이는 칸이라 손으로 담을 자리가 없다.
     조용히 무시하면 「눌렀는데 아무 일도 안 난다」가 된다 — 왜인지 말해 준다. */
  const C = load();
  assert.equal(C.tabChipAction(조건탭, 93), 'cant');
});

test('탭이 없으면 아무 일도 안 한다', () => {
  const C = load();
  assert.equal(C.tabChipAction(null, 5), 'none');
});

/* ── 무엇이 일어날지 미리 알려 주기 ── */

test('고른 것이 있으면 칩 설명이 「담는다」로 바뀐다', () => {
  const C = load();
  assert.match(C.tabChipTip(담는탭, 93), /93개를 이 탭에 담습니다/);
});

test('조건 탭 설명은 담을 수 없다는 것과 «대신 무엇을 할지»를 말한다', () => {
  /* 막기만 하고 다음에 뭘 할지 안 알려 주면 판단이 안 선다. */
  const C = load();
  const tip = C.tabChipTip(조건탭, 93);
  assert.match(tip, /담을 수 없습니다/);
  assert.match(tip, /지금 화면 조건으로 갱신/, '대신 할 일을 안 알려 줍니다');
});

test('고른 것이 없을 때는 종류 설명만 한다', () => {
  const C = load();
  assert.match(C.tabChipTip(담는탭, 0), /담는 탭/);
  assert.match(C.tabChipTip(조건탭, 0), /조건 탭/);
  assert.equal(C.tabChipTip(null, 0), '');
});

/* ── 화면이 이 층을 쓰는지 ── */

function fnBody(name){
  const i = src.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const j = src.indexOf('\n}', i);
  return src.slice(i, j + 2);
}

test('칩이 tabChipClick 을 부르고, 옛 방식(바로 applyView)이 남아 있지 않다', () => {
  const fn = fnBody('renderMyTabsHtml');
  assert.match(fn, /onclick="tabChipClick\('\$\{v\.id\}'\)"/, '칩이 새 길을 안 씁니다');
  assert.ok(!/onclick="applyView\('\$\{v\.id\}'\)"/.test(fn), '옛 방식이 남아 있습니다');
});

test('칩 줄이 고른 개수를 보고 그린다', () => {
  /* 이 값이 없으면 고른 뒤에도 칩이 그대로라 「담을 수 있다」는 것을 모른다. */
  const fn = fnBody('renderMyTabsHtml');
  assert.match(fn, /const selN = Object\.keys\(state\.sel\|\|\{\}\)\.length/, '고른 개수를 안 셉니다');
  assert.match(fn, /tabChipTip\(v, selN\)/);
  assert.match(fn, /tabChipAction\(v, selN\)==='add' \? '＋' : ''/, '담을 수 있을 때 표시가 없습니다');
});

test('고르면 탭 줄도 다시 그려진다', () => {
  /* toggleSel → render() → renderPC() → renderErpTabs() 로 이어져야 ＋ 가 나타난다. */
  assert.match(fnBody('toggleSel'), /render\(\)/, '고른 뒤 화면을 안 다시 그립니다');
  assert.match(fnBody('renderPC'), /renderErpTabs\(\)/, '탭 줄을 다시 안 그립니다');
});

test('담을 때는 한 번 물어보고, 명함이 지워지지 않는다고 알린다', () => {
  const fn = fnBody('tabChipClick');
  assert.match(fn, /confirm\(/, '묻지 않고 담습니다');
  assert.match(fn, /명함은 지워지지 않습니다/, '지워지는 줄 알 수 있습니다');
  assert.match(fn, /doAddToTab\(id\)/, '담는 함수를 안 부릅니다');
});
