/* 업무관리 — 폰에서 머리줄·칩 줄이 낱말마다 두 줄로 접히던 것
   (대표 지시 2026-08-17: "업무관리 등 두 줄씩 나오는 것 한 줄씩 등으로 정리해달라")

   대표 화면에서 실제로 이랬다:
     「내 업/무」 · 「권형하 대표노/무사 · P-001」 · 「로그/아웃」
   머리줄에 넣을 것이 다섯인데(제목·연결·이름·시계·로그아웃) 폰용 규칙이 아예
   없어서, 자리가 모자라면 낱말 가운데가 끊겼다.

   폰 412×760 에서 진짜 CSS 로 그려 재 본 값:
     머리줄 1줄(42px) · 칩 줄 1줄(23px, 옆으로 밂) · 목록이 y=77 에서 시작
   PC(1280)는 그대로다 — 시계도 보이고 칩도 예전처럼 접힌다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const work = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8');
const phone = (() => {
  const at = work.indexOf('/* ── 폰: 머리줄과 칩 줄을 한 줄씩');
  assert.ok(at > 0, '폰용 블록을 찾지 못했습니다');
  const open = work.indexOf('@media (max-width:520px){', at);
  return work.slice(open, work.indexOf('\n  }', open) + 4);
})();

test('머리줄은 폰에서 한 줄 — 낱말 가운데가 끊기지 않는다', () => {
  assert.match(phone, /#topbar\{[^}]*flex-wrap:nowrap/);
  assert.match(phone, /#crumb\{white-space:nowrap/);
  assert.match(phone, /#logoutbtn\{white-space:nowrap/,
    '★ 없으면 「로그/아웃」으로 갈라집니다');
  // 이름은 길어도 한 줄, 넘치면 …
  assert.match(phone, /#topuser\{white-space:nowrap;overflow:hidden;text-overflow:ellipsis/);
});

test('폰에서 군더더기 둘을 뺀다 — 시계와 「연결됨」 글자', () => {
  /* 시계: 폰은 제 상태줄에 시각이 이미 떠 있다.
     연결 상태: 점만 남겨도 뜻이 통한다. 둘이 머리줄의 절반을 먹고 있었다. */
  assert.match(phone, /#topclock\{display:none\}/);
  assert.match(phone, /#connt\{display:none\}/);
  // 점은 남아야 한다 — 연결 여부를 볼 길이 없어지면 안 된다
  assert.doesNotMatch(phone, /#dot\{display:none\}/);
});

test('숫자칩 줄은 접지 말고 옆으로 민다', () => {
  /* 접으면 화면 위쪽이 네댓 줄이 되어 정작 표가 화면 밖으로 밀려난다
     (이알피에서 같은 고침을 했다). */
  assert.match(phone, /\.row\[style\*="flex-wrap:wrap"\]\{flex-wrap:nowrap!important;overflow-x:auto/);
  /* ⚠ min-width:0 · max-width:100% 가 함께 있어야 한다 — 없으면 줄이 안 줄어들어
     페이지 «전체»가 옆으로 밀린다(이알피에서 실제로 그 사고가 났다). */
  assert.match(phone, /\.row\[style\*="flex-wrap:wrap"\]\{[^}]*min-width:0;max-width:100%/);
  // 가운데 빈 자리는 밀어서 보는 줄에서 자리만 벌린다
  assert.match(phone, /> span\[style\*="flex:1"\]\{display:none\}/);
});

test('넓은 화면은 건드리지 않는다', () => {
  assert.ok(phone.startsWith('@media (max-width:520px){'));
  // PC 용 머리줄 규칙은 그대로 살아 있어야 한다
  assert.match(work, /#topclock\{font-variant-numeric:tabular-nums/);
});
