'use strict';
/* 기업 상세 탭 줄은 「거래관계 여부」만 나눈다 (대표 지시 2026-08-28)
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시: 「기업상세 전체에 캡쳐1의 탭은 거래관계가 있었는지 여부만 나누면 된다」

   ■ 무엇이 문제였나
     탭 줄에 칩이 다섯이었다 — 거래처·전체·종료·번호없음·정보부족(+고유번호증).
     둘은 «어느 회사를 볼까»(고르기)이고 넷은 «할 일»(거르기)인데 한 줄에 섞여 있었다.
     그래서 대표 화면에서 「종료」를 켜자 거래처 16 · 전체 16 · 정보부족 16 —
     모든 수가 16으로 붙어 「데이터가 이상하다」로 보였다. 한 줄에 뜻이 둘이면
     서로의 수를 갉아먹는다.

   ■ 어떻게 나눴나
     · 탭 줄  = 「거래관계가 있었는가」 하나. 🏢 거래처 / 🏢 전체 둘뿐이다.
     · 옆줄   = 「할 일」. 종료·번호없음·정보부족·고유번호증을 옆줄로 내렸다.
       기능은 하나도 안 없앴다 — 자리만 옮겼다.

   ★ 여기서 못 박는 것
     ① 탭 줄에는 «거래처·전체»만 있다 (할 일 넷이 없다)
     ② 할 일 넷은 옆줄에 «그대로» 있다 — 기능이 사라지면 안 된다
     ③ 옆줄 할 일도 0곳이면 안 보인다 (누를 값이 없는 줄을 두지 않는다)
     ④ 옆줄 할 일을 눌러 켜고 끈다 · 첫 쪽으로 돌아온다
     ⑤ 두 곳이 «같은 state»를 본다 — 두 벌이면 한쪽만 고쳐진다
   실행: node --test tests/cards-co-chips-two.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function fnBody(name){
  let i = src.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const open = src.indexOf('{', i);
  let d = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾을 수 없습니다');
}

/* 탭 줄 */
function drawTools(state){
  const ctx = { console, Object, Array, String, Number,
    esc: s => String(s==null?'':s),
    state: Object.assign({ coPageSize:100, coOnlyCares:true }, state||{}),
    coSizeSelHtml: () => '<select></select>',
    coScopeCounts: () => ({ cares: 312, all: 4147 }) };
  vm.createContext(ctx);
  vm.runInContext(fnBody('coToolsHtml'), ctx);
  return ctx.coToolsHtml();
}
/* 옆줄 할 일 */
function drawTodo(state, counts){
  const c = Object.assign({ closed:0, nobiz:0, lack:0, uid:0 }, counts||{});
  const ctx = { console, Object, Array, String, Number,
    esc: s => String(s==null?'':s),
    state: Object.assign({ coOnlyClosed:false, coOnlyNoBiz:false,
      coOnlyIncomplete:false, coOnlyUid:false }, state||{}),
    coClosedCount: () => c.closed, coNoBizCount: () => c.nobiz,
    coIncompleteCount: () => c.lack, coUidCount: () => c.uid,
    pcItem: (attrs, label, cnt, on) =>
      `<div class="pcitem ${on?'on':''}" ${attrs}>${label}<span class="gcount">${cnt}</span></div>` };
  vm.createContext(ctx);
  vm.runInContext(fnBody('coTodoSideHtml'), ctx);
  return ctx.coTodoSideHtml();
}

/* ══════ ① 탭 줄에는 둘만 ══════ */

test('★ 탭 줄에 「거래처」와 「전체」가 있다', () => {
  const h = drawTools({});
  assert.ok(h.indexOf('거래처') > 0, '거래처 칩이 없다');
  assert.ok(h.indexOf('전체') > 0, '전체 칩이 없다');
  assert.ok(h.indexOf('312') > 0 && h.indexOf('4,147') > 0, '두 수가 다 보여야 고를 수 있다');
});

test('★ 탭 줄에 «할 일» 넷이 없다 — 한 줄에 뜻이 둘이면 서로의 수를 갉아먹는다', () => {
  const h = drawTools({});
  ['종료', '번호 없음', '정보부족', '고유번호증'].forEach(function (label) {
    assert.equal(h.indexOf(label), -1,
      '★ 「' + label + '」이 탭 줄에 남아 있다 — 대표 지시는 「거래관계 여부만」이다');
  });
});

test('탭 줄이 세는 함수도 «거래처·전체»뿐이다 — 넷을 세면 그만큼 4,147곳을 더 훑는다', () => {
  const fn = fnBody('coToolsHtml');
  ['coClosedCount', 'coNoBizCount', 'coIncompleteCount', 'coUidCount'].forEach(function (f) {
    assert.equal(fn.indexOf(f), -1, f + ' 를 탭 줄에서 아직 부른다');
  });
  assert.match(fn, /coScopeCounts\(\)/);
});

