/* 달력을 구글 캘린더와 «똑같이» (2026-08-25 대표 지시)
   "법인대시보드·이음센터를 구글캘린더의 위치·크기·색·디자인·글자크기·시간·날짜
    그리고 담당자마다 각자 넣었던 색깔을 완벽하게 일치. 개인별로 보는 구글화면색처럼."

   ★ 뿌리 — 구글 색이 앱에 «아예 안 들어오고» 있었다.
     colorId 를 무시하고, 제목에 직원 이름이 있으면 앱 색표(staffColorMap)로 칠했다.
     그래서 구글에서 각자 고른 색과 앱 화면이 «영원히» 달랐다. 화면만 손봐서는 못 맞춘다.

   ★ 색값을 코드에 «적지 않는다» — 구글이 준 값을 그대로 쓴다.
     적어 두면 ①팔레트 규율(승인 27색)이 깨지고 ②구글에서 색을 바꿔도 안 따라간다. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const RAW = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const S = bare(RAW);

function fnBody(name) {
  const a = S.indexOf('function ' + name + '(');
  assert.ok(a > 0, name + ' 이 없다');
  let d = 0;
  for (let k = S.indexOf('{', a); k < S.length; k++) {
    if (S[k] === '{') d++;
    else if (S[k] === '}') { d--; if (!d) return S.slice(a, k + 1); }
  }
  return S.slice(a, a + 2000);
}

/* ── 구글 색을 받아 오나 ── */

test('구글 색표를 받아 온다', () => {
  const fn = fnBody('gcalLoadColors');
  assert.match(fn, /calendar\/v3\/colors/, '색표를 안 받아 온다');
  assert.match(fn, /\.event\b|\['event'\]|d\.event/, '이벤트 색을 안 읽는다');
  assert.match(fn, /background/, '바탕색을 안 읽는다');
});

test('색표를 «한 번만» 받는다 — 달을 넘길 때마다 다시 받지 않는다', () => {
  const fn = fnBody('gcalLoadColors');
  assert.match(fn, /if\(window\._gcalColors\) return Promise\.resolve/, '매번 다시 받는다');
});

