'use strict';
/* 폰에서 서류가 보이는가 — 실행: node --test tests/*.test.js

   이 함은 카톡 공유와 폰 카메라로 들어오는 것이 대부분이라 폰이 주 화면이다.
   그런데 좁은 화면 규칙이 #viewerShot 을 통째로 감추고 있었다. #viewerShot 은
   원본 사진뿐 아니라 「불러오는 중…」·불러오기 실패 안내·PDF·엑셀의 「새 창에서
   열기」까지 담는 유일한 칸이고, 그 규칙이 .split 밖에 있어 판독 패널이 붙지도
   않는 탭(근로계약서·우리 산출물)에서까지 걸렸다 — 폰에서는 어느 탭이든 빈 화면. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-paydata.html'), 'utf8');

/* 꾸밈(<style>) 만 떼어 온다 — 화면 코드의 글자에 걸리면 안 된다. */
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

/* 조건이 같은 @media 덩어리를 중괄호 짝을 세어 잘라 온다.
   (정규식 하나로는 안쪽 규칙의 } 에서 잘려 엉뚱한 것을 본다) */
function mediaBlocks(cond) {
  const out = [];
  let i = 0;
  while ((i = css.indexOf(cond, i)) >= 0) {
    const open = css.indexOf('{', i + cond.length);
    let depth = 0, k = open;
    for (; k < css.length; k++) {
      if (css[k] === '{') depth++;
      else if (css[k] === '}') { depth--; if (!depth) break; }
    }
    out.push(css.slice(open + 1, k));
    i = k + 1;
  }
  return out;
}

function rulesOf(block) {
  const out = [];
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(block))) out.push({ sel: m[1].trim(), body: m[2].trim() });
  return out;
}

const NARROW = mediaBlocks('@media(max-width:760px)');
const VIEWER_SEL = /#viewerShot|#readPanel|#viewerBody/;

test('좁은 화면 규칙이 있기는 하다', () => {
  assert.ok(NARROW.length, '@media(max-width:760px) 덩어리를 찾을 수 없습니다');
});

test('★ 폰에서 서류 칸을 감추지 않는다 — 감추면 어느 탭이든 빈 화면이 된다', () => {
  const hidden = /#viewerShot[^{}]*\{[^}]*display\s*:\s*none/.test(css);
  assert.equal(hidden, false,
    '#viewerShot 은 사진·「불러오는 중」·실패 안내·PDF 「새 창에서 열기」를 담는 유일한 칸입니다');
});

test('★ 폰 규칙은 판독 패널이 붙은 화면(.split)에만 걸린다', () => {
  NARROW.forEach(block => {
    rulesOf(block).forEach(r => {
      if (!VIEWER_SEL.test(r.sel)) return;   // 좌측 대시보드(.peoplebar) 같은 것은 상관없다
      assert.ok(/\.split/.test(r.sel),
        '「' + r.sel + '」 는 .split 밖까지 걸립니다 — 판독 패널이 없는 근로계약서·우리 산출물 탭의'
        + ' 원본까지 함께 손댑니다');
    });
  });
});

test('★ 폰에서는 좌우로 가르지 않고 위아래로 쌓는다 — 서류와 판독 결과가 둘 다 보인다', () => {
  const stacked = NARROW.some(block => rulesOf(block).some(r =>
    /#viewerBody\.split/.test(r.sel) && /flex-direction\s*:\s*column/.test(r.body)));
  assert.ok(stacked, '한쪽을 감추는 대신 세로로 쌓아야 폰에서 원본을 보면서 값을 고칠 수 있습니다');

  const shot = [];
  NARROW.forEach(b => rulesOf(b).forEach(r => { if (/#viewerShot/.test(r.sel)) shot.push(r.body); }));
  assert.ok(shot.length, '폰에서 서류 칸 높이를 정해 주지 않으면 판독 패널이 화면을 다 차지합니다');
  shot.forEach(b => assert.ok(/flex\s*:/.test(b), '서류 칸 높이(flex)를 정해야 합니다: ' + b));
});

/* @media 덩어리를 다 걷어 낸 기본 규칙만 남긴다 — 여기도 중괄호 짝을 세어야 한다
   (정규식으로 자르면 한 줄짜리 @media 뒤의 멀쩡한 규칙까지 함께 지워진다). */
function baseCss() {
  let out = '', i = 0;
  while (i < css.length) {
    const at = css.indexOf('@media', i);
    if (at < 0) { out += css.slice(i); break; }
    out += css.slice(i, at);
    const open = css.indexOf('{', at);
    let depth = 0, k = open;
    for (; k < css.length; k++) {
      if (css[k] === '{') depth++;
      else if (css[k] === '}') { depth--; if (!depth) break; }
    }
    i = k + 1;
  }
  return out;
}

test('★ 넓은 화면(데스크톱)은 그대로 좌우 절반이다', () => {
  // 미디어 밖 기본 규칙 — 좁은 화면 고치다 데스크톱을 무너뜨리면 안 된다.
  const base = baseCss();
  assert.match(base, /#readPanel\{[^}]*flex:0 0 50%/, '데스크톱 절반 규칙이 사라졌습니다');
  assert.match(base, /#viewerShot\{[^}]*flex:1/, '데스크톱에서 원본이 남은 자리를 채워야 합니다');
});
