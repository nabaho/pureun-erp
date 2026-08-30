/* 경력관리 — 화면은 가로를 다 쓴다 + 사이드바 정리 (대표 지시 2026-08-30)
   「대시보드 추가 삭제해라 필요없다 환경설정 아래로 내려라」
   「경력관리 위촉장부터 학력까지 모두 좌우로 넓게 … 일부러 중간만 할 필요없다.
     모든 css 각게 해라 실적관리도 똑같다」

   ■ 실측된 문제 셋
   ① .page 가 1280px 로 묶여 1800 짜리 화면에서 좌우 500px 을 버렸다.
      위촉장 표의 기관명·직책이 「…」으로 잘렸다.
   ② 화면마다 폭이 제각각이었다 — 환경설정만 1700px, 한글 서식만 풀림.
   ③ ★ 표 머리행이 «2번 줄을 덮고» 있었다. .dt table 의 overflow:hidden(둥근 모서리용)이
      스크롤 상자를 만들어, position:sticky 머리행이 표 «안»에 갇혀 툴바 높이(--tbH=83px)
      만큼 내려앉았다. 실측: 머리 343 / 첫 줄 299 — 순서가 뒤집혀 보였다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');
const bare = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
/* CSS 만 — 본문에 든 인라인 style 이나 글자에 걸리지 않게 */
const css = bare.slice(bare.indexOf('<style'), bare.lastIndexOf('</style>'));

/* ── ① 가로를 다 쓴다 ── */

test('★ .page 를 가운데로 묶지 않는다 — 좌우를 버리면 표가 잘린다', () => {
  const m = css.match(/\n\.page\{[^}]*\}/);
  assert.ok(m, '.page 규칙을 찾지 못했습니다');
  assert.doesNotMatch(m[0], /max-width:\s*\d/, '폭을 숫자로 묶으면 그만큼 화면을 버립니다');
  assert.doesNotMatch(m[0], /margin:\s*0 auto/, '가운데로 모으면 좌우가 남습니다');
  assert.match(m[0], /width:\s*100%/);
});

test('★ 폭 규칙은 «하나»다 — 화면마다 따로 넓히면 서로 달라진다', () => {
  /* 전에는 환경설정만 1700px, 한글 서식만 max-width:none 이었다 */
  assert.equal(css.indexOf('#page-settings>.page{max-width'), -1,
    '환경설정만 따로 넓히면 다른 화면과 폭이 어긋납니다');
  assert.doesNotMatch(css, /rcEditCard\.rh-doc\) \.page\{max-width/,
    '한글 서식만 따로 풀 필요가 없습니다 — .page 가 이미 다 씁니다');
});

/* ── ② 머리행이 줄을 덮지 않는다 ── */

test('★★ .dt table 에 overflow 를 걸지 않는다 — 머리행이 표 안에 갇힌다', () => {
  const rules = css.match(/\.dt table\{[^}]*\}/g) || [];
  assert.ok(rules.length, '.dt table 규칙을 찾지 못했습니다');
  rules.forEach((r) => assert.doesNotMatch(r, /overflow\s*:\s*(hidden|auto|scroll|clip)/,
    'overflow 는 스크롤 상자를 만들고, sticky 머리행은 그 안에서만 놉니다 — ' +
    '툴바 높이만큼 내려앉아 아랫줄을 덮습니다'));
});

test('머리행은 여전히 «따라다닌다» — 긴 표에서 열 이름이 사라지면 못 읽는다', () => {
  const th = (css.match(/\.dt thead th\{[^}]*position:sticky[^}]*\}/) || [])[0];
  assert.ok(th, '머리행 sticky 규칙이 있어야 합니다');
  assert.match(css, /\.dt thead th\{top:var\(--tbH/, '툴바 밑에 붙어야 합니다');
});

test('둥근 모서리는 «귀퉁이 칸»으로 살린다 — overflow 를 안 쓰고도 된다', () => {
  ['thead th:first-child{border-top-left-radius',
   'thead th:last-child{border-top-right-radius',
   'tbody tr:last-child td:first-child{border-bottom-left-radius',
   'tbody tr:last-child td:last-child{border-bottom-right-radius']
    .forEach((sel) => assert.ok(css.indexOf('.dt ' + sel) > 0, sel + ' 이(가) 있어야 합니다'));
});

/* ── ③ 사이드바 ── */

test('★ 「＋ 대시보드 추가」를 없앴다 (대표 지시 「필요없다」)', () => {
  /* 주석은 걷고 본다 — 「없앴다」고 적은 주석까지 걸리면 검사가 헛돈다 */
  assert.equal(bare.indexOf('대시보드 추가'), -1, '화면에 그 글자가 남아 있습니다');
  assert.equal(bare.indexOf('function navQuickAdd'), -1, '쓰지 않는 추가 코드는 남기지 않습니다');
  assert.equal(bare.indexOf('function toggleNavAddForm'), -1);
  ['navAddBtn', 'navAddForm', 'naGrp', 'naItem', 'naIcon']
    .forEach((id) => assert.equal(source.indexOf('id="' + id + '"'), -1, id + ' 가 남아 있습니다'));
});

test('★ 그래도 «지우는 길»은 남긴다 — 없으면 만든 메뉴를 영영 못 지운다', () => {
  /* 환경설정 › 메뉴 관리 탭은 이미 사라졌다. 여기까지 없애면 지울 방법이 아예 없다. */
  assert.match(bare, /function renderNavAddList/);
  assert.match(bare, /function delCustomGrp/);
  assert.match(bare, /function delCustomItem/);
  assert.match(source, /id="navAddList"/);
});

test('★ 지울 것이 «있을 때만» 뜬다 — 늘 떠 있으면 없앤 뜻이 없다', () => {
  const m = source.match(/id="navAddBar"[^>]*style="([^"]*)"/);
  assert.ok(m, 'navAddBar 를 찾지 못했습니다');
  assert.match(m[1], /display:none/, '기본은 숨김이어야 합니다');
  assert.match(bare, /navAddBar[\s\S]{0,200}groups\.length/,
    '만든 메뉴가 있을 때만 열어야 합니다');
});

test('★ 환경설정이 사이드바 «맨 아래»다', () => {
  const aside = source.slice(source.indexOf('<aside class="sidebar">'), source.indexOf('</aside>'));
  const iBar = aside.indexOf('id="navAddBar"');
  const iFoot = aside.indexOf('id="navFooter"');
  assert.ok(iBar > 0 && iFoot > 0, '두 칸이 모두 있어야 합니다');
  assert.ok(iBar < iFoot, '지우기 칸이 아래에 있으면 환경설정이 맨 밑이 아니게 됩니다');
});

test('★ 메뉴를 그릴 때 지우기 칸도 함께 판정한다 — 안 부르면 영영 안 뜬다', () => {
  /* 전에는 「＋ 대시보드 추가」를 눌러야 그려졌다. 그 단추를 없앴으므로 buildNav 가 맡는다. */
  const at = bare.indexOf('function buildNav(');
  const end = bare.indexOf('\n}', at);
  assert.ok(at > 0 && end > at);
  assert.match(bare.slice(at, end), /renderNavAddList/);
});
