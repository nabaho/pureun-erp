/* 거래내역 표 — 폰에서 열 열 개를 네 칸으로 «겹친다» (대표 지시 2026-08-23)

   대표 화면: 「오른쪽으로 길게 데이터가 다 차지하고 있다」
   재어 보니 칸 너비 합계가 26+32+30+88+46+120+150+110+58+120 = 780px 이었다.
   412px 화면의 1.9배라 줄 하나를 보려고 계속 옆으로 밀어야 했다.

   ★ 고르는 길이 셋이었고 B 를 골랐다(대표 결정).
     A 카드로 눕히기  — 밀 것은 없지만 한 줄이 세 줄이 되어 186건 훑기가 불리
     B 네 칸으로 겹치기 ← «세로로 견주기»가 살아 있다
     C 왼쪽 두 칸 붙박이 — 여전히 밀어야 한다
   이 표의 짜임 자체가 대표 지시로 만든 것이다(「기업이름 담당자 현황 등 열을
   맞춰야 비교하기 편하다」). 그래서 열을 줄이되 «열 맞춤»은 지킨다.

   ⚠ 접은 칸(날짜·담당)의 «값»은 옆 칸에 붙여 둔다. 접기만 하면 값이 사라진다.
   ⚠ 이 검사는 px 를 안 박는다. 박는 것은 —
     ① 칸마다 손잡이가 있는가 ② 접은 값이 딴 데 살아 있는가
     ③ 네 칸이 서로 다른 자리에 서는가 ④ 넓은 화면은 안 건드렸는가 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const erp = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css', 'pu-erp.css'), 'utf8');

/* 폰 구간(max-width:640px) 블록만 떼어 온다 — 넓은 화면 규칙과 섞어 보면
   「폰에서만 바꿨다」를 증명할 수 없다. */
