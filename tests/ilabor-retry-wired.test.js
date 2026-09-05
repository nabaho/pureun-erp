/* «다시 걸기»가 실제로 부르는 자리에 붙어 있는가 — 판단만 있고 안 쓰면 소용없다
   ═══════════════════════════════════════════════════════════════════════════
   실측 2026-09-05. 대표께서 「📥 상세+첨부」를 누르셨을 때:

       부르지 못했다 — https://www.kcplaa.or.kr/login (UND_ERR_SOCKET)
       other side closed

   몇 분 전 「엿보기」는 «같은 주소로» 멀쩡히 다녀왔다. 상대가 우리를 막은 것이
   아니라, 더운 서버가 «이미 저쪽에서 끊긴 줄»을 물려받아 난 탈이다.

   ilabor-parse.js 의 「다시걸까」가 그 판단을 한다. 하지만 판단만 있고
   부르는 자리(functions/index.js 의 노무사회부르기)가 그것을 «안 물어보면»
   아무것도 안 달라진다 — 검사는 통과하는데 대표 화면은 그대로 막힌다.
   그래서 여기서는 «붙어 있는가»를 본다.

   ⚠ 글자로 보는 검사이므로 «주석을 먼저 걷는다».
     이 저장소의 주석에는 「다시 건다」 같은 말이 실제로 들어 있어서,
     걷지 않으면 잘 쓴 주석이 검사를 통과시킨다(tests-must-strip-comments). */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const 뿌리 = path.join(__dirname, '..');

/* ⚠ 주석 걷기·함수 몸 떼기는 tests/helpers 한 자리에 있다.
     예전에는 검사마다 베껴 두었는데, 그것이 «정규식 리터럴»을 몰라
     (`replace(/'/g, …)` 같은 줄에서) 그 뒤 주석을 하나도 못 걷었다 —
     걷은 줄 알았던 검사 넷이 실은 주석을 보고 통과하고 있었다(2026-09-05). */
const { 주석걷기, 함수몸 } = require('./helpers/strip-comments.js');

const 소스 = 주석걷기(fs.readFileSync(path.join(뿌리, 'functions', 'index.js'), 'utf8'));
const 부르기 = 함수몸(소스, '노무사회부르기');

test('노무사회부르기 함수를 찾을 수 있다', () => {
  assert.ok(부르기, '함수가 사라졌거나 이름이 바뀌었다 — 검사부터 고칠 것');
});

test('★ 한 번 실패했다고 «포기하지 않는다» — 되풀이 안에서 부른다', () => {
  /* fetch 가 되풀이(for/while) 밖에 홀로 있으면 끊긴 줄 한 번에 그대로 진다 */
  const 되풀이 = /\b(for|while)\s*\([\s\S]*?await\s+fetch\s*\(/.test(부르기);
  assert.ok(되풀이, '★ await fetch 가 되풀이 안에 있지 않다 — 다시 걸 수가 없다');
});

test('★ «다시 걸어도 되는 탈인지» 물어보고 건다', () => {
  assert.ok(/다시걸까\s*\(/.test(부르기),
    '★ 다시걸까 를 안 물어본다 — 비밀번호가 틀렸는데도 세 번 두드리면 계정이 잠긴다');
  /* ⚠ 함수 어딘가에 다시걸까 가 «있기만» 해서는 뜻이 없다.
       탈을 잡은 자리(catch)와 «다시 걸러 가는 자리»(쉼) 사이에서 물어봐야 한다.
       그러지 않으면 무슨 탈이든 세 번씩 두드린다 — 계정이 잠기는 길이다. */
  const 탈잡은뒤 = 부르기.indexOf('catch');
  const 쉬러가기 = 부르기.indexOf('다시걸기쉼');
  assert.ok(탈잡은뒤 >= 0 && 쉬러가기 > 탈잡은뒤, '탈을 잡고 쉬는 짜임이 아니다');
  assert.ok(/다시걸까\s*\(/.test(부르기.slice(탈잡은뒤, 쉬러가기)),
    '★ 다시 걸지 «말지»를 안 가린다 — 아무 탈에나 세 번 두드린다');
});

test('★ 다시 걸기 전에 «쉰다» — 바로 걸면 같은 죽은 줄을 또 잡는다', () => {
  assert.ok(/다시걸기쉼\s*\(/.test(부르기), '★ 쉬지 않고 곧바로 다시 건다');
  assert.ok(/await\s+잠깐\s*\(/.test(부르기), '★ 쉼이 실제로 기다려지지 않는다');
});

test('★ 끝내 안 되면 «다시 걸어도 안 됐다»고 말한다', () => {
  /* 조용히 「fetch failed」로 끝나면 대표는 어제와 똑같은 화면을 본다 */
  assert.ok(/e(rr)?\.다시걸었나/.test(부르기) || /다시걸었나/.test(부르기),
    '★ 다시 걸어 봤다는 사실이 답에 실리지 않는다');
});

test('★ 그 사실이 «화면까지» 간다 — 답에 실어 보낸다', () => {
  assert.ok(/다시걸었나\s*:/.test(소스),
    '★ 서버만 알고 대표 화면에는 안 간다 — 그러면 없는 것과 같다');
});

test('다시 걸기 부품이 실제로 «내보내져» 있다', () => {
  const P = require(path.join(뿌리, 'functions', 'ilabor-parse.js'));
  assert.equal(typeof P.다시걸까, 'function');
  assert.equal(typeof P.다시걸기쉼, 'function');
  assert.equal(typeof P.다시걸기, 'number');
});
