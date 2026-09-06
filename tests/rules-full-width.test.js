'use strict';
/* 규정관리 — 화면 «가로»를 끝까지 쓴다.

   판을 창 높이에 맞추면서 body 를 세로 flex 로 만들었다(2026-09-06). 그때 .wrap 의
   `margin:12px auto 22px` 가 조용히 뜻이 바뀌었다.

     · 블록일 때  — 가로 auto 는 «할 일이 없다». 블록은 어차피 부모 폭을 다 쓴다.
     · flex 자식일 때 — 가로 auto 는 «남는 자리를 먹는다». 그리고 자리를 먹는 순간
       늘리기(align-self:stretch)가 꺼져, 폭이 «내용만큼»으로 줄고 가운데로 몰린다.

   그래서 1900px 창에서 .wrap 이 1413px 로 줄고 좌우가 244px 씩 비었다. 내용이
   넓을 때는(긴 조문이 실려 있을 때) 창에 닿아 멀쩡해 보였다 — 그래서 처음 볼 때
   놓쳤다. 사업장을 안 고른 «빈 화면»에서 가장 크게 벌어진다.

   ⚠ 이 검사는 「auto 여백을 쓰지 마라」가 아니다. 세로 auto 는 그대로 쓴다.
     ★ 흐름 한복판(body → .wrap → .grid)의 칸은 «가로로 반드시 꽉 차야 한다».

   실행: node --test tests/rules-full-width.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'rules.html'), 'utf8').replace(/\r\n/g, '\n');

/* 창을 채우는 대목(미디어쿼리 한 덩어리) */
function fillBlock() {
  const at = src.search(/@media\s+screen\s+and\s*\(min-width:\s*901px\)\s*\{/);
  assert.ok(at >= 0, '창을 채우는 대목이 없습니다');
  let d = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(at, i + 1); }
  }
  throw new Error('대목의 끝을 못 찾음');
}

function rule(selector, scope) {
  const s = scope || src;
  const at = s.search(new RegExp('(^|[\\n{;])\\s*' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{'));
  assert.ok(at >= 0, selector + ' 규칙이 없습니다');
  return s.slice(s.indexOf('{', at) + 1, s.indexOf('}', s.indexOf('{', at)));
}

test('★★ .wrap 이 가로로 꽉 찬다 — 안 그러면 내용이 좁을 때 가운데로 몰린다', () => {
  const w = rule('.wrap', fillBlock());
  assert.match(w, /width:\s*100%/,
    '.wrap 에 폭이 없습니다. 가로 auto 여백이 flex 안에서 «가운데 정렬»로 바뀌어 '
    + '1900px 창에서 폭이 1413px 로 줄고 좌우가 244px 씩 빕니다: ' + w);
});

test('★ .wrap 이 가로 auto 여백으로 «자리를 먹지» 않는다', () => {
  /* width:100% 면 남는 자리가 0 이라 auto 가 먹을 것이 없다 — 그래도 뜻을 분명히
     적어 둔 편이 낫다. 둘 중 하나만 있어도 통과. */
  const w = rule('.wrap', fillBlock());
  assert.ok(/width:\s*100%/.test(w) || /margin-inline:\s*0/.test(w) || /margin-left:\s*0/.test(w),
    '폭을 못 박든 가로 여백을 0 으로 두든, 둘 중 하나는 있어야 합니다: ' + w);
});

test('★ 바깥 옆 여백은 그대로 — 끝까지 쓴다고 화면 끝에 붙이지는 않는다', () => {
  assert.match(rule('.wrap'), /padding:\s*0\s+\d+px/,
    '옆 여백까지 없애면 글이 화면 모서리에 닿습니다');
});

test('★ 두 판이 그 폭을 그대로 나눠 쓴다', () => {
  assert.match(rule('.grid'), /grid-template-columns:\s*1fr\s+14px\s+1fr/,
    '두 판이 «남는 폭을 반씩» 나눠야 합니다 — 고정폭이면 창을 넓혀도 안 늘어납니다');
});

test('세로 흐름은 그대로다 — 높이 맞추기를 되돌린 것이 아니다', () => {
  const b = fillBlock();
  assert.match(rule('body', b), /flex-direction:\s*column/);
  assert.match(rule('.wrap', b), /flex:\s*1/);
  assert.match(rule('.grid', b), /flex:\s*1/);
});

test('900px 이하는 그대로다 — 폰에서는 애초에 이 대목이 안 걸린다', () => {
  assert.match(src, /@media\(max-width:900px\)\{\.grid\{grid-template-columns:1fr\}/);
});
