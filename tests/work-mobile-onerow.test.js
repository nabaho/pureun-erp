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

/* ── 「내 업무」 머리줄 (대표 지시 2026-08-20 "너무 길게 오른쪽으로 나 있다") ──
   칸이 열댓이라 한 줄로 밀면 900px 이 넘었다 — 두 번 반을 밀어야 끝이 나왔다.
   두 줄로 끊고, 폰에서 뜻이 없는 것을 걷어 59px 로 줄였다. */
test('「내 업무」 머리줄만은 밀지 않고 두 줄로 끊는다', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8');
  assert.match(src, /<div class="row hdr-my"/, 'css 가 잡을 손잡이가 없습니다.');
  assert.match(src, /\.row\.hdr-my\{flex-wrap:wrap!important/);
  /* ★ 줄을 끊는 자리 = 넓은 화면에서 도구를 오른쪽으로 미는 «빈칸».
     flex:0 0 100% 로 바꾸면 그 자리에서 줄이 넘어간다 — 짜임을 안 건드리고 끊는 법. */
  assert.match(src, /\.row\.hdr-my > span\[style\*="flex:1"\]\{display:block!important;flex:0 0 100%!important/,
    '★ 빈칸을 줄바꿈 자리로 쓰지 않으면 다시 한 줄로 길어집니다.');
  /* 숫자 묶음이 제 안에서 또 접히면 줄이 넷이 된다 */
  assert.match(src, /\.row\.hdr-my \.statbar\{flex:1 1 0!important/);
  assert.match(src, /\.row\.hdr-my \.statbar\{[^}]*flex-wrap:nowrap!important/);
});

test('폰에서 뜻이 없어진 단추는 접는다 — 넓은 화면에는 그대로 둔다', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8');
  /* 「메뉴 접기」 : 폰에서 왼쪽 메뉴는 «서랍» 이라 접을 것이 없다(헛단추).
     「빽빽하게」 : 폰 목록은 이미 촘촘하게 그리고 있어 더 줄일 것이 몇 px 뿐이고,
       그 자리를 날마다 쓰는 「‹ 주 › 」 넘기기가 쓴다. */
  assert.match(src, /class="chipbtn vc-nos'/, '메뉴 접기 손잡이가 없습니다.');
  assert.match(src, /class="chipbtn vc-cmp'/, '빽빽하게 손잡이가 없습니다.');
  const at = src.indexOf('@media (max-width:520px)');
  const open = src.indexOf('{', at + 20);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  const phone = src.slice(at, i + 1);
  assert.match(phone, /\.vc-nos\{display:none!important\}/);
  assert.match(phone, /\.vc-cmp\{display:none!important\}/);
  /* ★ 넓은 화면에서까지 사라지면 접는 기능 자체를 잃는다 */
  assert.equal((src.match(/\.vc-nos\{display:none/g) || []).length, 1,
    '★ 폰 구간 밖에도 숨김 규칙이 있으면 PC 에서도 사라집니다.');
});
