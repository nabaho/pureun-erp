'use strict';
/* 쪽넘김 띠는 «가운데»에 온다 — 명함·사업자·기업 상세 모두 (대표 지시 2026-08-27)
   ═══════════════════════════════════════════════════════════════════════════
   대표 화면: 「갯수 정리하는 내용 중앙으로 옮겨라 명함도 같다」

   ■ 무엇이 문제였나
     #pcPager 는 «인라인 style» 로만 display:flex 를 갖고 있었다.
       <div id="pcPager" style="display:flex;...;justify-content:center;...">
     그런데 화면을 갈아 끼우는 곳에서 목록 UI 를 보였다 감췄다 하며
       e.style.display = (설정·자료함·메일·기업상세) ? 'none' : '';
     라고 «빈 문자열»을 넣는다. 빈 문자열은 인라인 display 를 «지운다».
     #pcPager 에는 CSS 규칙이 따로 없었으므로 그때부터 display:block 이 되고,
     justify-content:center 도 align-items 도 gap 도 통째로 죽는다 —
     그래서 쪽넘김이 왼쪽 끝에 붙어 있었다.

     ⚠ 같은 날 고친 기업 상세 스크롤(#pcCo 인라인 display:block)과 «같은 무늬»다.
       모양을 인라인에 두면, 그 인라인을 건드리는 코드가 모양을 조용히 지운다.

   ■ 어떻게 고쳤나
     쪽넘김의 «모양»을 CSS 로 옮기고, 기업 상세가 이미 쓰는 .copager 와
     «한 규칙»으로 묶었다. 그러면
       · style.display='' 로 지워도 CSS 의 flex 가 남는다
       · 명함·사업자·기업 상세가 갈라질 자리가 없다 (대표 지시 「명함도 같다」)

   ★ 여기서 못 박는 것
     ① 쪽넘김 모양이 CSS 에 있다 — 인라인에 두면 지워진다
     ② 세 목록이 «한 규칙»을 쓴다
     ③ 가운데 정렬이다
   실행: node --test tests/cards-pager-center.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

/* 쪽넘김 «모양»을 정하는 CSS 규칙을 찾는다.
   ⚠ .copager 가 든 규칙은 여럿이다(기업 상세 바닥은 여백만 줄인다).
     모양을 정하는 것은 display 를 가진 쪽이라, 그것으로 가른다. */
function pagerRule(){
  const re = /([^\n{}]*\.copager[^\n{}]*)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    if (/display\s*:/.test(m[2])) return { 고른것: m[1].trim(), 속내: m[2].replace(/\s+/g, '') };
  }
  assert.fail('쪽넘김 모양을 정하는 .copager 규칙을 찾지 못했습니다');
}

test('★ 쪽넘김이 가운데 정렬이다', () => {
  const r = pagerRule();
  assert.match(r.속내, /justify-content:center/);
  assert.match(r.속내, /display:flex/);
});

test('★ 명함·사업자 쪽넘김(#pcPager)도 «같은 규칙»을 쓴다 — 대표 지시 「명함도 같다」', () => {
  assert.match(pagerRule().고른것, /#pcPager/,
    '★ 따로 두면 한쪽만 고쳐진다 — 기업 상세는 가운데인데 명함만 왼쪽이 된다');
});

test('★ 모양이 «인라인»에 남아 있지 않다 — 인라인은 조용히 지워진다', () => {
  const m = src.match(/<div id="pcPager"([^>]*)>/);
  assert.ok(m, '#pcPager 를 찾지 못했습니다');
  assert.equal(/display\s*:/.test(m[1]), false,
    '★ 인라인 display 는 style.display=\'\' 한 줄에 지워진다 — '
    + '그러면 justify-content 도 gap 도 통째로 죽어 쪽넘김이 왼쪽에 붙는다');
  assert.equal(/justify-content\s*:/.test(m[1]), false,
    '★ 정렬도 CSS 에 둔다 — 한 곳에서만 정한다');
});

test('★ 목록 UI 를 감췄다 보이는 코드가 여전히 빈 문자열로 되돌린다', () => {
  /* 이 검사는 «고친 방식이 맞는지»를 지킨다. 저 코드가 'flex' 를 직접 넣도록 바뀌면
     모양이 다시 두 곳에 흩어진다 — CSS 에 두고 빈 문자열로 되돌리는 지금이 맞다. */
  const m = src.match(/\['pcFilters','pcSel','pcTableWrap','pcPager'\][\s\S]{0,300}?\}\);/);
  assert.ok(m, '목록 UI 를 감췄다 보이는 자리를 찾지 못했습니다');
  assert.match(m[0], /:\s*''/,
    '보일 때는 빈 문자열로 되돌려 CSS 가 정한 모양을 그대로 써야 한다');
});

test('기업 상세 바닥의 쪽넘김도 같은 규칙을 탄다', () => {
  assert.match(src, /#pcCo\.cosplit>\.cofoot \.copager\{/,
    '기업 상세 바닥에서 여백만 조금 줄이는 규칙이 사라졌다');
  const at = src.indexOf('function coPagerHtml');
  const fn = src.slice(at, src.indexOf('\n', src.indexOf('return', at)));
  assert.match(fn, /pagerHtml\(/, '기업 상세가 공용 쪽넘김을 안 쓴다');
});

test('세 목록이 같은 글귀꼴을 쓴다 — 세는 말만 다르다', () => {
  const at = src.indexOf('function pagerHtml');
  const fn = src.slice(at, at + 900);
  assert.match(fn, /class="copager"/, '공용 쪽넘김이 .copager 를 안 쓴다');
  assert.match(src, /pagerHtml\(info, '장'/, '명함 쪽 세는 말(장)이 없다');
  assert.match(src, /pagerHtml\(info, '곳'/, '기업 상세 세는 말(곳)이 없다');
});
