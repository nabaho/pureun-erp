'use strict';
/* 규정관리 — 두 판이 «창을 채운다».

   두 판의 높이가 못박혀 있었다: .preview 는 max-height 560px, .findings 는 470px.
   창 크기와 아무 상관이 없으니 두 탈이 한꺼번에 났다.

     · 창이 낮으면 — 판 바닥이 화면 밖으로 밀린다. 832px 창에서 페이지가 959px 이라
       127px 이 넘쳤고, 정작 «일을 끝내는» 〔보관함에 저장〕〔✅ 검토 완료〕가 잘려
       스크롤해야 눌렀다.
     · 창이 높으면 — 목록이 470px 에서 끊겨 아래가 텅 빈다.

   맞는 모습은 하나다: 판이 창을 채우고, 넘치는 것은 목록만 판 «안에서» 구른다.
   (.preview·.findings 는 이미 overflow:auto 다 — 안에서 구를 채비는 되어 있었다.)

   ⚠ 자바스크립트로 «재서» 맞추지 않는다. 먼저 그렇게 만들어 봤다 — fitGrid() 로
     창 높이를 재고 resize 와 ResizeObserver 로 다시 재게 했는데, 브라우저에서
     창을 키워도 그 둘이 «오지 않아» 판이 처음 잰 높이 그대로 남았다.
     흐름만 정해 두면 높이는 브라우저가 알아서 낸다 — 잴 일도, 다시 잴 일도 없다.

   실행: node --test tests/rules-fit-height.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'rules.html'), 'utf8').replace(/\r\n/g, '\n');

/* 창을 채우는 대목(미디어쿼리 한 덩어리)만 잘라 온다 */
function fillBlock() {
  const at = src.search(/@media\s+screen\s+and\s*\(min-width:\s*901px\)\s*\{/);
  assert.ok(at >= 0,
    '창을 채우는 대목이 없습니다 — 넓은 화면에서만 걸어야 합니다(900px 이하는 두 판이 쌓입니다)');
  let d = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(at, i + 1); }
  }
  throw new Error('대목의 끝을 못 찾음');
}

/* 어떤 규칙 본문(선택자가 여러 곳이면 첫 번째) */
function rule(selector, scope) {
  const s = scope || src;
  const at = s.search(new RegExp('(^|[\\n{;])\\s*' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{'));
  assert.ok(at >= 0, selector + ' 규칙이 없습니다');
  return s.slice(s.indexOf('{', at) + 1, s.indexOf('}', s.indexOf('{', at)));
}

test('★ 창을 채우는 대목은 «화면 전용»이다 — 인쇄까지 창 높이에 묶으면 뒷장이 잘린다', () => {
  assert.match(src, /@media\s+screen\s+and\s*\(min-width:\s*901px\)/,
    'screen 을 안 붙이면 인쇄할 때 한 쪽만 나오고 나머지가 잘립니다');
});

test('★ 900px 이하에서는 채우지 않는다 — 그때는 두 판이 위아래로 쌓인다', () => {
  assert.match(src, /@media\(max-width:900px\)\{\.grid\{grid-template-columns:1fr\}/,
    '쌓이는 규칙이 사라졌습니다 — 채우는 조건(901px)의 근거가 없어집니다');
});

test('★ 세로 흐름이 창까지 이어진다 — body → .wrap → .grid', () => {
  const b = fillBlock();
  assert.match(rule('body', b), /display:\s*flex/, 'body 가 세로 흐름이 아닙니다');
  assert.match(rule('body', b), /flex-direction:\s*column/);
  assert.match(rule('.wrap', b), /flex:\s*1/, '.wrap 이 남는 자리를 안 받습니다');
  assert.match(rule('.grid', b), /flex:\s*1/, '.grid 가 남는 자리를 안 채웁니다');
});

test('★★ body 높이는 «정해진» 높이여야 한다 — min-height 만으로는 안 된다', () => {
  /* 처음에 min-height:100dvh 로 했다가 페이지가 5014px 로 늘어났다.
     min-height 만 주면 높이가 «내용대로» 정해져, flex:1 이 나눌 남는 자리가 없다. */
  const body = rule('body', fillBlock());
  assert.match(body, /(^|;)\s*height:\s*100(v|d)h/,
    'body 에 정해진 높이가 없습니다 — flex:1 이 나눌 자리가 없어 판이 내용대로 늘어납니다: ' + body);
});

test('★ 흐름 중간이 «줄어들 수» 있다 — min-height:0 이 없으면 flex 는 안 줄인다', () => {
  const b = fillBlock();
  assert.match(rule('.wrap', b), /min-height:\s*0/);
  assert.match(rule('.grid', b), /min-height:\s*0/);
  ['.preview', '.findings'].forEach((s) =>
    assert.match(rule(s), /min-height:\s*0/,
      s + ' 에 min-height:0 이 없으면 목록이 판 밖으로 삐져나옵니다'));
});

test('★ 넓은 화면에서는 못박은 목록 높이를 푼다', () => {
  const b = fillBlock();
  assert.match(b, /\.preview[^{]*,[^{]*\.findings[^{]*\{[^}]*max-height:\s*none|\.findings[^{]*,[^{]*\.preview[^{]*\{[^}]*max-height:\s*none/,
    '못박은 높이를 안 풀면 창을 채워도 목록이 470px 에서 끊깁니다');
});

test('★ 판에 «바닥»이 있다 — 창이 너무 낮아도 뭉개지지 않는다', () => {
  assert.match(rule('.grid .pane', fillBlock()), /min-height:\s*\d+px/,
    '창이 아주 낮으면 판이 0 에 가깝게 줄어 아무것도 안 보입니다');
});

test('목록은 여전히 판 «안에서» 구른다 — 페이지가 아니라', () => {
  assert.match(rule('.preview'), /overflow:\s*auto/);
  assert.match(rule('.findings'), /overflow:\s*auto/);
});

test('판을 채우는 얼개는 그대로다 — 머리줄·목록·바닥 단추 세로 배치', () => {
  const p = rule('.pane');
  assert.match(p, /display:\s*flex/);
  assert.match(p, /flex-direction:\s*column/);
  ['.preview', '.findings'].forEach((c) =>
    assert.match(rule(c), /flex:\s*1/, c + ' 이 남는 자리를 채워야 합니다'));
});

test('바닥 단추와 판은 그대로 있다 — 채웠다고 없앤 것이 아니다', () => {
  ['right-pane', 'grid', 'findings', 'mk-daejo', 'save', 'save-done']
    .forEach((id) => assert.match(src, new RegExp('id="' + id + '"'), id + ' 이 없어졌습니다'));
});
