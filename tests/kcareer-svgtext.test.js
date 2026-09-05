/* 경력관리 — 「글자가 살아 있는 PDF」의 밑돌 (2026-09-05)

   ■ 무엇이 문제였나
     PDF가 캔버스 «그림»이었다 — 글자 복사도 검색도 안 되고 용량이 컸다.
     한글 엔진(rhwp)의 renderPageSvg 는 진짜 <text> 를 준다
     (실측 2026-09-05: text 100개 · path 0개 · image 0개). 그것을 인쇄하면 된다.

   ■ 그런데 «한 글자에 <text> 하나»다
     실측: 「위와 같이」가 위(x106.13) 와(119.07) 같(138.67) … 로 낱낱이 온다.
     띄어쓰기는 SVG 에 아예 없고 «자리 간격»으로만 남는다.
     그래서 낱글자를 되붙이고, 벌어진 자리에는 공백을 되살린다.

   ⚠ 자리는 x 목록으로 «글자마다» 지킨다 — 모양이 한 픽셀도 움직이면 안 된다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/kcareer-svgtext.js');

/* 실측값 그대로 쓴 조각 만들기 (글자크기 13.333…, 한글 한 칸 = 12.93) */
const FF = 'font-family="함초롬바탕" font-size="13.333333333333334" font-weight="normal" fill="#000000"';
function g(x, ch, extra) {
  return '<text x="' + x + '" y="314.93" ' + (extra || FF) + '>' + ch + '</text>';
}

test('★★ 낱글자를 한 덩어리로 되붙인다 — 검색·복사가 되어야 한다', () => {
  const svg = '<svg>' + g(106.13, '위') + g(119.07, '와') + '</svg>';
  const out = S.mergeGlyphs(svg);
  assert.equal((out.match(/<text/g) || []).length, 1, '두 글자가 하나로 묶여야 합니다');
  assert.match(out, />위와</);
});

test('★★ 자리는 글자마다 그대로 — 모양이 움직이면 안 된다', () => {
  const svg = '<svg>' + g(106.13, '위') + g(119.07, '와') + '</svg>';
  const out = S.mergeGlyphs(svg);
  assert.match(out, /x="106\.13 119\.07"/, '★ x 를 하나로 뭉개면 글자가 겹칩니다');
});

test('★★ 없어진 띄어쓰기를 되살린다 — SVG 에는 공백이 아예 없다', () => {
  /* 실측: 와(119.07) → 같(138.67). 한글 한 칸은 13.33 인데 19.6 벌어져 있다 = 공백 */
  const svg = '<svg>' + g(106.13, '위') + g(119.07, '와') + g(138.67, '같') + g(151.6, '이') + '</svg>';
  const out = S.mergeGlyphs(svg);
  assert.match(out, />위와 같이</, '벌어진 자리에 공백이 들어가야 합니다');
});

test('★ 붙어 있는 글자에는 공백을 «만들지» 않는다', () => {
  /* 없는 공백을 지어내는 쪽이 더 나쁘다 — 「권 형 하」로 검색이 빗나간다 */
  const svg = '<svg>' + g(106.13, '권') + g(119.06, '형') + g(131.99, '하') + '</svg>';
  assert.match(S.mergeGlyphs(svg), />권형하</);
});

test('★ 영문도 같은 자로 — 좁은 글자에 공백을 지어내지 않는다', () => {
  /* 실측: E(291.88) n(300.76) g(307.97) l(315.19) i(319.07) s(322.95) h(329.61) → 「English」
     그 뒤 t(343.49) 는 13.88 벌어져 있다 = 공백 */
  const xs = [291.88, 300.76, 307.97, 315.19, 319.07, 322.95, 329.61, 343.49, 348.49, 355.71, 363.48];
  const cs = 'Englishtext'.split('');
  const svg = '<svg>' + xs.map((x, i) => g(x, cs[i])).join('') + '</svg>';
  const out = S.mergeGlyphs(svg);
  assert.match(out, />English text</);
});

