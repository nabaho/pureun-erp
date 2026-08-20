/* 이력관리 — 폰에서 표가 좌우·상하로 넘치던 것 (대표 지시 2026-08-17)
   "이력관리 전체 메인 부분 컴팩트하게 바꿔달라 화면이 좌우 상하로 너무 넘어간다"

   무엇이 잘못이었나 — 폰에서도 «표를 표 그대로» 썼다. 위촉장만 해도 열이 아홉인데
   `.dt table{min-width:640px}` 이라 412px 폰에서는 **반드시** 좌우로 밀어야 했고,
   좁아진 열에서는 「위 촉 장」처럼 **글자가 세로로 쪼개져** 한 줄이 세 줄이 됐다.

   고친 방향 — 폰에서는 줄마다 «카드»로 눕힌다. 머리글이 사라지므로 칸에 이름표를
   적어 두고(stampCellLabels) CSS 가 `content:attr(data-label)` 로 그린다.

   폰 412×760 에서 실제로 그려 재 본 값:
     좌우 넘침 없음(412/412) · 한 장 249 → 149px · 첫 장이 y=536 에서 시작
   PC(1280)는 예전 그대로 표다(한 줄 54px). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const kc = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');
const phone = (() => {
  const at = kc.indexOf('/* ── 폰: 표를 «카드»로 눕힌다');
  assert.ok(at > 0, '폰용 카드 블록을 찾지 못했습니다');
  const open = kc.indexOf('@media(max-width:520px){', at);
  return kc.slice(open, kc.indexOf('\n}', open) + 2);
})();

test('폰에서는 표를 카드로 눕힌다 — 좌우로 밀 일이 없다', () => {
  /* ★ min-width:640px 를 풀지 않으면 412px 폰에서 반드시 좌우로 밀린다 */
  assert.match(phone, /\.dt table\{min-width:0!important;width:100%\}/);
  assert.match(phone, /\.dt thead\{display:none\}/);
  assert.match(phone, /\.dt tbody,\.dt tr,\.dt td\{display:block;width:auto\}/);
  /* 인라인으로 박힌 max-width:160px 를 풀어야 값이 제 폭을 쓴다.
     ⚠ white-space 는 «nowrap» 이다 — 예전에 normal 로 두었더니 값이 두 줄로
       접혀 카드가 들쭉날쭉해졌다(대표 지시로 한 줄 유지로 바꿨다). */
  assert.match(phone, /max-width:none!important/);
  assert.doesNotMatch(phone, /white-space:normal!important/,
    '★ normal 로 되돌리면 값이 다시 두 줄로 접힙니다');
});

