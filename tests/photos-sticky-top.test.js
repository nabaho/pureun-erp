/* 사진첩 윗줄 — 도구줄 «위»로 사진이 지나가지 않는다
   대표 지적 2026-08-30: 「상단 화면 이상하다 체크뒤에사진이 나온다 깔끔하게」

   무슨 일이었나:
     폰에서는 분류 탭(#kinds)을 아예 감춘다(display:none, 대표 지시 2026-08-10).
     그러면 높이가 0 인데, 재는 함수가 `if (h)` 로 0 을 «못 쟀다»로 보고 값을
     안 바꿨다. 그래서 CSS 기본값 44px 가 남아 도구줄이 44px «아래»에 붙었고,
     그 44px 틈으로 사진이 지나갔다 — 체크 단추 뒤로 사진이 보이던 것이 그것이다.

   지키는 규칙(값이 아니라 뜻):
     ① 잰 높이를 «그대로» 쓴다 — 0 도 참이다
     ② 처음 그릴 때도 잰다 — resize 에만 걸면 창을 안 바꾼 사람은 늘 기본값을 본다
     ③ 붙는 자리를 CSS 에 숫자로 박지 않는다 — 탭이 두 줄이 되는 폰에서 어긋난다
     ④ 폰에서 이 줄이 «윗줄»이므로 경계가 있어야 한다 — 배경만으로는 못 가른다
   실행: node --test tests/photos-sticky-top.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

/* 진짜 함수를 떼어 온다 — 글자만 보면 「고친 척」을 못 가른다 */
function 재는함수() {
  const at = src.indexOf('function syncStickyTop()');
  assert.ok(at > 0, '재는 함수가 사라졌습니다');
  const body = src.slice(at, src.indexOf('\n}', at) + 2);
  const ctx = { 잰것: null, 높이: 0 };
  vm.createContext(ctx);
  vm.runInContext(
    'var document = { documentElement: { style: { setProperty: function(k, v){ 잰것 = v; } } } };\n' +
    'function $(id){ return { getBoundingClientRect: function(){ return { height: 높이 }; } }; }\n' +
    body, ctx);
  return ctx;
}

test('★ 탭이 감춰져 높이가 0 이면 0 으로 붙인다 (0 은 «참»이다)', () => {
  const ctx = 재는함수();
  ctx.높이 = 0;
  vm.runInContext('syncStickyTop()', ctx);
  assert.equal(ctx.잰것, '0px',
    '★ 0 을 «못 쟀다»로 보고 있습니다 — 그 틈으로 사진이 지나갑니다');
});

test('탭이 한 줄이든 두 줄이든 잰 높이를 그대로 쓴다', () => {
  const ctx = 재는함수();
  for (const h of [44, 88, 37.6]) {
    ctx.높이 = h;
    vm.runInContext('syncStickyTop()', ctx);
    assert.equal(ctx.잰것, Math.round(h) + 'px', h + 'px 를 그대로 안 씁니다');
  }
});

test('★ 처음 그릴 때도 잰다 — 창을 안 바꾼 사람도 제자리에 붙는다', () => {
  /* 예전에는 resize 에만 걸려 있어, 창 크기를 한 번도 안 바꾼 사람은
     늘 CSS 기본값을 보고 있었다. 폰 쓰는 사람 대부분이 그렇다. */
  const 첫그림 = src.indexOf('const cameraRequested = openCamIfAsked()');
  assert.ok(첫그림 > 0, '처음 그리는 자리를 못 찾았습니다');
  const 앞 = src.slice(첫그림 - 400, 첫그림);
  assert.match(앞, /syncStickyTop\(\)/,
    '★ 처음 그릴 때 안 재면 CSS 기본값이 그대로 남습니다');
});

test('탭 높이가 바뀌는 순간에도 따라간다', () => {
  assert.match(src, /ResizeObserver\(syncStickyTop\)/,
    '탭이 늘어 두 줄이 되는 때는 resize 로 알 수 없습니다');
  assert.match(src, /addEventListener\('resize', syncStickyTop\)/);
});

test('★ 붙는 자리를 CSS 에 숫자로 박지 않는다', () => {
  const 줄 = src.match(/#gridBar\{position:sticky;top:[^;]+;/);
  assert.ok(줄, '#gridBar 가 더 이상 틀고정이 아닙니다');
  assert.match(줄[0], /top:var\(--kindsH/,
    '★ 숫자를 박으면 탭이 두 줄이 되는 폰에서 도구줄이 탭을 덮습니다');
});

test('폰에서 도구줄이 «윗줄» 노릇을 한다 — 경계와 배경이 있다', () => {
  /* 분류 탭이 감춰지므로 탭이 하던 테두리·아래 여백을 이 줄이 물려받아야 한다.
     배경만 있고 경계가 없으면 사진이 단추 사이로 비치는 것처럼 보인다. */
  /* ⚠ 2026-09-03 다시 겨눔 — 「#kinds,#chipRow 자리에서 3000자 앞」으로 구간을
     찾고 있었다. 그 사이에 규칙을 몇 줄만 더해도 창이 어긋나 «엉뚱한 데»를 본다
     (실제로 그렇게 깨졌다). 중괄호 짝을 세어 구간을 정확히 떼어 온다. */
  /* ⚠ 820px 구간은 «셋»이다 — 첫 번째를 잡으면 74자짜리 엉뚱한 덩이를 본다.
     감추는 규칙이 든 «그» 구간을 뒤로 되짚어 찾는다. */
  const 표시 = src.indexOf('#kinds,#chipRow');
  assert.ok(표시 > 0, '폰에서 분류 탭을 감추는 규칙이 사라졌습니다');
  const at = src.lastIndexOf('@media (max-width:820px){', 표시);
  assert.ok(at > 0, '폰 구간이 없습니다');
  let 깊이 = 0, i = src.indexOf('{', at);
  const 시작 = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') 깊이++;
    else if (src[i] === '}') { 깊이--; if (!깊이) break; }
  }
  const 안 = src.slice(시작 + 1, i);
  assert.match(안, /#kinds[^\n]*display:none!important/,
    '폰에서 분류 탭을 감추는 규칙이 사라졌습니다 — 그러면 이 검사의 전제가 다릅니다');
  assert.match(안, /#gridBar\{[^}]*border-bottom/,
    '도구줄에 경계가 없습니다 — 사진이 그 밑으로 지나갈 때 어디까지가 줄인지 안 보입니다');
  assert.match(src, /#gridBar\{position:sticky[^}]*background:var\(--bg\)/,
    '배경이 없으면 사진이 글씨를 덮습니다');
});