test('★★ 칸이 바뀌면 끊는다 — 남의 칸 글자를 붙이면 안 된다', () => {
  /* 한글 엔진은 표 칸마다 <g clip-path> 를 따로 만든다(실측: cell-clip-12·16·19…).
     사이에 태그가 끼면 거기서 끊어야 「성명권형하」처럼 붙지 않는다. */
  const svg = '<svg><g id="a">' + g(10, '성') + g(23, '명') + '</g><g id="b">' + g(200, '권') + g(213, '하') + '</g></svg>';
  const out = S.mergeGlyphs(svg);
  assert.equal((out.match(/<text/g) || []).length, 2, '칸마다 하나씩이어야 합니다');
  assert.match(out, />성명</);
  assert.match(out, />권하</);
});

test('★ 서식이 다르면 끊는다 — 굵은 글자와 보통 글자가 한 덩어리가 되면 모양이 바뀐다', () => {
  const bold = 'font-family="함초롬바탕" font-size="13.333333333333334" font-weight="bold" fill="#000000"';
  const svg = '<svg>' + g(10, '가') + g(23, '나', bold) + '</svg>';
  assert.equal((S.mergeGlyphs(svg).match(/<text/g) || []).length, 2);
});

test('★ 줄이 다르면 끊는다', () => {
  const svg = '<svg>' + g(10, '가') + '<text x="10" y="330" ' + FF + '>나</text></svg>';
  assert.equal((S.mergeGlyphs(svg).match(/<text/g) || []).length, 2);
});

test('★ 글자가 아닌 것은 손대지 않는다 — 표 선·네모는 그대로', () => {
  const svg = '<svg><rect x="1" y="2" width="3" height="4"/><line x1="0" y1="0" x2="9" y2="9"/></svg>';
  assert.equal(S.mergeGlyphs(svg), svg);
});

test('★ &·< 를 다시 새지 않게 감싼다', () => {
  /* 10 + 좁은 글자 너비(6.67) = 16.67 — 딱 붙어 있어 공백이 끼지 않는 자리 */
  const svg = '<svg>' + g(10, '&amp;') + g(16.67, '가') + '</svg>';
  const out = S.mergeGlyphs(svg);
  assert.match(out, />&amp;가</, '★ 풀어 쓴 채로 두면 SVG 가 깨집니다');
});

test('★★ 인쇄 문서는 A4 한 장에 한 쪽 — 여백을 주면 두 장으로 넘친다', () => {
  /* SVG 자체가 이미 A4(793.7×1122.5px = 210×297mm @96dpi)다. */
  const html = S.printHtml(['<svg>1</svg>', '<svg>2</svg>'], '시험');
  assert.match(html, /@page\{size:A4;margin:0\}/);
  assert.match(html, /page-break-after:always/);
  assert.ok(html.indexOf('page-break-after:auto') > 0, '마지막 쪽 뒤에 빈 장이 남으면 안 됩니다');
  assert.equal((html.match(/<svg>/g) || []).length, 2);
});

test('★ 자리 숫자를 짧게 — 원본은 106.13333333333334 처럼 길어 파일만 불어난다', () => {
  const svg = '<svg>' + g(106.13333333333334, '위') + g(119.06666666666668, '와') + '</svg>';
  assert.match(S.mergeGlyphs(svg), /x="106\.13 119\.07"/);
});

/* ═══ 띄어쓰기는 «짐작»이 아니라 엔진의 정답으로 (2026-09-05) ═══
   ⚠ 간격으로 짐작하면 틀린다 — 실측: 「1970- 01- 01」·「041- 000- 0000」.
     붙임표(-)는 textLength 가 없고 실제 너비가 넓어 벌어져 보인다.
     마침표(.)와 붙임표(-)의 벌어짐이 10.55 대 11.1 로 거의 같은데 한쪽만 공백이다
     — 간격만 보고는 절대 못 가른다.
   그래서 getPageTextLayout 이 주는 «띄어쓰기가 들어 있는 원문 + 글자별 자리»를 쓴다. */

