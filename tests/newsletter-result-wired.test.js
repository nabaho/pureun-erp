/* 「보낸 결과」 화면이 부품을 «실제로 쓰는가»
   ═══════════════════════════════════════════════════════════════════════════
   ⚠ 판단이 맞아도 화면이 안 쓰면 대표 눈에는 아무것도 안 달라진다.
     실제로 그랬다 — 열람은 몇 주째 쌓이고 있었는데 보는 곳이 한 군데도 없었다.
     그것이 이 화면을 만든 까닭이므로, 같은 일이 되풀이되지 않게 여기서 못 박는다.

   ⚠ 글자로 보는 검사이므로 «주석을 먼저 걷는다». 이 저장소 주석에는
     「열람」·「반송」·「mailbox」가 그대로 적혀 있어서, 안 걷으면
     잘 쓴 주석이 검사를 통과시킨다(tests-must-strip-comments). */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

/* ⚠ 걷는 부품은 tests/helpers 한 자리에 있다. 예전에는 검사마다 베껴 두었는데,
     그것이 «정규식 리터럴»을 몰라 (`replace(/'/g, …)` 같은 줄에서) 그 뒤 주석을
     하나도 못 걷었다 — 걷은 줄 알았던 검사 넷이 실은 주석을 보고 통과하고 있었다.
     한 자리에 두어야 한 번 고치면 다 고쳐진다(2026-09-05). */
const { 주석걷기 } = require('./helpers/strip-comments.js');

const 화면 = 주석걷기(fs.readFileSync(path.join(__dirname, '..', 'pu-news.html'), 'utf8'));
const 읽기 = 화면.slice(화면.indexOf('function 결과읽기'), 화면.indexOf('function 결과다시읽기'));
const 줄들 = 화면.slice(화면.indexOf('function 결과줄들'), 화면.indexOf('function 결과화면'));
const 그림 = 화면.slice(화면.indexOf('function 결과화면'));

test('★ 「보낸 결과」 칸이 실제로 있다', () => {
  assert.ok(/data-t="res"/.test(화면), '★ 탭 단추가 없다');
  assert.ok(/function 결과화면\s*\(/.test(화면), '★ 화면을 그리는 함수가 없다');
  assert.ok(/App\.tab\s*===\s*'res'[\s\S]{0,80}결과화면\s*\(/.test(화면),
    '★ 탭을 눌러도 그 화면으로 안 간다');
});

test('★ 세 가지를 «다» 읽는다 — 하나만 빠져도 반쪽이다', () => {
  assert.ok(읽기.length > 100, '결과읽기 함수를 못 찾았다');
  assert.ok(/newsletter\/opens\//.test(읽기), '★ 열람을 안 읽는다');
  assert.ok(/pucards\/scheduled/.test(읽기), '★ 대기열(나갔나)을 안 읽는다');
  assert.ok(/mailbox\/msgs\/inbox/.test(읽기), '★ 푸른메일함(반송)을 안 읽는다');
});

test('★ 메일함을 «통째로» 읽지 않는다 — 요금이 는다', () => {
  assert.ok(/mailbox\/msgs\/inbox'\)\s*\.limitToLast\(/.test(읽기),
    '★ 받은편지함을 통째로 가져온다');
  assert.ok(!/\.on\(/.test(읽기),
    '★ 켜 두고 계속 받는다 — 이 칸은 들어올 때 한 번만 읽으면 된다');
});

test('★ 대기열에서 «이 회차 것»만 고른다 — 자료 발송이 섞여 있다', () => {
  assert.ok(/bulk[\s\S]{0,40}batchId/.test(읽기),
    '★ batchId 로 안 거른다 — 남의 메일이 이 회차 결과에 섞인다');
});

test('★ 화면이 Core 의 판단을 쓴다 — 제 셈을 따로 하지 않는다', () => {
  assert.ok(줄들.length > 50, '결과줄들 함수를 못 찾았다');
  assert.ok(/Core\.메일함에서찾기\s*\(/.test(줄들), '★ 반송 찾기를 Core 로 안 한다');
  assert.ok(/Core\.보낸결과\s*\(/.test(줄들), '★ 나갔나 합치기를 Core 로 안 한다');
  assert.ok(/Core\.열람붙이기\s*\(/.test(줄들), '★ 열람 붙이기를 Core 로 안 한다');
  assert.ok(/Core\.결과셈\s*\(/.test(줄들), '★ 세는 것을 Core 로 안 한다');
  assert.ok(/Core\.보낸상태\s*\(/.test(그림), '★ 상태 딱지를 화면이 제멋대로 정한다');
});

test('★ 「안 읽음」이라 단정하지 않는다 — 그림을 막으면 읽고도 안 찍힌다', () => {
  /* ⚠ 안내 글에는 「‘안 읽음’이 아니라 ‘표시 없음’」이라고 «일부러» 적혀 있다.
       그러니 글 전체에서 찾으면 안 되고, 실제로 칸에 «찍히는 딱지»를 봐야 한다. */
  const i = 그림.indexOf('const 열람칸');
  assert.ok(i > 0, '열람 칸을 만드는 자리를 못 찾았다');
  const 열람칸 = 그림.slice(i, i + 400);
  assert.ok(/표시 없음/.test(열람칸), '★ 열람이 안 찍힌 것을 뭐라 부르는지 없다');
  assert.ok(!/안 읽음|안읽음|미열람/.test(열람칸),
    '★ 칸에 「안 읽음」이라 찍는다 — 아는 것보다 많이 말하는 것이다');
});

test('★ 못 맞춘 반송을 화면에도 «보여 준다»', () => {
  /* ⚠ 「못붙임」이 글 어딘가에 «있기만» 해서는 뜻이 없다 — 안내 글에도 나온다.
       실제로 «그려 내는 자리»가 살아 있는지 봐야 한다. */
  const i = 그림.indexOf('const 못붙인칸');
  assert.ok(i > 0, '★ 못 맞춘 것을 그리는 자리가 없다');
  const 칸 = 그림.slice(i, i + 500);
  assert.ok(/r\.못붙임\s*&&\s*r\.못붙임\.length/.test(칸),
    '★ 못 맞춘 것이 있어도 안 그린다 — 화면에서 조용히 버린다');
  assert.ok(/못붙임\.slice\(/.test(칸), '★ 무엇이 못 붙었는지 한 줄도 안 보여 준다');
});

test('★ 못 읽었으면 «못 읽었다»고 말한다 — 빈 표를 결과인 척하지 않는다', () => {
  /* ⚠ 「탈」은 그릇을 만들 때(탈:'')에도 나온다. «탈이 났을 때 담는지»를 봐야 한다. */
  assert.ok(/catch\s*\(e\)\s*\{\s*나온것\.탈\s*=/.test(읽기),
    '★ 읽다가 난 탈을 안 담는다 — 빈 표가 결과인 척한다');
  assert.ok(/읽지 못했습니다/.test(그림), '★ 탈이 나도 화면은 아무 말이 없다');
});