test('머리글이 사라지므로 칸마다 이름표를 적어 둔다', () => {
  /* 이름표가 없으면 「2027.12.31」이 시작인지 끝인지 알 수 없다 */
  assert.match(kc, /function stampCellLabels\(box\)/);
  assert.match(kc, /td\.setAttribute\('data-label'/);
  assert.match(phone, /\.dt td::before\{content:attr\(data-label\)/);
  // 그리고 나서 실제로 불러야 붙는다
  assert.match(kc, /stampCellLabels\(box\);/);
});

test('빈 칸은 접는다 — 값 없는 줄이 쌓이면 컴팩트한 뜻이 없다', () => {
  assert.match(kc, /td\.setAttribute\('data-empty','1'\)/);
  assert.match(phone, /\.dt td\.rownum,\.dt td\[data-empty\]\{display:none\}/);
});

/* ── 한 줄에 한 칸씩 (대표 지시 2026-08-17 두 번째)
     "탭 칸 줄 등 셀 전체적으로 한 줄씩 정렬해달라 … 가급 한 줄 안에 넣어달라"
   처음엔 짧은 값을 둘씩 앉혀 카드를 줄였는데, 값 넣을 자리가 반뿐이라
   「한국공인노무사회」 같은 이름이 두 줄로 접혔다(대표 화면에서 그랬다).
   한 칸씩 쓰면 폭이 두 배가 되어 한 줄에 들어가고 이름표가 세로로 맞는다.
   폰 412 에서 여섯 탭을 그려 재 봄: 접힌 칸 0 · 이름표 세로정렬 맞음 · 좌우넘침 없음 */
test('카드는 한 줄에 한 칸씩 — 이름표가 세로로 맞아떨어진다', () => {
  assert.match(phone, /\.dt tr\{[^}]*display:block\}/,
    '★ 두 칸으로 되돌리면 긴 이름이 다시 두 줄로 접힙니다');
  assert.doesNotMatch(phone, /grid-template-columns:1fr 1fr/);
  // 이름표 폭이 고정이라야 세로로 맞는다
  assert.match(phone, /\.dt td::before\{content:attr\(data-label\);flex:0 0 66px/);
  assert.match(phone, /white-space:nowrap\}/);
});

test('값은 접지 않고 넘치면 … 로 자른다', () => {
  /* 접히면 카드가 들쭉날쭉해지고 키가 커진다. 줄을 누르면 원래 화면이 열리므로
     잘려도 못 보는 값은 없다. */
  assert.match(phone, /\.dt td\{white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important\}/);
});

test('이 화면의 표 다섯 곳 모두에 이름표를 붙인다', () => {
  /* CAREER_CFG 를 쓰는 열네 탭은 그리는 자리가 한 곳이라 한 번에 걸리지만,
     개인정보·계좌·신분증·이름 표는 «각자» 그린다 — 빠뜨리면 그 탭만
     이름표 없는 카드가 되어 무슨 값인지 알 수 없다. */
  const calls = (kc.match(/stampCellLabels\(box\);/g) || []).length;
  assert.ok(calls >= 5, '이름표를 붙이는 자리가 ' + calls + '곳뿐입니다 (표는 다섯 곳)');
});

test('넓은 화면은 예전 그대로 표다', () => {
  // 카드로 눕히는 규칙은 520px 이하에만 걸려야 한다
  assert.ok(phone.startsWith('@media(max-width:520px){'));
  assert.match(kc, /\.dt table\{min-width:640px\}/, 'PC·태블릿의 표 최소폭은 그대로 둡니다');
});

/* ── 관리 단추를 카드 오른쪽으로 (대표 지시 2026-08-20) ────────────
   아래에 깔면 카드마다 줄이 하나씩 더 붙어, 스무 장이면 스무 줄이 늘어난다.
   오른쪽으로 세우면 왼쪽 항목들이 쓰던 높이를 그대로 나눠 쓰므로 «공짜»다. */
test('관리 단추는 카드 아래가 아니라 오른쪽에 세로로 선다', () => {
  const kc = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');
  const at = kc.indexOf('@media(max-width:520px)');
  const open = kc.indexOf('{', at + 20);
  let depth = 0, i = open;
  for (; i < kc.length; i++) {
    if (kc[i] === '{') depth++;
    else if (kc[i] === '}' && --depth === 0) break;
  }
  const b = kc.slice(at, i + 1);

  assert.match(b, /\.dt tr\{display:grid!important;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(b, /\.dt td:last-child\{[^}]*grid-column:2/);
  assert.match(b, /\.dt td:last-child\{[^}]*grid-row:1\/-1/,
    '★ 단추 칸이 모든 줄을 가로지르지 않으면 첫 줄 옆에만 붙습니다.');
  /* ★ grid-row:1/-1 은 «명시한» 줄만 셈한다 — 줄 수를 안 적으면 -1 이 1이 되어
     단추가 첫 줄 높이에만 붙는다. */
  assert.match(b, /\.dt tr\{[^}]*grid-template-rows:repeat\(\d+,auto\)/,
    '★ 줄 수를 명시하지 않으면 grid-row:1\\/-1 이 첫 줄만 가리킵니다.');
  /* 아래에 깔던 흔적(위쪽 점선·위 여백)이 남아 있으면 안 된다 */
  assert.match(b, /\.dt td:last-child\{[^}]*border-top:none!important/);
  /* 단추는 안쪽 style=inline-flex 로 감싸여 있어 !important 로 세워야 한다 */
  assert.match(b, /\.dt td:last-child > span\{display:flex!important;flex-direction:column/);
});