test('★★ charX 는 줄 왼쪽 끝에서부터의 거리다 — run.x 를 더해야 한다', () => {
  /* 실측 2026-09-05: 첫 토막이 x:96.0 인데 charX:[0.0] 이었다.
     그대로 쓰면 자리가 한 글자도 안 맞아 띄어쓰기가 «통째로» 사라진다(실제로 겪었다). */
  const layout = { runs: [{ text: '가 나', x: 100, y: 10, charX: [0, 13, 20, 33] }] };
  assert.deepEqual(S.spaceStops(layout), [120], '100 + 20 이어야 합니다');
});

test('★★ 공백이 «토막 끝»에 있으면 다음 토막 첫 글자를 짚는다', () => {
  /* 글꼴이 바뀌는 자리에서 토막이 갈린다 — 실측: 「…동의합니다. 」 / 「English…」.
     이 경우를 안 보면 그 공백이 사라진다. */
  const layout = { runs: [
    { text: '다. ', x: 100, y: 10, charX: [0, 13, 20, 27] },
    { text: 'En', x: 130, y: 10, charX: [0, 9, 16] }
  ] };
  assert.deepEqual(S.spaceStops(layout), [130]);
});

test('★ 다음 줄로 넘어가면 짚지 않는다 — 남의 줄에 공백이 생긴다', () => {
  const layout = { runs: [
    { text: '가 ', x: 100, y: 10, charX: [0, 13, 20] },
    { text: '나', x: 100, y: 30, charX: [0, 13] }
  ] };
  assert.deepEqual(S.spaceStops(layout), []);
});

test('★★ 정답을 주면 짐작하지 않는다 — 붙임표 뒤에 없는 공백을 만들지 않는다', () => {
  /* 실측 자리: 0(556.25) -(564.03) 0(575.13). 간격만 보면 공백처럼 보이지만 아니다. */
  const svg = '<svg>' + g(556.25, '0') + g(564.03, '-') + g(575.13, '0') + '</svg>';
  assert.match(S.mergeGlyphs(svg, { spaceBefore: [] }), />0-0</, '★ 「0- 0」이 되면 안 됩니다');
  assert.match(S.mergeGlyphs(svg), />0- 0</, '정답이 없을 때만 간격으로 짐작합니다');
});

test('★ 정답이 가리키는 자리에는 공백을 넣는다', () => {
  const svg = '<svg>' + g(100, '가') + g(120, '나') + '</svg>';
  assert.match(S.mergeGlyphs(svg, { spaceBefore: [120] }), />가 나</);
});

test('★ 자리는 소수 한 자리까지만 맞으면 같은 자리 — 배치표는 반올림해 온다', () => {
  /* 실측: 배치표 532.9 ↔ SVG 532.93. 글자 사이는 3.88 이상이라 헷갈리지 않는다. */
  const svg = '<svg>' + g(100, '가') + g(120.03, '나') + '</svg>';
  assert.match(S.mergeGlyphs(svg, { spaceBefore: [120.0] }), />가 나</);
});

test('★★ 묶을 때 textLength 를 떼어 낸다 — 남기면 글자가 찌그러진다', () => {
  /* 실측 2026-09-05: 남겨 두었더니 숫자 「1」의 너비가 7.77 → 1.94 로 눌렸다.
     한 글자 너비 안에 줄 전체를 밀어 넣으려 들기 때문이다.
     떼어도 자리는 x 목록으로 글자마다 박혀 있어 밀리지 않는다(실측: 자리 어긋남 0자). */
  const a = 'font-family="함초롬바탕" font-size="13.333333333333334" fill="#000000" textLength="7.7733" lengthAdjust="spacingAndGlyphs"';
  const b = 'font-family="함초롬바탕" font-size="13.333333333333334" fill="#000000" textLength="3.8800" lengthAdjust="spacingAndGlyphs"';
  const svg = '<svg>' + g(100, '1', a) + g(107.77, '.', b) + '</svg>';
  const out = S.mergeGlyphs(svg, { spaceBefore: [] });
  assert.equal((out.match(/<text/g) || []).length, 1, '★ 낱글자 너비가 다르다고 갈라지면 안 됩니다');
  assert.doesNotMatch(out, /textLength/);
  assert.doesNotMatch(out, /lengthAdjust/);
});
