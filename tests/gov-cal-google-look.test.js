/* 정부컨설팅 일정관리 캘린더 — 구글 캘린더와 같은 색·글자크기.
   실행: node --test tests/*.test.js

   대표 지시 2026-08-25: "캘린더 안에 색이나 크기 글자크기 숫자 등이 눈에 피로감이 높다.
   구글 캘린더와 같은 색 글자크기 색상넣기 등 완벽하게 일치시켜달라."

   ★ 무엇이 눈을 피로하게 했나 (다섯 가지)
     1) 칸 선·요일 머리가 파란 톤(#b3cde8 · #e3f0fb) — 구글은 중성 회색(#dadce0)
     2) 일정 칩이 «진한 바탕 + 흰 굵은 글자» — 구글은 «연한 바탕 + 진한 글자»
     3) 글자가 굵었다(700~900) — 구글은 500
     4) 일·토·공휴일 «날짜»에 빨강·파랑 — 구글 월 화면은 날짜를 물들이지 않는다
     5) 공휴일·달밖 «칸»에 바탕색 — 구글은 칸을 칠하지 않는다

   ★ 숫자는 짐작이 아니다
     구글 캘린더의 실제 색 짝 아홉 개(Tomato·Flamingo·Banana·Sage·Basil·Peacock·
     Blueberry·Lavender·Graphite)에서 HSL 을 역산했다:
       바탕 L 93%(92~95) · 글자 L 31%(20~41)
     밝기 차는 구글이 5.2~6.7:1 이고, 우리 것도 그 자리에 오게 맞췄다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'gov-consulting.html'), 'utf8').replace(/\r\n/g, '\n');

/* 색 계산 토막만 떼어 온다 */
function load(){
  const i = src.indexOf('function gcalHexToHsl');
  const j = src.indexOf('function chipHtml(sc){');
  assert.ok(i > 0 && j > i, '색 계산 토막을 못찾음');
  const ctx = { Math: Math, parseInt: parseInt, console: console };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j), ctx);
  return ctx;
}
/* CSS 한 규칙의 속성값을 읽는다 (미디어쿼리 밖의 기본 규칙) */
function ruleOf(sel){
  const i = src.indexOf('\n' + sel + '{');
  assert.ok(i > 0, sel + ' 규칙을 못찾음');
  return src.slice(i + sel.length + 2, src.indexOf('}', i));
}

/* ══════ ① 구글이 쓰는 색 ══════ */