test('쪽 크기 고르기는 그대로 오른쪽 끝에 남는다', () => {
  const fn = fnBody('coToolsHtml');
  assert.match(fn, /margin-left:auto/);
  assert.match(fn, /coSizeSelHtml\(/);
});

/* ══════ ② 할 일 넷은 옆줄에 그대로 ══════ */

test('★ 할 일 넷이 옆줄에 «그대로» 있다 — 자리만 옮겼지 기능을 없앤 것이 아니다', () => {
  const h = drawTodo({}, { closed:47, nobiz:88, lack:37, uid:3 });
  ['종료', '번호 없음', '정보부족', '고유번호증'].forEach(function (label) {
    assert.ok(h.indexOf(label) > 0, '★ 「' + label + '」이 옆줄에도 없다 — 기능이 사라졌다');
  });
  ['47', '88', '37', '3'].forEach(function (n) {
    assert.ok(h.indexOf(n) > 0, n + '곳이라는 수가 안 보인다');
  });
});

test('★ 옆줄 할 일이 «옆줄에서 그려진다» — 함수만 있고 안 부르면 소용없다', () => {
  const i = src.indexOf("if(state.view==='co'){");
  /* ⚠ 끝 경계는 「옆줄을 갈아 끼우는 그 줄」이다 — 그 줄 «뒤»에 무엇이 더 붙는지는
   이 검사가 볼 일이 아니다. 예전에는 `= h; return;` 까지 글자 그대로 붙들어,
   2026-08-29 에 그 줄 뒤로 구르던 자리 되꽂기(pcSideRestoreTop)가 붙자 형제 검사
   다섯이 «기능이 멀쩡한데» 한꺼번에 깨졌다(CLAUDE.md 「지금 값이 아니라 규칙」). */
  const end = src.indexOf("$('pcSide').innerHTML", i);
  assert.ok(i > 0 && end > i, '기업 상세 옆줄을 찾지 못했습니다');
  assert.match(src.slice(i, end), /coTodoSideHtml\(\)/,
    '★ 옆줄이 할 일 칸을 안 그린다 — 넷이 화면 어디에서도 안 보이게 된다');
});

/* ══════ ③ 0곳이면 안 보인다 ══════ */

test('★ 0곳인 할 일은 안 보인다 — 누를 값이 없는 줄을 두지 않는다', () => {
  const h = drawTodo({}, { closed:0, nobiz:5, lack:0, uid:0 });
  assert.equal(h.indexOf('종료'), -1, '0곳인데 종료가 보인다');
  assert.ok(h.indexOf('번호 없음') > 0, '5곳인데 번호 없음이 안 보인다');
  assert.equal(h.indexOf('정보부족'), -1, '0곳인데 정보부족이 보인다');
});

test('넷 다 0곳이면 「할 일」 머리까지 통째로 안 나온다 — 빈 머리만 남으면 안 된다', () => {
  assert.equal(drawTodo({}, {}).trim(), '');
});

/* ══════ ④ 눌러서 켜고 끈다 ══════ */

function row(html, label){
  const at = html.indexOf(label);
  assert.ok(at > 0, label + ' 줄이 없다');
  const start = html.lastIndexOf('<div', at);
  const end = html.indexOf('</div>', at);
  return html.slice(start, end);
}

test('★ 줄마다 «저마다» 켜고 끈다 · 첫 쪽으로 돌아온다', () => {
  const h = drawTodo({}, { closed:47, nobiz:88, lack:37, uid:3 });
  [['종료','coOnlyClosed'], ['번호 없음','coOnlyNoBiz'],
   ['정보부족','coOnlyIncomplete'], ['고유번호증','coOnlyUid']].forEach(function (p) {
    const r = row(h, p[0]);
    assert.match(r, new RegExp('state\\.' + p[1] + '\\s*=\\s*!state\\.' + p[1]),
      p[0] + ' 가 눌러도 안 뒤집힌다 — 켜기만 되면 전체로 못 돌아온다');
    assert.match(r, /coPage\s*=\s*0/, p[0] + ' 가 쪽수를 안 되돌린다 — 5쪽에서 걸면 빈 화면이다');
  });
});

test('★ 지금 켜진 줄이 «저마다» 눈에 보인다', () => {
  const on = drawTodo({ coOnlyClosed:true }, { closed:47, nobiz:88 });
  assert.match(row(on, '종료'), /class="pcitem on"/, '켜 놓고도 안 켜져 보인다');
  assert.equal(/class="pcitem on"/.test(row(on, '번호 없음')), false,
    '안 켠 줄이 켜져 보인다');
});

/* ══════ ⑤ 두 곳이 같은 state 를 본다 ══════ */

test('★ 거르는 일은 coFilteredList 한 곳에만 둔다 — 옮겼다고 딴 곳에서 거르면 안 된다', () => {
  const fn = fnBody('coFilteredList');
  ['coOnlyCares', 'coOnlyClosed', 'coOnlyNoBiz', 'coOnlyIncomplete', 'coOnlyUid']
    .forEach(function (k) { assert.match(fn, new RegExp(k), k + ' 가 거르기에서 빠졌다'); });
  /* 옆줄은 «켜고 끄기»만 한다 — 회사 목록을 제 나름으로 거르면 화면마다 결과가 어긋난다.
     (세는 것은 coClosedCount 등에 맡기고, 그것들이 coFilteredList 를 거친다) */
  const side = fnBody('coTodoSideHtml');
  ['coList(', 'coFilteredList(', 'coVisible('].forEach(function (bad) {
    assert.equal(side.indexOf(bad), -1,
      '★ 옆줄이 «' + bad + '»으로 회사를 직접 훑는다 — 거르기는 한 곳에만 있어야 한다');
  });
});

test('★ 새 Firebase 쓰기가 없다 — 자리만 옮겼다', () => {
  assert.equal(/db\.ref\(|Store\.db|Store\.put|\.update\(/.test(fnBody('coTodoSideHtml')), false);
});