test('색표가 안 와도 일정은 뜬다', () => {
  /* 색 하나 때문에 달력이 비면 그게 더 큰 사고다. */
  const fn = fnBody('gcalLoadColors');
  assert.match(fn, /\.catch\(/, '색표 실패가 일정까지 죽인다');
});

test('★ 색표를 먼저 채운 «뒤» 일정을 받는다', () => {
  /* 순서가 뒤바뀌면 첫 그림에 색이 빠지고, 사람은 「색이 안 먹는다」고 본다. */
  /* ⚠ 'gcalLoadColors()' 는 «정의» 줄에도 들어 있다(function gcalLoadColors(){).
     그래서 부르는 자리를 볼 때는 앞에 줄바꿈과 들여쓰기를 함께 본다. */
  const i = S.indexOf('\n    gcalLoadColors()');
  const j = S.indexOf('return fetchT(url, null, 20000)', i);
  assert.ok(i > 0, '색표를 부르지 않는다');
  assert.ok(j > i && j - i < 300, '색표보다 일정을 먼저 받는다');
});

/* ── 담당자 색: 구글이 이긴다 ── */

test('★ 구글에서 고른 색이 앱 색표를 «이긴다»', () => {
  /* 이게 지시의 핵심이다. 앱 색표로 덮으면 구글 화면과 영원히 다르다. */
  assert.match(S, /if\(!gColor\) evColor = staffColorMap/,
    '앱 색표가 구글 색을 덮는다');
});

test('구글에 색을 «안 넣은» 일정은 앱 색표로 칠한다', () => {
  /* 구글에서 색을 고르지 않은 사람의 일정까지 회색이 되면 안 된다. */
  assert.match(S, /var gColor = \(window\._gcalColors && ev\.colorId\)/, '구글 색을 안 읽는다');
  assert.match(S, /var evColor = gColor \|\|/, '되돌아갈 색이 없다');
});

test('★ 색값을 코드에 적지 않았다 — 팔레트 규율을 지킨다', () => {
  /* 구글 기본색은 24가지다. 그것을 파일에 적으면 승인 27색 규율이 깨진다.
     구글이 준 값을 «그대로» 쓰는 것이 유일한 길이다. */
  const fn = fnBody('gcalLoadColors');
  assert.strictEqual(/#[0-9a-fA-F]{6}/.test(fn), false, '색값을 코드에 적었다');
});

/* ── 모양: 구글과 같게 ── */

test('구글 색은 «그대로» 쓴다 — 연하게 바꾸지 않는다', () => {
  assert.match(S, /var chipBg = ev\.gcolor \? ev\.gcolor : sgLighten\(/, '월 보기가 구글 색을 흐린다');
  assert.match(S, /var wdChipBg = ev\.gcolor \? ev\.gcolor : sgLighten\(/, '주·일 보기가 구글 색을 흐린다');
});

test('★ 글자색을 바탕 밝기에 맞춰 고른다', () => {
  /* 늘 흰 글자면 구글에서 «연한» 색을 고른 사람의 일정은 글씨가 묻힌다. */
  const ctx = { String, parseInt };
  vm.createContext(ctx);
  vm.runInContext(fnBody('calTextOn') + '\nthis.f = calTextOn;', ctx);
  const f = ctx.f;
  assert.strictEqual(f('#ffffff'), '#1e293b', '흰 바탕에 흰 글자');
  assert.strictEqual(f('#fbbf24'), '#1e293b', '연한 노랑에 흰 글자');
  assert.strictEqual(f('#1e40af'), '#ffffff', '진한 파랑에 짙은 글자');
  assert.strictEqual(f('#000000'), '#ffffff', '검은 바탕에 짙은 글자');
  assert.strictEqual(f(''), '#ffffff', '색이 없을 때 안 터진다');
  assert.strictEqual(f('#abc'), f('#aabbcc'), '3자리 색도 같게 본다');
  /* ★ 눈이 느끼는 밝기로 재야 한다 — 초록은 밝게, 파랑은 어둡게 느껴진다.
     세 값을 그냥 평균 내면 이 둘이 «거꾸로» 나온다:
       연초록 #4ade80 → 평균 0.55(흰 글자) · 눈 0.66(짙은 글자) ← 짙은 글자가 맞다
       연파랑 #60a5fa → 평균 0.67(짙은 글자) · 눈 0.60(흰 글자)  ← 흰 글자가 맞다
     구글 색에는 초록·파랑이 흔하므로 이 구별이 실제로 눈에 보인다. */
  assert.strictEqual(f('#4ade80'), '#1e293b', '연한 초록에 흰 글자 — 눈 밝기로 안 재고 있다');
  assert.strictEqual(f('#60a5fa'), '#ffffff', '연파랑에 짙은 글자 — 눈 밝기로 안 재고 있다');
});

test('글자색에 새 색을 만들지 않았다', () => {
  const fn = fnBody('calTextOn');
  (fn.match(/#[0-9a-fA-F]{6}/g) || []).forEach(function (c) {
    assert.ok(['#1e293b', '#ffffff'].indexOf(c.toLowerCase()) >= 0, '새 색이 들어왔다: ' + c);
  });
});

test('두 보기가 같은 글자색 규칙을 쓴다', () => {
  /* 한 보기만 고치면 월↔주 바꿀 때 색이 튄다. */
  assert.match(S, /color: calTextOn\(chipBg\)/, '월 보기가 안 쓴다');
  assert.match(S, /color:calTextOn\(wdChipBg\)/, '주·일 보기가 안 쓴다');
});

test('★ 시각을 구글처럼 «1030» 으로 붙여 쓴다', () => {
  /* 구글은 콜론을 안 쓴다. 콜론을 빼면 좁은 칸에서 제목이 두 글자쯤 더 보인다. */
  const n = (S.match(/ev\.time\.slice\(0,5\)\.replace\(':',''\)/g) || []).length;
  assert.strictEqual(n, 2, '두 보기 모두 바뀌지 않았다 (지금 ' + n + '곳)');
  assert.strictEqual(/ev\.time\.slice\(0,5\)\+' '/.test(S), false, '아직 콜론을 쓰는 곳이 남았다');
});

test('시각을 흐리게 하지 않는다 — 구글은 제목과 같은 굵기다', () => {
  const n = (S.match(/opacity:0\.75, marginRight:'2px'/g) || []).length;
  assert.strictEqual(n, 0, '아직 흐린 시각이 남아 있다 (' + n + '곳)');
});

test('아이콘을 붙이지 않는다 — 구글 화면에는 없다', () => {
  /* ⚠ 같은 아이콘이 «메뉴 이름»(🗓 캘린더)에도 쓰인다 — 그것은 지울 것이 아니다.
     일정을 만드는 자리(type:'gcal' 를 돌려주는 곳)만 본다. */
  const icon = String.fromCodePoint(0x1F5D3);
  const i2 = S.indexOf("type:'gcal',");
  assert.ok(i2 > 0, '구글 일정 만드는 자리를 못 찾았다');
  const mk = S.slice(i2, i2 + 400);
  assert.strictEqual(mk.indexOf("label:'" + icon) >= 0, false, '아직 일정 이름에 아이콘을 붙인다');
  assert.match(mk, /label: title, color: evColor, gcolor: gColor/, '색을 화면까지 안 넘긴다');
});

test('월 보기 글자가 너무 작지 않다 — 구글은 11px 쯤이다', () => {
  /* ⚠ 날짜 숫자 칸도 같은 꼴로 시작한다 — 칩의 것을 콕 집어 본다. */
  assert.match(S, /fontSize: calMonthFit\?'10px':\(IS_MOBILE\?'10\.5px':'11px'\)/,
    'PC 월 보기 칩 글자가 아직 작다');
});

/* ── 두 화면이 같은 달력을 쓰는가 ── */

test('법인 대시보드와 이음센터가 «같은» 달력을 쓴다', () => {
  /* 따로 그리면 한쪽만 구글처럼 되어 또 어긋난다. */
  assert.match(RAW, /이음센터 모드: 이음센터 화면\(dash\/ieum\)에서 캘린더만 재사용/,
    '두 화면이 달력을 따로 그린다 — 한 곳을 고쳐도 다른 곳은 그대로다');
});
