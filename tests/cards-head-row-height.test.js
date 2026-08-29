'use strict';
/* 머리줄 키 = 데이터 한 줄 키 (대표 지시 2026-08-29)
   ═══════════════════════════════════════════════════════════════════════════
   「사업분류 박스 행 위아래 넓다 줄여달라」 → 「데이터 넣은 크기하고 같게 해라」

   ■ 무엇을 지키나
     제목·사업분류 탭·보기도구가 있는 머리줄(#pcHead)의 키가, 표의 «데이터 한 줄»과
     같아야 한다. 크롬에서 재 보면 둘 다 44px 이다:
       머리줄   6 + 32 + 6 = 44   (위 여백 · 보기도구 키 · 아래 여백)
       데이터줄 12 + 20 + 12 = 44 (td 위 살 · 글자 한 줄 · td 아래 살)

   ■ 왜 검사가 필요한가
     이 둘은 CSS 에서 «서로 멀리 떨어진 두 줄»이다. 나중에 표 칸을 넉넉하게 하려고
     td 살을 12→14 로만 바꾸면, 머리줄은 그대로 44 인데 데이터 줄만 48 이 된다 —
     사업분류 줄만 유독 납작해 보이고, 아무도 왜인지 모른다. 반대도 마찬가지다.
     그래서 «값»이 아니라 «두 셈이 같다»를 못 박는다.

   ■ 못 박는 값 하나
     글자 한 줄의 키(20px)만은 CSS 에 안 적혀 있다 — line-height 를 안 준 채
     font-size:13.5px 로 브라우저가 잡는 값이라 크롬에서 실측해 왔다(2026-08-29).
     검사고정-허용: 이 20 은 「지금 값」이 아니라 이 셈을 세울 «자」다.
     글꼴이나 글자 크기를 바꾸면 이 수도 다시 재서 함께 고쳐야 한다.
   실행: node --test tests/cards-head-row-height.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

/* 주석은 걷어 내고 본다 — 주석 속 예시 숫자가 검사를 통과시키면 안 된다 */
const css = src.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* 검사고정-허용: 글자 한 줄의 키. CSS 에 없는 값이라 크롬에서 재 왔다(위 머리말 참고). */
const LINE = 20;

function rule(selector){
  const i = css.indexOf(selector + '{');
  assert.ok(i >= 0, '「' + selector + '」 규칙을 찾지 못했습니다');
  return css.slice(i + selector.length + 1, css.indexOf('}', i));
}
/* padding 을 위·아래 두 값으로 편다 (1값 / 2값 / 3값 / 4값 모두) */
function padY(decl){
  const m = decl.match(/(?:^|;)\s*padding:\s*([^;}]+)/);
  assert.ok(m, 'padding 을 찾지 못했습니다: ' + decl);
  const v = m[1].trim().split(/\s+/).map(x => parseFloat(x));
  if (v.length === 1) return [v[0], v[0]];
  if (v.length === 2 || v.length === 3) return [v[0], v.length === 3 ? v[2] : v[0]];
  return [v[0], v[2]];
}
function px(decl, prop){
  const m = decl.match(new RegExp('(?:^|;)\\s*' + prop + ':\\s*([0-9.]+)px'));
  assert.ok(m, prop + ' 을(를) 찾지 못했습니다: ' + decl);
  return parseFloat(m[1]);
}

/* 머리줄 키 — 위 여백 + 가장 큰 것의 키 + 아래 여백.
   가장 큰 것은 보기도구다(키를 못 박아 두었다). 사업분류 칩은 그보다 낮다. */
function headHeight(){
  const [top, bot] = padY(rule('#pcHead'));
  const toolH = px(rule('#pcTools .pctool,#pcTools select'), 'height');
  return { total: top + toolH + bot, top, bot, toolH };
}
/* 데이터 한 줄 키 — td 위 살 + 글자 한 줄 + td 아래 살 */
function rowHeight(){
  const [top, bot] = padY(rule('#pcTable td'));
  return { total: top + LINE + bot, top, bot };
}

test('★ 머리줄 키가 데이터 한 줄과 «같다»', () => {
  const h = headHeight(), r = rowHeight();
  assert.equal(h.total, r.total,
    `★ 머리줄 ${h.total}px · 데이터 줄 ${r.total}px — 둘이 어긋났다.\n`
    + `   머리줄 = ${h.top} + ${h.toolH} + ${h.bot},  데이터 줄 = ${r.top} + ${LINE} + ${r.bot}\n`
    + '   한쪽만 고치면 사업분류 줄만 유독 도드라져 보인다 (대표 지시 2026-08-29 '
    + '「데이터 넣은 크기하고 같게 해라」). 표 칸 살을 바꿨다면 #pcHead 여백도 함께 바꿀 것.');
});

test('머리줄 위아래 여백이 서로 같다 — 사업분류 줄이 한쪽으로 쏠리지 않게', () => {
  const [top, bot] = padY(rule('#pcHead'));
  assert.equal(top, bot,
    `위 ${top}px · 아래 ${bot}px — 줄이 위나 아래로 쏠려 보인다`);
});

test('★ 보기도구는 «키»로 맞춘다 — 살로 맞추면 1px 이 어긋난다', () => {
  /* 단추(31px)와 고르개(33px)는 같은 살을 줘도 키가 다르다. 가장 큰 것 하나가
     머리줄 키를 정하므로, 그 1px 이 그대로 줄 높이가 되어 「같게」가 깨진다. */
  const decl = rule('#pcTools .pctool,#pcTools select');
  assert.match(decl, /height:\s*[0-9.]+px/,
    '★ 보기도구에 키가 안 박혀 있다 — 단추와 고르개의 키가 갈려 머리줄이 1px 높아진다');
});

test('사업분류 칩이 보기도구보다 크지 않다 — 크면 칩이 줄 높이를 정해 버린다', () => {
  /* 칩은 renderMyTabsHtml 이 인라인으로 그린다: 위아래 살 6px + 테두리 1.5px×2 + 글자.
     12.5px 글자의 한 줄은 크롬 실측 16px → 6+6+3+16 = 31px < 32px. */
  const chip = src.match(/padding:6px 4px 6px 13px/);
  assert.ok(chip, '사업분류 칩의 살(6px)을 찾지 못했습니다 — 바뀌었다면 이 셈을 다시 볼 것');
  const toolH = px(rule('#pcTools .pctool,#pcTools select'), 'height');
  assert.ok(6 + 6 + 3 + 16 <= toolH,
    `칩 ${6 + 6 + 3 + 16}px 이 보기도구 ${toolH}px 보다 크다 — 칩이 머리줄 키를 정하게 되어 `
    + '위 셈(여백+도구키+여백)이 더 이상 맞지 않는다');
});
