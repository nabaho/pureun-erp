/* 상단 탭·틀 고정 (대표 지시 2026-09-02)
   「상단 탭 고정 필요하다」 · 「상단 틀 고정필요하다 피시도 같다」

   무엇이 문제였나 — 굴려 내려가면 «갈래를 바꾸는 자리»가 사라졌다.
     · 홈페이지 관리: 자문사 373줄을 굴리면 갈래 카드가 사라져, 다른 갈래로 가려면
       맨 위까지 되올라가야 했다.
     · 뉴스레터 관리: 기사 31건·받는 명단 수백 줄에서 탭이 사라졌다. PC 도 같다.

   ★ 실측하며 «진짜 원인»을 하나 찾았다 (2026-09-02):
     홈페이지 관리에서 sticky 를 적어 두어도 카드가 그냥 흘러갔다(top:-28px).
     .app 이 overflow:hidden 이라, 그 «안»의 sticky 는 페이지 스크롤을 못 따라간다.
     ⚠ 적어 두었는데 안 듣는 규칙은 «없는 것보다 나쁘다» — 고친 줄 알고 넘어간다.

   지키는 규칙:
     ① 뉴스레터 탭은 붙어 있다 — 폰·PC 를 가리지 않는다
     ② 머리줄까지 붙이지는 않는다 — 둘 다 붙이면 화면 위 95px 가 사라진다
     ③ 홈페이지 관리의 갈래 카드는 눕는 화면에서 붙는다
     ④ ★ 그 위에 overflow:hidden 이 없다 — 있으면 ③이 «적혀만 있고 안 듣는다»
     ⑤ ★ 기둥(.rail)을 풀어 둔다 — 부모가 목록 앞에서 끝나면 카드가 거기서 떨어진다
   실행: node --test tests/top-bar-sticky.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const 읽기 = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* 선택자의 규칙 덩어리를 떼어 온다 (media query 밖의 «바탕» 규칙) */
function 규칙(src, 선택자) {
  const at = src.indexOf(선택자 + '{');
  assert.ok(at > 0, 선택자 + ' 규칙이 없습니다');
  return src.slice(at, src.indexOf('}', at)).replace(/\s+/g, '');
}

/* ── ① ② 뉴스레터 관리 ── */
test('★ 뉴스레터 탭이 화면 위에 붙어 있다', () => {
  const r = 규칙(읽기('pu-news.html'), '#tabs');
  assert.match(r, /position:sticky/, '★ 굴려 내려가면 탭이 사라집니다');
  assert.match(r, /top:0/, '붙는 자리를 안 정했습니다');
  assert.match(r, /z-index:\d+/, '겹치면 목록에 가립니다');
  assert.match(r, /background:#fff/, '바탕이 없으면 글이 비쳐 겹칩니다');
});

test('★ 폰·PC 를 가리지 않는다 — 대표 지시 「피시도 같다」', () => {
  const src = 읽기('pu-news.html');
  const at = src.indexOf('#tabs{');
  /* 이 규칙이 @media 안에 들어가 있으면 한쪽에서만 듣는다 */
  const 앞 = src.slice(0, at);
  const 마지막미디어 = 앞.lastIndexOf('@media');
  if (마지막미디어 >= 0) {
    const 닫힘 = 앞.lastIndexOf('\n}');
    assert.ok(닫힘 > 마지막미디어,
      '★ 탭 고정이 @media 안에 있습니다 — 한쪽 화면에서만 듣습니다');
  }
});

test('머리줄까지 붙이지는 않는다 — 둘 다 붙이면 화면 위가 통째로 사라진다', () => {
  const r = 규칙(읽기('pu-news.html'), '#bar');
  assert.ok(!/position:sticky/.test(r),
    '머리줄(로고·계정)은 늘 볼 까닭이 없습니다 — 탭만 붙입니다');
});

/* ── ③ ④ ⑤ 홈페이지 관리 ── */
function 눕는화면() {
  const src = 읽기('pu-home.html');
  const at = src.indexOf('@media(max-width:900px){');
  assert.ok(at > 0, '기둥을 눕히는 구간이 사라졌습니다');
  let 깊이 = 0, i = src.indexOf('{', at);
  const 시작 = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') 깊이++;
    else if (src[i] === '}') { 깊이--; if (!깊이) break; }
  }
  return src.slice(시작 + 1, i);
}

test('★ 갈래 카드가 눕는 화면에서 위에 붙는다', () => {
  const 안 = 눕는화면();
  const at = 안.indexOf('.dash{');
  assert.ok(at > 0, '갈래 카드 규칙이 없습니다');
  const r = 안.slice(at, 안.indexOf('}', at)).replace(/\s+/g, '');
  assert.match(r, /position:sticky/, '★ 굴려 내려가면 갈래를 바꿀 길이 사라집니다');
  assert.match(r, /top:0/);
  assert.match(r, /background:/, '바탕이 없으면 목록이 카드 사이로 비칩니다');
});

test('★★ 붙는 것을 막는 overflow:hidden 이 위에 없다 — 있으면 «적혀만 있고 안 듣는다»', () => {
  const 안 = 눕는화면();
  const at = 안.indexOf('.app{');
  assert.ok(at > 0, '★ 눕는 화면에서 .app 을 안 풀어 두었습니다');
  const r = 안.slice(at, 안.indexOf('}', at)).replace(/\s+/g, '');
  assert.match(r, /overflow:visible/,
    '★★ .app 이 hidden 이면 그 안의 sticky 는 페이지 스크롤을 못 따라갑니다 — '
    + '2026-09-02 에 실제로 카드가 top:-28px 로 흘러갔습니다');
});

test('★ 기둥을 풀어 둔다 — 부모가 목록 앞에서 끝나면 거기서 떨어진다', () => {
  const 안 = 눕는화면();
  const at = 안.indexOf('.rail{');
  assert.ok(at > 0, '기둥 규칙이 없습니다');
  const r = 안.slice(at, 안.indexOf('}', at)).replace(/\s+/g, '');
  assert.match(r, /display:contents/,
    '★ 기둥이 상자로 남아 있으면 카드가 «목록에 닿기도 전에» 떨어집니다');
});

test('붙인 뒤에도 화면 위를 너무 먹지 않는다 — 라벨은 안 붙인다', () => {
  const 안 = 눕는화면();
  const at = 안.indexOf('.rail .rh{');
  if (at > 0) {
    const r = 안.slice(at, 안.indexOf('}', at)).replace(/\s+/g, '');
    assert.ok(!/position:sticky/.test(r),
      '「무엇을 볼까」는 이름표일 뿐인데 22px 를 늘 먹습니다');
  }
});
