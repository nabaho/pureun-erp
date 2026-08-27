'use strict';
/* 기업 상세가 «아래로 안 내려가던» 까닭 — 인라인 display 가 CSS 를 이겼다
   ═══════════════════════════════════════════════════════════════════════════
   대표 보고 2026-08-27: 「왜 기업상세만 들어오면 화면이 아래로 내려가지 않나
   아래로 내려가서 검토해야하는데 안된다」

   ■ 무엇이 문제였나
     2026-08-26 에 쪽넘김을 화면 바닥에 고정하려고 #pcCo 를 두 칸으로 갈랐다 —
     구르는 칸(.cobody) + 안 구르는 바닥(.cofoot). 그 CSS 가
       #pcCo.cosplit{display:flex;flex-direction:column;overflow:hidden}
       #pcCo.cosplit>.cobody{flex:1 1 auto;min-height:0;overflow:auto}
     인데, 화면을 갈아 끼우는 곳에서 «인라인»으로 display:block 을 박고 있었다.
     인라인은 CSS 를 이긴다. 그래서 세로 flex 가 풀리고
       · .cobody 의 flex:1 1 auto 가 죽어 높이가 «내용만큼» 늘고(200줄 ≈ 29,000px)
       · .cosplit 의 overflow:hidden 이 그것을 그냥 잘라 — 구를 것이 없으니 휠도 안 먹고
       · 바닥 쪽넘김은 29,000px 아래로 밀려 화면에서 사라진다.
     재 봤다(창 900px): block 이면 「구를 수 있나 = 아니오」, flex 면 572px 칸이 생긴다.

   ■ 왜 «지난번» 고침으로 안 잡혔나
     8/27 에 같은 증상(「화면 멈췄다」)을 고쳤는데, 그때 까닭은 상세 패널의 투명한
     덮개가 휠을 막던 것이었다. 그것도 진짜 원인이었지만 «이것은 다른 원인»이다 —
     한 증상에 원인이 둘이었고, 하나를 고치고 다 고친 줄 알았다.

   ★ 여기서 못 박는 것
     ① #pcCo 를 보이게 할 때 넣는 display 가 «CSS 가 바라는 것»과 같아야 한다
       (한쪽만 고치면 조용히 다시 안 구른다 — 아무 오류도 안 난다)
     ② 구르는 칸과 안 구르는 바닥이 그대로 있다
     ③ 같은 자리의 다른 화면(설정·자료함·메일)은 건드리지 않았다
   실행: node --test tests/cards-co-scroll-display.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

/* CSS 가 #pcCo.cosplit 에 바라는 display 를 읽어 온다 */
function wantedDisplay(){
  const m = src.match(/#pcCo\.cosplit\{([^}]*)\}/);
  assert.ok(m, '#pcCo.cosplit 규칙을 찾지 못했습니다 — 두 칸 나누기가 사라졌나?');
  const d = m[1].match(/display:\s*([a-z-]+)/);
  assert.ok(d, '#pcCo.cosplit 에 display 가 없습니다');
  return d[1];
}
/* 화면을 갈아 끼울 때 #pcCo 에 넣는 display 를 읽어 온다 */
function setDisplay(){
  const m = src.match(/\$\('pcCo'\)[^\n]*\n?[^\n]*?co\.style\.display\s*=\s*isCo\s*\?\s*'([a-z-]+)'/);
  assert.ok(m, "#pcCo 를 보이게 하는 자리를 찾지 못했습니다");
  return m[1];
}

test('★ 보이게 할 때 넣는 display 가 CSS 가 바라는 것과 «같다»', () => {
  /* 이 둘이 어긋나면 기업 상세가 조용히 안 구른다 — 오류도 안 나고 화면만 굳는다.
     인라인 display 는 CSS 를 이기므로, CSS 를 grid 로 바꾸든 무엇으로 바꾸든
     이 자리도 함께 따라와야 한다. */
  assert.equal(setDisplay(), wantedDisplay(),
    '★ 인라인 display 가 #pcCo.cosplit 의 display 를 덮어써서 세로 flex 가 풀린다 — '
    + '.cobody 가 내용만큼 늘어나고 overflow:hidden 에 잘려 «아래로 내려가지 않는다»');
});

test('★ block 으로 되돌아가지 않는다 — 이것이 2026-08-27 대표 보고의 까닭이다', () => {
  assert.notEqual(setDisplay(), 'block',
    '★ block 이면 .cobody 의 flex:1 1 auto 가 죽는다 (창 900px 에서 재 봄: 안 구름)');
});

test('구르는 칸과 안 구르는 바닥이 그대로 있다', () => {
  assert.match(src, /#pcCo\.cosplit>\.cobody\{[^}]*overflow:auto/,
    '구르는 칸이 사라졌다');
  assert.match(src, /#pcCo\.cosplit>\.cobody\{[^}]*min-height:0/,
    '★ min-height:0 이 없으면 flex 자식이 내용만큼 최소 높이를 가져 안 줄어든다');
  assert.match(src, /#pcCo\.cosplit>\.cofoot\{[^}]*flex:none/,
    '바닥이 함께 굴러가 버린다');
});

test('.cosplit 은 그릴 때 실제로 붙는다 — CSS 만 있고 안 붙으면 아무 일도 안 한다', () => {
  const at = src.indexOf('function renderCoPage');
  const fn = src.slice(at, src.indexOf('\nfunction ', at + 20));
  assert.match(fn, /classList\.add\('cosplit'\)/);
  assert.match(fn, /class="cobody"/);
  assert.match(fn, /class="cofoot"/);
});

test('같은 자리의 다른 화면은 건드리지 않았다 — 그쪽은 제 몸에 overflow:auto 를 쓴다', () => {
  ['pcSettings', 'pcMat', 'pcMail'].forEach(function (id) {
    const m = src.match(new RegExp("\\$\\('" + id + "'\\);?\\s*if\\(\\w+\\) \\w+\\.style\\.display = \\w+ \\? '([a-z-]+)'"));
    assert.ok(m, id + ' 를 보이게 하는 자리를 찾지 못했습니다');
    assert.equal(m[1], 'block', id + ' 는 하던 대로 block 이어야 한다');
  });
  assert.match(src, /#pcSettings,#pcMat,#pcCo,#pcMail\{[^}]*overflow:auto/);
});
