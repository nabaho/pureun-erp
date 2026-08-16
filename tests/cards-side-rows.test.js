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
  /* 좌우만 음수로 물린다 — 배경이 옆줄 끝까지 닿게 하되 흐름은 안 건드린다 */
  assert.match(source, /\.pcside-top\{[^}]*margin:0 -14px 0/);
});

test('옆줄이 스크롤되는 상자여야 붙박이가 뜻이 있다', () => {
  /* position:sticky 는 **스크롤하는 조상** 안에서만 붙는다 */
  assert.match(source, /#pcSide\{[^}]*overflow-y:auto/);
});

test('「전체」는 폴더 목록의 첫 줄이다', () => {
  /* 갈래 단추 바로 밑에 「📇 전체 명함 274」로 있었는데, 위 단추가 「📇 명함 274」라
     아이콘도 숫자도 똑같아 한 줄이 두 번 그려진 것처럼 보였다. */
  const fn = sideFn();
  /* ⚠ 명함 옆줄 것을 봐야 한다. 기업 상세 옆줄에도 「폴더」 머리와 「📋 전체」가 있어
     파일 앞쪽부터 찾으면 기업 상세 것이 먼저 걸린다(2026-08-16 기업 상세 옆줄 재구성). */
  const coAt = fn.indexOf("if(state.view==='co'){");
  const from = coAt >= 0 ? fn.indexOf("innerHTML = h; return;", coAt) : 0;
  const sec = fn.indexOf('">폴더', from);
  const all = fn.indexOf("'📋 전체'", from);
  assert.ok(sec > 0, '폴더 머리를 찾지 못했습니다');
  assert.ok(all > sec, '「전체」가 아직 폴더 머리보다 위에 있다');
});

test('갈래 단추와 겹치는 이름을 쓰지 않는다', () => {
  /* ⚠ 주석에도 옛 이름이 예시로 남아 있다 — 화면에 찍히는 **따옴표 안 이름표**만 본다.
     그냥 글자로 찾으면 「왜 그렇게 고쳤는지」 적은 주석까지 걸려 헛되이 실패한다. */
  const fn = sideFn();
  assert.doesNotMatch(fn, /'📇 전체 명함'/, '갈래 단추가 이미 「명함」이라 겹말이 된다');
  assert.doesNotMatch(fn, /'📄 전체 사업자등록증'/);
});

test('「전체」는 폴더·담당자 거르개를 모두 푼다', () => {
  /* 폴더에 들어갔다가 돌아올 길이 이 줄뿐이다 */
  /* ⚠ 「📋 전체」는 기업정보 폴더에도 있다(그쪽은 pickCoFolder 가 맡는다).
     명함 쪽 것은 **뒤에** 나오므로 lastIndexOf 로 잡는다(2026-08-13). */
  const fn = sideFn();
  const at = fn.lastIndexOf("'📋 전체'");
  assert.ok(at > 0, '「전체」 줄을 찾지 못했습니다');
  assert.match(fn.slice(Math.max(0, at - 120), at), /switchTab\(/);
});

test('붙박이는 얇게 — 늘 같은 자리를 먹는 것일수록 얇아야 한다', () => {
  assert.match(source, /\.pcside-top\{[^}]*padding:16px 14px 4px/);
  assert.match(source, /\.pcside-top \.pclogo\{margin-bottom:0/);
  assert.match(source, /\.pcside-top \.sidetab\{margin:7px 0 0\}/);
});

test('붙박이에 음수 위 여백을 쓰지 않는다', () => {
  /* 음수 위 여백은 자기만 올라가는 게 아니라 **뒤따르는 줄까지** 그만큼 끌어올린다.
     그래서 붙박이가 바로 아래 줄(「메일 쓰기」)을 정확히 18px 덮었다
     (대표 보고 2026-08-12). 옆줄의 위 여백을 0 으로 두고 덩어리가 직접 갖는다. */
  const m = /\.pcside-top\{([^}]*)\}/.exec(source);
  assert.ok(m, '.pcside-top 규칙을 찾지 못했습니다');
  assert.doesNotMatch(m[1], /margin:\s*-\d/, '음수 위 여백이 아래 줄을 덮는다');
  assert.match(source, /#pcSide\{[^}]*padding:0 14px 18px/, '옆줄 위 여백이 남아 있으면 붙박이가 그 위를 못 덮는다');
});