function phoneBlocks() {
  const out = [];
  const re = /@media \(max-width:640px\)\{/g;
  let m;
  while ((m = re.exec(css))) {
    let i = m.index + m[0].length, d = 1;
    for (; i < css.length && d > 0; i++) {
      if (css[i] === '{') d++;
      else if (css[i] === '}') d--;
    }
    out.push(css.slice(m.index, i));
  }
  return out.join('\n');
}
const PHONE = phoneBlocks();

const CELLS = ['chk', 'no', 'st', 'amt', 'date', 'memo', 'co', 'kind', 'staff', 'act'];

test('★ 칸마다 손잡이가 있다 — 안쪽 style= 로 그리는 표라 이것 말고는 잡을 데가 없다', () => {
  CELLS.forEach(function (k) {
    const n = (erp.match(new RegExp('ld-c-' + k + '\\b', 'g')) || []).length;
    assert.ok(n >= 2, '★ ld-c-' + k + ' 이 머리·몸통 두 곳에 다 있어야 합니다 (' + n + '곳)');
  });
  assert.match(erp, /className:'ld-tb'/, '표 자체에 손잡이가 없습니다.');
});

test('★ 접은 칸의 값은 옆 칸에 살아 있다 — 접기만 하면 값이 사라진다', () => {
  /* 날짜는 「어느 입금인가」를 가리는 데 늘 쓰이고, 담당은 「누구에게 물어볼까」다. */
  assert.match(erp, /className:'ld-inline-date'/, '★ 날짜 칸을 접으면 날짜가 사라집니다.');
  assert.match(erp, /className:'ld-inline-staff'/, '★ 담당 칸을 접으면 담당이 사라집니다.');
  /* 붙임 조각은 넓은 화면에서 숨는다 — 안 숨기면 날짜가 두 번 보인다 */
  assert.match(css, /\.ld-inline-date, ?\.ld-inline-staff\{[^}]*display:none/,
    '★ 기본이 숨김이 아니면 넓은 화면에서 날짜·담당이 두 번 나옵니다.');
  assert.match(PHONE, /\.ld-inline-date\{[^}]*display:inline/);
  assert.match(PHONE, /\.ld-inline-staff\{[^}]*display:inline/);
});

test('★ 담당 값을 두 곳에서 따로 내지 않는다', () => {
  /* 접은 자리와 제 칸이 서로 다른 값을 내면 넓은 화면과 폰이 딴소리를 한다. */
  const n = (erp.match(/_pendStaff\(_grp\[0\]\.head\.cand\)/g) || []).length;
  assert.equal(n, 1, '★ 담당 값을 두 번 냅니다 — 한 곳(_staffTxt)에서만 내야 합니다.');
  assert.match(erp, /var _staffTxt=/);
});

test('★ 네 칸이 서로 다른 자리에 선다 — 겹치면 글자가 포개진다', () => {
  const place = {};
  ['chk', 'st', 'amt', 'memo', 'co', 'kind'].forEach(function (k) {
    const m = PHONE.match(new RegExp('\\.ld-c-' + k + '\\s*\\{[^}]*grid-area:\\s*(\\d+)\\s*/\\s*(\\d+)'));
    assert.ok(m, '★ ld-c-' + k + ' 의 자리가 없습니다.');
    const at = m[1] + ',' + m[2];
    assert.ok(!place[at], '★ ' + k + ' 가 ' + place[at] + ' 와 같은 자리(' + at + ')입니다 — 글자가 포개집니다.');
    place[at] = k;
  });
  /* 처리 단추는 두 줄을 가로지른다.
     ⚠ 줄 수를 «명시»해야 한다 — 안 적으면 1/3 이 첫 줄에만 붙는다(이력관리에서 밟은 함정). */
  assert.match(PHONE, /grid-template-rows:\s*auto auto/, '★ 줄 수를 안 적으면 가로지르기가 안 먹습니다.');
  assert.match(PHONE, /\.ld-c-act\s*\{[^}]*grid-row:\s*1 \/ 3/);
});

test('★ 접는 칸은 셋뿐이다 — 나머지는 다 남는다', () => {
  const hid = PHONE.match(/\.ld-tb \.ld-c-no, ?\.ld-tb \.ld-c-date, ?\.ld-tb \.ld-c-staff\{[^}]*display:none/);
  assert.ok(hid, '★ 접는 칸 명단이 바뀌었으면 값이 어디 갔는지 함께 봐야 합니다.');
  ['amt', 'memo', 'co', 'kind', 'act', 'chk', 'st'].forEach(function (k) {
    assert.doesNotMatch(PHONE, new RegExp('\\.ld-c-' + k + '\\s*\\{[^}]*display:none'),
      '★ ld-c-' + k + ' 는 접으면 안 되는 칸입니다.');
  });
});

test('폰에는 자판이 없다 — ↑↓·Enter 안내를 접는다', () => {
  assert.match(erp, /className:'ld-kb'/, '자판 띠에 손잡이가 없습니다.');
  assert.match(PHONE, /\.ld-kb\{[^}]*display:none/);
  /* 넓은 화면에서는 그대로 — 단축키는 있는 줄 모르면 없는 것과 같다.
     ⚠ 폰 블록을 «빼고» 본다. 통째로 보면 폰 규칙에 걸려 늘 통과한다. */
  let wide = css;
  PHONE.split('@media (max-width:640px){').filter(Boolean).forEach(function (b) {
    wide = wide.replace('@media (max-width:640px){' + b, '');
  });
  assert.doesNotMatch(wide, /\.ld-kb\s*\{[^}]*display:none/,
    '★ 폰 구간 밖에서 접으면 넓은 화면에서도 단축키 안내가 사라집니다.');
});

/* ── 요약 줄의 ⋯ ── */
test('★ ⋯ 뒤로 보내는 것은 «거르개가 아닌 것» 넷뿐이다', () => {
  /* 확정 가능·확인 필요·후보 없음은 이 줄의 알맹이라 접지 않는다 —
     한눈에 견주는 것이 그 줄의 값어치다. */
  const n = (erp.match(/ld-more-item/g) || []).length;
  assert.ok(n >= 4, '★ 이미 처리·보류함·찾기·확정 이력 넷이 ⋯ 뒤로 가야 합니다 (' + n + '곳)');
  assert.match(erp, /f\[0\]==='done' \? 'ld-more-item'/,
    "★ 접는 칩은 '이미 처리' 하나뿐이어야 합니다.");
  assert.match(PHONE, /\.ld-sum:not\(\.on\) \.ld-more-item\{[^}]*display:none/);
});

test('★ ⋯ 는 늘 눈에 걸린다 — 딴 데 숨기면 「환경설정 안의 메일」이 된다', () => {
  assert.match(erp, /className:'ld-more-btn'/);
  assert.match(PHONE, /\.ld-more-btn\{[^}]*display:inline-block/);
  /* 넓은 화면에서는 ⋯ 자체가 없다 — 자리가 넉넉해 접을 까닭이 없다 */
  assert.match(css, /\.ld-more-btn\{ ?display:none/,
    '★ 기본이 숨김이 아니면 PC 에도 뜻 없는 ⋯ 가 생깁니다.');
});
