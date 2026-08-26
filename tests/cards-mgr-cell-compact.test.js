/* 기업정보함 — 「담당」 칸을 한 줄로 컴팩트하게.
   실행: node --test tests/*.test.js

   대표 지시 2026-08-11: "이상하게 정리되었다. 간단하게 보일 수 있도록 해달라. 컴팩트하게."

   배지가 「자문 박재원」 + 「🏢 담당자」 + 「🚪 계약해지」 + 「⚠중복」 넷까지 쌓여
   158px 칸에서 두세 줄로 접히고 줄 높이가 늘어났다.
   **이름 배지만 글자로 남기고 나머지는 한 글자**로 줄인다 — 원래 말은 마우스로.

   ⚠ 여기서는 **모양이 아니라 지켜야 할 것**만 못 박는다. 어제 배지 글자를 그대로
     못 박아 둔 검사 두 개가 오늘 이 정리 때문에 깨졌다. 같은 실수를 되풀이하지 않는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

/* 담당 칸을 그리는 곳만 떠온다 */
function cellSrc(){
  const i = app.indexOf('const erpBadge = (function(){');
  assert.ok(i > 0, '담당 칸을 그리는 곳을 찾을 수 없습니다');
  const j = app.indexOf('})();', i);
  return app.slice(i, j + 5);
}

test('담당 칸은 한 줄로 고정된다 — 이것이 이 칸의 핵심이다', () => {
  /* nowrap 을 풀면 배지가 다시 접혀 줄 높이가 늘어난다. */
  assert.match(app, /#pcTable td\.mgcell\{[^}]*white-space:nowrap/, '칸이 한 줄로 고정돼 있지 않습니다');
  assert.match(app, /class="dt mgcell"/, '담당 칸에 mgcell 이 안 붙었습니다');
  /* 예전처럼 줄바꿈을 허용하고 줄간격을 벌려 두면 안 된다 */
  assert.ok(!/white-space:normal;line-height:1\.9/.test(app), '옛 줄바꿈·줄간격 설정이 남아 있습니다');
});

test('역할·상태·중복은 긴 글자를 쓰지 않는다', () => {
  const cell = cellSrc();
  for (const long of ['🏢 대표자', '🏢 담당자', '실무담당', '🚪 계약해지']) {
    assert.ok(!cell.includes('>' + long + '<'), '「' + long + '」이 그대로 남아 칸이 넘칩니다');
  }
  assert.ok(!/>⚠중복</.test(app), '「⚠중복」이 그대로 남아 칸이 넘칩니다');
});

test('줄인 글자마다 원래 말을 마우스 설명으로 남긴다', () => {
  /* 「담」·「대」·「실」·🚪·⚠ 만 보고는 무슨 뜻인지 알 수 없다. 설명이 없으면 줄인 값이 없다. */
  const cell = cellSrc();
  [['r-ceo', '대표자'], ['r-con', '담당자'], ['r-work', '실무'], ['mgq', '계약해지']]
    .forEach(([cls, word]) => {
      const i = cell.indexOf(cls);
      assert.ok(i > 0, cls + ' 배지가 없습니다');
      const span = cell.slice(Math.max(0, i - 200), i + 60);
      assert.match(span, /title="/, cls + ' 에 마우스 설명이 없습니다');
      assert.ok(span.includes(word), cls + ' 설명에 「' + word + '」가 없습니다');
    });
  assert.match(app, /class="dup" title="겹친 명함이 있습니다/, '⚠ 에 설명이 없습니다');
});

test('모양은 CSS 로 옮긴다 — 6천 줄에 긴 style 을 박지 않는다', () => {
  const cell = cellSrc();
  /* 예전에는 배지마다 display·background·border… 를 style 로 박아 표가 그만큼 무거웠다 */
  assert.ok(!/style="display:inline-block;background:/.test(cell),
    '배지 모양이 아직 줄마다 박히는 style 입니다');
  assert.match(app, /#pcTable \.mgb\{/, '배지 CSS 가 없습니다');
  assert.match(app, /const MGB_CLS = \{/, '유형 → 색 표가 없습니다');
});

test('유형 색은 다섯 가지가 모두 있다', () => {
  /* 하나라도 빠지면 그 유형만 회색으로 나와 「연결 안 된 것」처럼 보인다. */
  ['t-adv', 't-pay', 't-union', 't-fund', 't-agent', 't-etc']
    .forEach(c => assert.match(app, new RegExp('#pcTable \\.mgb\\.' + c), c + ' 색이 없습니다'));
  ['자문', '급여', '노조', '기금', '사무대행']
    .forEach(t => assert.ok(app.includes("'" + t + "':'t-"), t + ' 이 색 표에 없습니다'));
});

test('계약해지 문패는 색을 갖는다 — 회색이면 눈에 안 걸린다', () => {
  assert.match(app, /#pcTable \.mgq\{[^}]*color:#/, '계약해지 표시가 칸의 회색을 물려받습니다');
});

test('담당 칸은 기본 폭이 작고 사용자가 조절할 수 있다', () => {
  assert.match(app, /manager:'128px'/, '담당 칸 기본 폭이 128px가 아닙니다');
  assert.match(app, /<col data-col="manager" style="width:\$\{managerW\}">/,
    '담당 칸 폭이 다른 열처럼 저장·적용되지 않습니다');
  assert.match(app, /담당\$\{rz\('manager'\)\}/,
    '담당 헤더에 폭 조절 손잡이가 없습니다');
});
