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
  /* 인라인으로 박힌 max-width·nowrap 을 풀어야 글자가 세로로 안 쪼개진다 */
  assert.match(phone, /white-space:normal!important/);
  assert.match(phone, /max-width:none!important/);
});

test('머리글이 사라지므로 칸마다 이름표를 적어 둔다', () => {
  /* 이름표가 없으면 「2027.12.31」이 시작인지 끝인지 알 수 없다 */
  assert.match(kc, /function stampCellLabels\(box\)/);
  assert.match(kc, /td\.setAttribute\('data-label'/);
  assert.match(phone, /\.dt td::before\{content:attr\(data-label\)/);
  // 그리고 나서 실제로 불러야 붙는다
  assert.match(kc, /stampCellLabels\(box\);/);
});

test('카드가 짧아지게 — 빈 칸은 접고 짧은 값은 둘씩 나란히', () => {
  /* 값이 없는 칸('-')까지 한 줄씩 차지하면 컴팩트하게 만든 뜻이 없다 */
  assert.match(kc, /td\.setAttribute\('data-empty','1'\)/);
  assert.match(phone, /\.dt td\.rownum,\.dt td\[data-empty\]\{display:none\}/);
  // 긴 값만 한 줄을 다 쓴다 — 짧은 값은 2열로 앉아 9줄이 6줄이 된다
  assert.match(kc, /t\.length > 14\) td\.setAttribute\('data-long','1'\)/);
  assert.match(phone, /grid-template-columns:1fr 1fr/);
  assert.match(phone, /\.dt td\[data-long\],\.dt td:last-child\{grid-column:1 \/ -1\}/);
});

test('이름표의 괄호 설명은 뗀다', () => {
  // 「위촉내용(직책)」이 좁은 이름표 칸에서 두 줄로 접혀 그 줄만 키가 컸다
  assert.match(kc, /n\.replace\(\/\\s\*\\\(\.\*\\\)\\s\*\$\/, ''\)/);
});

test('넓은 화면은 예전 그대로 표다', () => {
  // 카드로 눕히는 규칙은 520px 이하에만 걸려야 한다
  assert.ok(phone.startsWith('@media(max-width:520px){'));
  assert.match(kc, /\.dt table\{min-width:640px\}/, 'PC·태블릿의 표 최소폭은 그대로 둡니다');
});
