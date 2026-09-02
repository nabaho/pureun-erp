/* 경력관리 — 하위탭을 「화면 맨 아래」로 (대표 지시 2026-09-02, 목업 안 B)
   「상위탭은 상단에 고정하고 하위탭들만 하단에서 확인하고 선택할 수 있게 바꾸고싶다」

   ■ 무엇이 문제였나
     하위탭(위촉장·자격증·수료증·표창·학력)이 «본문 맨 위» 띠에 있었다. 목록을 내려 보다
     다른 탭으로 넘어가려면 매번 맨 위까지 되올라가야 했다. 손이 가는 곳은 아래쪽이다.

   ■ 무엇을 지켜야 하나
     ① 바는 화면에 «고정»(position:fixed)돼야 한다 — 본문과 함께 흘러가면 뜻이 없다.
     ② 본문 아래를 «바 높이만큼» 비워야 한다. 안 비우면 마지막 줄이 바 뒤에 숨는다.
     ③ 비우는 것은 «바가 있을 때만». 홈처럼 그룹이 없는 화면에 빈 띠가 남으면 안 된다.
     ④ 인쇄에는 안 찍힌다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cutFn } = require('./cut-fn');

const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');

test('★ 하위탭 바는 화면 «맨 아래»에 고정된다', () => {
  const at = source.indexOf('#groupTabs{');
  assert.ok(at > 0, '#groupTabs 규칙을 찾지 못했습니다');
  const rule = source.slice(at, source.indexOf('}', at));
  assert.match(rule, /position:fixed/, '고정하지 않으면 본문과 함께 흘러가 뜻이 없습니다');
  assert.match(rule, /bottom:0/);
  assert.doesNotMatch(rule, /border-bottom:1px/,
    '아래 바에는 «윗선»이 필요합니다 — 위 띠일 때의 밑선을 그대로 두면 안 됩니다');
  assert.match(rule, /border-top:1px/);
});

test('★ 옆줄만큼 비켜서고, 좁은 화면에서는 끝까지 쓴다', () => {
  const at = source.indexOf('#groupTabs{');
  assert.match(source.slice(at, source.indexOf('}', at)), /left:var\(--sbW,230px\)/,
    '옆줄 위를 덮으면 메뉴를 가립니다');
  assert.match(source, /@media\(max-width:820px\)\{ #groupTabs\{left:0\} \}/,
    '옆줄이 접히는 좁은 화면에서는 230px 을 비켜 두면 안 됩니다');
});

test('★★ 본문 아래를 «바가 있을 때만» 비운다 — 없는 화면에 빈 띠가 남으면 안 된다', () => {
  assert.match(source, /body\.has-gtabs #main\{padding-bottom:var\(--gtabH,56px\)\}/,
    '조건 없이 비우면 홈 화면 아래에 까닭 없는 빈 자리가 생깁니다');
  const fn = cutFn(source, 'function syncGroupUI(');
  assert.match(fn, /classList\.toggle\('has-gtabs', on\)/);
  assert.match(fn, /setProperty\('--gtabH'/,
    '높이를 «재서» 넣어야 합니다 — 탭이 두 줄로 접히면 고정값은 어긋납니다');
});

test('★ 인쇄에는 안 찍힌다', () => {
  const at = source.indexOf('@media print');
  assert.ok(at > 0);
  assert.ok(source.slice(at).indexOf('#groupTabs{display:none!important}') > 0
    || /\.sidebar,[^{]*#groupTabs\{display:none!important\}/.test(source.slice(at)),
    '화면 장치는 종이에 나오면 안 됩니다');
});

test('★ 알약 모양 규칙이 «위 띠 시절» 규칙을 이긴다', () => {
  /* .gtab{...} 은 위 띠 시절 것(밑줄 표시)이 그대로 남아 있고, 새 규칙이 그«앞»에 있다.
     그래도 이긴다 — #groupTabs .gtab 은 id 를 낀 규칙이라 .gtab 보다 구체적이기 때문이다.
     ⚠ 새 규칙에서 #groupTabs 를 떼어 내면 순서에 밀려 밑줄 모양으로 되돌아간다. */
  assert.ok(source.indexOf('.gtab{background:none') > 0, '옛 규칙이 있어야 이 검사가 뜻이 있습니다');
  const at = source.indexOf('#groupTabs .gtab{');
  assert.ok(at > 0, '새 규칙은 반드시 #groupTabs 로 감싸야 합니다');
  assert.match(source.slice(at, source.indexOf('}', at)), /border-radius:999px/);
  assert.match(source, /#groupTabs \.gtab\.active\{background:var\(--navy\)/,
    '고른 탭이 어느 것인지 드러나야 합니다');
});