test('캘린더 격자에만 구글 색을 씌운다 — 전역 변수는 안 건드린다', () => {
  /* --border·--sf2 는 대시보드·타임라인·팝업이 같이 쓴다. 건드리면 캘린더 밖까지 바뀐다. */
  assert.match(src, /\.mg,\.wg\{--gc-line:#dadce0;--gc-text:#3c4043;--gc-dim:#70757a;--gc-today:#1a73e8;\}/);
  assert.match(src, /--border:#b3cde8/, '전역 테두리색이 바뀌었다 — 캘린더 밖까지 흔든다');
  assert.match(src, /--sf2:#e3f0fb/, '전역 배경색이 바뀌었다');
});

test('칸 선과 요일 머리가 중성 회색이다 — 파란 톤을 뺐다', () => {
  assert.match(ruleOf('.mc'), /border-top:1px solid var\(--gc-line\)/);
  assert.match(ruleOf('.mg-head'), /background:var\(--surface\)/, '요일 머리에 파란 바탕이 남았다');
  assert.ok(!/background:var\(--sf2\)/.test(ruleOf('.mg-head')));
});

test('오늘 동그라미가 구글 파랑(#1a73e8)이고 그림자가 없다', () => {
  const r = ruleOf('.mc-date.today-c');
  assert.match(r, /background:var\(--gc-today\)/);
  assert.match(r, /box-shadow:none/, '번지는 그림자가 남아 있다');
});

/* ══════ ② 글자 크기·굵기 ══════ */

test('요일 머리 11px/500 · 날짜 12px/500 · 일정 칩 12px/500 — 구글과 같다', () => {
  assert.match(ruleOf('.mg-hc'), /font-size:11px;font-weight:500/);
  assert.match(ruleOf('.mc-date'), /font-size:12px;font-weight:500/);
  assert.match(ruleOf('.chip'), /font-size:12px;font-weight:500/);
});

test('굵은 글씨(700~900)가 달력에서 사라졌다', () => {
  ['.mg-hc', '.mc-date', '.chip', '.chip-more', '.mc-more-btn', '.mc-date.today-c'].forEach(sel => {
    assert.ok(!/font-weight:(700|800|900)/.test(ruleOf(sel)), sel + ' 이 아직 굵다');
  });
});

test('좁은 화면에서도 눈을 찡그리지 않는다 — 9px 을 없앴다', () => {
  assert.ok(!/\.chip\{font-size:9px/.test(src), '칩이 아직 9px 이다');
  assert.match(src, /\.chip\{font-size:11px;padding:1px 5px;\}/);
});

/* ══════ ③ 날짜·칸에 색을 칠하지 않는다 ══════ */

test('일·토·공휴일 날짜에 빨강·파랑을 넣지 않는다', () => {
  const r = ruleOf('.mc-date.sun-c,.mc-date.sat-c,.mc-date.hol-c');
  assert.match(r, /color:var\(--gc-text\)/);
  assert.ok(!/var\(--hol\)|var\(--info\)/.test(r), '아직 요일별로 색을 넣는다');
});

test('달밖 칸·못 쓰는 칸에 바탕색을 칠하지 않는다', () => {
  assert.match(ruleOf('.mc.om'), /background:var\(--surface\)/);
  assert.match(ruleOf('.mc.disabled'), /background:var\(--surface\)/);
});

test('공휴일 «칸»을 칠하지 않고 «칩»으로 보여준다', () => {
  /* 구글도 공휴일을 칩으로 보인다. 칸을 칠하면 그 줄 전체가 붉어져 눈이 먼저 지친다. */
  assert.ok(!/background:rgba\(209,26,42,\.07\)/.test(src), '공휴일 칸 바탕색이 남아 있다');
  const r = ruleOf('.hol-name');
  assert.match(r, /background:#fce8e6/, '구글 Tomato 바탕이 아니다');
  assert.match(r, /color:#a50e0e/, '구글 Tomato 글자색이 아니다');
});

test('오늘 칸은 아주 옅게만 — 2px 테두리를 뺐다', () => {
  /* 2026-08-08 지시로 넣은 «칸 표시»를 아주 없애지는 않았다. 구글 눈높이로 낮췄다. */
  const r = ruleOf('.mc.today-cell');
  assert.match(r, /background:rgba\(26,115,232,\.04\)/);
  assert.match(r, /box-shadow:none/, '2px 테두리가 남아 있다');
});

/* ══════ ④ 칩 색을 계산하는 규칙 ══════ */

test('칩은 «연한 바탕 + 진한 글자»다 — 흰 글자를 안 쓴다', () => {
  const i = src.indexOf('const tint=gcalTint(col)');
  assert.ok(i > 0, '칩이 색 짝을 안 쓴다');
  const fn = src.slice(i, i + 400);
  /* ⚠ 갈래가 둘이다 — 옮길 수 있는 것과 못 하는 것. 한쪽만 보면 다른 쪽이 옛 코드로
     돌아가도 이 검사가 통과한다(뮤테이션 검사에서 실제로 놓쳤다). 두 번 나오는지 세고,
     옛 방식(background:${col})이 남아 있지 않은지도 본다. */
  const uses = fn.split('background:${tint.bg};color:${tint.fg}').length - 1;
  assert.equal(uses, 2, '두 갈래 모두 색 짝을 써야 한다 (지금 ' + uses + '곳)');
  assert.ok(!/background:\$\{col\}/.test(fn), '옛 방식(진한 바탕)이 남아 있다');
  assert.ok(!/opacity:\.45/.test(fn), '연한 바탕에 반투명까지 걸면 글자가 안 읽힌다');
});

test('바탕은 아주 연하게(L 93%), 글자는 아주 진하게(L 31%) — 구글 역산값', () => {
  const C = load();
  const t = C.gcalTint('#2563eb');
  const bg = C.gcalHexToHsl(t.bg), fg = C.gcalHexToHsl(t.fg);
  assert.ok(bg.l > 0.90 && bg.l < 0.96, '바탕 밝기가 구글 범위(92~95%) 밖: ' + bg.l);
  assert.ok(fg.l > 0.18 && fg.l < 0.42, '글자 밝기가 구글 범위(20~41%) 밖: ' + fg.l);
});

test('고른 색의 색기운(H)을 지킨다 — 파랑을 고르면 파란 칩이다', () => {
  const C = load();
  [['#2563eb', 221], ['#e94560', 350], ['#2a9d8f', 173]].forEach(([hex, hExp]) => {
    const t = C.gcalTint(hex);
    [t.bg, t.fg].forEach(c => {
      const d = Math.abs(C.gcalHexToHsl(c).h - hExp);
      assert.ok(Math.min(d, 360 - d) < 12, hex + ' 의 색기운이 바뀌었다');
    });
  });
});

test('회색을 고르면 구글의 중성 회색 짝을 준다', () => {
  /* 색기운이 없는 색을 밝기만 만지면 «파란 기운 도는 회색»이 되어 다른 칩과 안 어울린다. */
  const C = load();
  ['#7b8089', '#888888', '#fafafa', '#111111'].forEach(c => {
    const t = C.gcalTint(c);
    assert.equal(t.bg, '#e8eaed', c + ' 바탕이 구글 Graphite 가 아니다');
    assert.equal(t.fg, '#3c4043', c + ' 글자가 구글 Graphite 가 아니다');
  });
});

test('어떤 색을 고르든 글자가 읽힌다 — 밝기 차 4.5:1 을 지킨다', () => {
  /* 색은 사람이 고른다. 연노랑·연하늘처럼 원래 밝은 색이 들어와도 읽혀야 한다. */
  const C = load();
  const hard = ['#ffee58', '#81d4fa', '#f8bbd0', '#00e676', '#ffffff', '#fff59d', '#b2ff59', '#84ffff'];
  hard.forEach(c => {
    const t = C.gcalTint(c);
    const r = C.gcalRatio(t.bg, t.fg);
    assert.ok(r >= 4.5, c + ' 의 밝기 차가 ' + r.toFixed(1) + ':1 — 글자가 안 읽힌다');
  });
});

test('못 읽는 색이 들어와도 터지지 않는다', () => {
  const C = load();
  ['', null, undefined, 'red', '#12', 'rgb(1,2,3)'].forEach(c => {
    const t = C.gcalTint(c);
    assert.equal(typeof t.bg, 'string');
    assert.equal(typeof t.fg, 'string');
  });
});

/* ══════ ⑤ 위쪽 요약 카드도 달력 눈높이로 ══════ */

test('요약 카드 숫자가 달력보다 세게 튀지 않는다', () => {
  /* 20px/900 은 달력 글자(12px/500)와 나란히 두면 그것만 먼저 눈에 들어왔다. */
  const r = ruleOf('.sum-num');
  assert.match(r, /font-size:16px;font-weight:500/);
  assert.ok(!/font-weight:900/.test(r));
});
