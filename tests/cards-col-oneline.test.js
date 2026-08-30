'use strict';
/* 표 칸은 «한 줄»이다 — 좁혀도 두 줄로 접히지 않는다 (대표 지시 2026-08-30)
   ═══════════════════════════════════════════════════════════════════════════
   ■ 대표 지시
     「상호 좌우 넓이 1CM 줄여달라. 그리고 줄이더라도 2줄로 만들지 말라」

   ■ 무엇이 문제였나
     값 칸(#pcTable td)에는 한 줄 고정(nowrap)과 말줄임이 이미 걸려 있었다.
     그런데 «머리글»(#pcTable thead th)에는 아무것도 없었다 — 폭을 줄이면
     「사업자번호」·「서류이름」 같은 이름표가 두 줄로 접힌다. 머리글 한 줄이 접히면
     머리 칸 전체가 높아져 표 맨 윗줄만 도드라진다.
     지금까지 안 드러난 것은 칸이 넉넉했기 때문일 뿐이다 — 좁히는 순간 드러난다.

   ■ 어떻게 했나
     · 머리글에도 한 줄 고정과 말줄임을 건다. 온전한 이름표는 어차피 짧아 거의
       안 잘리고, 잘려도 칸 너비를 끌어 넓힐 수 있다.
     · 상호 폭은 calc(19% - 1cm) 로 둔다 — «어느 화면에서든 정확히 1cm» 좁다.
       퍼센트만 고치면 화면 폭에 따라 줄어드는 양이 달라져 지시와 안 맞는다.

   ★ 여기서 못 박는 것
     ① 값 칸이 한 줄이다 (이미 있던 규칙 — 지우지 못하게)
     ② 머리글도 한 줄이다
     ③ 상호 폭이 «1cm 만큼» 좁다 — 화면이 바뀌어도 그 양이 그대로다
     ④ 상호가 여전히 «가장 넓은» 글자 칸이다 — 이름이 잘리면 못 읽는다
   실행: node --test tests/cards-col-oneline.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

/* 이름표(selector)로 CSS 규칙 덩어리를 떠 온다 — 주석은 걷어 낸다 */
function rule(sel){
  const noCmt = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g');
  const hits = [...noCmt.matchAll(re)].map(m => m[1]);
  assert.ok(hits.length, sel + ' 규칙을 찾을 수 없습니다');
  return hits.join(';');
}

/* ══════ ①② 한 줄 ══════ */

test('★ 값 칸이 한 줄이다 — 두 줄이 되면 그 줄만 높아져 표가 들쭉날쭉해진다', () => {
  const css = rule('#pcTable td');
  assert.match(css, /white-space\s*:\s*nowrap/, '★ 한 줄 고정이 풀렸다');
  assert.match(css, /text-overflow\s*:\s*ellipsis/, '넘치면 …로 잘라야 옆 칸을 안 밀어낸다');
});

test('★ 머리글도 한 줄이다 — 좁히면 「사업자번호」가 두 줄로 접힌다', () => {
  const css = rule('#pcTable thead th');
  assert.match(css, /white-space\s*:\s*nowrap/,
    '★ 머리글이 접히면 머리 칸 전체가 높아져 표 맨 윗줄만 도드라진다');
  assert.match(css, /text-overflow\s*:\s*ellipsis/,
    '넘치면 …로 잘라야 이름표가 옆 칸을 밀지 않는다');
});

/* ══════ ③ 1cm 만큼 좁다 ══════ */

/* ⚠ 2026-08-30 에 대표가 «한 번 더» 줄이라 하셨다(「상호 좌우 너무 넓다」).
     19% → 16.7%(1cm) → 15%. 값을 못 박지 않고 «19% 로 안 돌아갔는가»만 본다 —
     또 줄이라 하실 때 이 검사가 멀쩡히 걸리지 않게.
   ⚠ calc(19% - 1cm) 로 두었다가 되돌렸다. <col> 에서는 엉뚱하게 풀려 270px 이어야 할
     칸이 375px 로 «오히려 넓어졌다»(실측). 되살리지 말 것. */
test('★ 상호가 좁아진 채로 있다 — 19% 로 되돌아가지 않았다', () => {
  const w = src.match(/^const COL_DEFAULT_W = \{[\s\S]*?^\};$/m);
  assert.ok(w, 'COL_DEFAULT_W 를 찾을 수 없습니다');
  const biz = w[0].slice(w[0].indexOf('biz:'));
  const m = biz.match(/company\s*:\s*'([^']*)'/);
  assert.ok(m, '사업자 탭 상호 폭을 찾을 수 없습니다');
  assert.doesNotMatch(m[1], /calc/,
    '★ <col> 에서 calc 는 엉뚱하게 풀린다 — 좁히려다 오히려 넓어졌다');
  const pct = Number((m[1].match(/([\d.]+)%/) || [])[1]);
  assert.ok(pct > 0 && pct <= 17.0,
    '★ 상호 폭이 ' + m[1] + ' 다 — 19% 로 되돌아갔습니다(줄이라는 지시가 두 번 있었다)');
});

/* ══════ ④ 그래도 상호가 가장 넓다 ══════ */

test('★ 상호가 여전히 가장 넓은 글자 칸이다 — 회사 이름이 잘리면 못 읽는다', () => {
  const w = src.match(/^const COL_DEFAULT_W = \{[\s\S]*?^\};$/m)[0];
  const biz = w.slice(w.indexOf('biz:'));
  const pct = k => { const m = biz.match(new RegExp(k + "\\s*:\\s*'(?:calc\\()?([\\d.]+)%"));
                     return m ? Number(m[1]) : 0; };
  const 상호 = pct('company');
  ['ceo', 'bizno', 'docName', 'bizType', 'bizItem'].forEach(k => {
    assert.ok(상호 > pct(k),
      '★ 상호(' + 상호 + '%)가 「' + k + '」(' + pct(k) + '%)보다 좁다 — 이름이 먼저 잘린다');
  });
});
