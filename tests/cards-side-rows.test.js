/* 옆줄 갈래를 한 줄씩 세로로 두고, 맨 위에 붙박이로 남긴다.
   옆으로 셋을 붙이니 칸이 좁아 이름이 접혔고 갈래를 더 늘릴 자리도 없었다.
   폴더가 많아 아래로 내려가면 갈래 단추가 화면 밖으로 사라졌다 — 돌아갈 자리는
   늘 같은 곳에 보여야 한다(대표 지시 2026-08-12). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

/* 옆줄을 그리는 함수 본문만 떼어 본다 — 파일 전체에서 찾으면 다른 화면의 글이 섞인다 */
function sideFn(){
  const at = source.indexOf('function renderPCSide');
  assert.ok(at > 0, 'renderPCSide 를 찾지 못했습니다');
  return source.slice(at, source.indexOf('\nfunction ', at + 20));
}

test('갈래를 세로 한 줄씩 그린다', () => {
  const fn = sideFn();
  assert.match(fn, /class="sidetab sidetabv"/);
  assert.doesNotMatch(fn, /class="sidetab sidetab3"/, '옆으로 붙이던 옛 모양이 남아 있다');
});

test('세로 줄 모양이 CSS 에 있다', () => {
  assert.match(source, /\.sidetabv\{flex-direction:column/);
  assert.match(source, /\.sidetabv button\{[^}]*justify-content:flex-start/);
});

test('갈래 차례는 메일 · 명함 · 사업자', () => {
  const fn = sideFn();
  const i = fn.indexOf('openMailPage()');
  const j = fn.indexOf("switchTab('card')");
  const k = fn.indexOf("switchTab('biz')");
  assert.ok(i > 0 && j > i && k > j, '메일 → 명함 → 사업자 차례가 아니다');
});

test('로고와 갈래가 붙박이 덩어리 안에 들어 있다', () => {
  const fn = sideFn();
  const top = fn.indexOf('class="pcside-top"');
  const logo = fn.indexOf('class="pclogo"');
  const tabs = fn.indexOf('class="sidetab sidetabv"');
  assert.ok(top > 0, 'pcside-top 덩어리가 없다');
  assert.ok(logo > top, '로고가 붙박이 덩어리 밖에 있다');
  assert.ok(tabs > top, '갈래 단추가 붙박이 덩어리 밖에 있다');
  /* 갈래 줄 끝에서 덩어리를 닫는다 — 안 닫으면 폴더까지 붙박이가 되어 아무것도 안 내려간다 */
  const close = fn.indexOf('</div></div>`;', tabs);
  assert.ok(close > tabs, '붙박이 덩어리를 갈래 줄 끝에서 닫지 않았다');
});

test('붙박이가 실제로 붙게 돼 있다', () => {
  assert.match(source, /\.pcside-top\{position:sticky;top:0/);
  /* 배경이 없으면 밑의 폴더가 글자 뒤로 비쳐 보인다 */
  assert.match(source, /\.pcside-top\{[^}]*background:#1e2a47/);
  /* 옆줄 안쪽 여백만큼 좌우로 물려야 배경이 끝까지 닿는다 */
  assert.match(source, /\.pcside-top\{[^}]*margin:-18px -14px 0/);
});

test('옆줄이 스크롤되는 상자여야 붙박이가 뜻이 있다', () => {
  /* position:sticky 는 **스크롤하는 조상** 안에서만 붙는다 */
  assert.match(source, /#pcSide\{[^}]*overflow-y:auto/);
});
