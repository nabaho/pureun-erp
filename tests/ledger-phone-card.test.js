/* 거래내역 표 — 폰에서는 줄 하나가 «카드» 다 (대표 지시 2026-08-23)

   ★ 여기까지 온 길을 적어 둔다. 같은 곳을 두 번 돌지 않기 위해서다.
     ① 처음엔 열 열 개를 그대로 뒀다 — 폭 합계 780px, 412px 화면의 1.9배.
        「오른쪽으로 길게 데이터가 다 차지하고 있다」
     ② 다음엔 «네 칸으로 겹치기» 를 골랐다. 「열을 맞춰야 비교하기 편하다」는
        예전 지시를 따른 것이었는데, 그 지시는 «넓은 화면» 이야기였다.
        폰에는 열을 맞출 폭 자체가 없어서 값이 죄다 「01-02…」「0…」「C…」로 잘렸다.
        「이 화면으로는 아무 확인이 안 된다」
     ③ 그래서 카드다. 짧은 값(☐·현황·금액·단추)만 한 줄에 서고,
        긴 값(적요·업체·항목)은 «제 줄을 통째로» 쓴다. 잘릴 것이 없어진다.

   ★ 이 검사가 못 박는 것은 «몇 px» 이 아니라 —
     ① 값이 잘리지 않는가 (이게 ②를 무너뜨린 바로 그것이다)
     ② 긴 값 셋이 각자 제 줄을 쓰는가
     ③ 접은 칸의 값이 딴 데 살아 있는가
     ④ 늘 보이는 처리 단추는 «주 단추 하나 + ⋯» 뿐인가
     ⑤ 넓은 화면은 안 건드렸는가

   실측(Playwright · 360·412px): 잘린 칸 0, 가로 넘침 0, 한 줄 107px.
   ⚠ 107px 은 겹치기(60px)보다 높다. 높이를 되돌리려고 값을 다시 한 줄에
     욱여넣으면 ② 로 돌아가는 것이다 — 그 길은 이미 대표가 물렸다. */
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
/* 폰 구간을 «뺀» 나머지 — 넓은 화면을 볼 때 쓴다.
   통째로 보면 폰 규칙에 걸려 무엇이든 늘 통과한다. */
const WIDE = (function () {
  let w = css;
  PHONE.split('@media (max-width:640px){').filter(Boolean).forEach(function (b) {
    w = w.replace('@media (max-width:640px){' + b, '');
  });
  return w;
})();

const CELLS = ['chk', 'no', 'st', 'amt', 'date', 'memo', 'co', 'kind', 'staff', 'act'];

test('★ 칸마다 손잡이가 있다 — 안쪽 style= 로 그리는 표라 이것 말고는 잡을 데가 없다', () => {
  CELLS.forEach(function (k) {
    const n = (erp.match(new RegExp('ld-c-' + k + '\\b', 'g')) || []).length;
    assert.ok(n >= 2, '★ ld-c-' + k + ' 이 머리·몸통 두 곳에 다 있어야 합니다 (' + n + '곳)');
  });
  assert.match(erp, /className:'ld-tb'/, '표 자체에 손잡이가 없습니다.');
});

test('★ 폰에서는 값이 «잘리지» 않는다 — 이 한 줄이 카드로 옮긴 까닭 전부다', () => {
  /* 겹치기 판에서 대표 화면에 뜬 것: 「01-02…」「0…」「C…」.
     칸이 좁아진 것이 아니라 좁은 칸에 «한 줄로» 넣으라고 시킨 것이 문제였다.
     ⚠ 셋이 함께여야 뜻이 있다 — nowrap 이 남아 있으면 넘침을 감춰도 결국 잘린다. */
  const at = PHONE.indexOf('.ld-tb th, .ld-tb td{');
  assert.ok(at > 0, '.ld-tb th/td 규칙을 찾지 못했습니다');
  const rule = PHONE.slice(at, PHONE.indexOf('}', at));
  assert.match(rule, /white-space:\s*normal/,
    '★ nowrap 이면 긴 값이 한 줄에 갇혀 잘립니다 — 겹치기 판으로 되돌아가는 것입니다.');
  assert.match(rule, /overflow:\s*visible/,
    '★ overflow:hidden 이면 넘친 글자가 «조용히» 사라집니다.');
  assert.match(rule, /text-overflow:\s*clip/,
    '★ ellipsis 가 남아 있으면 여전히 「…」로 끝납니다.');
  /* 넓은 화면은 반대다 — 열 맞춤이 살아 있어야 하므로 한 줄로 자른다.
     ⚠ PC 쪽 자름은 스타일시트가 아니라 안쪽 style=(_cell) 에 있다. 그래서 위 규칙에
       !important 가 붙어 있는 것이다 — 떼면 폰에서 도로 잘린다. */
  assert.match(erp, /textOverflow:'ellipsis',whiteSpace:'nowrap'/,
    '넓은 화면의 줄임표까지 없애면 PC 표의 열 맞춤이 무너집니다.');
  ['white-space', 'overflow', 'text-overflow'].forEach(function (k) {
    assert.match(rule, new RegExp(k + ':[^;]*!important'),
      '★ ' + k + ' 에 !important 가 없으면 안쪽 style= 이 이겨 폰에서 도로 잘립니다.');
  });
});

test('★ 긴 값 셋은 제 줄을 통째로 쓴다 — 적요·업체·항목', () => {
  /* 이 셋이 잘리던 값이다. 각자 «다른» 줄이어야 한다 — 같은 줄에 두면 포개진다. */
  const rows = {};
  [['memo', '적요'], ['co', '업체'], ['kind', '항목']].forEach(function (p) {
    const m = PHONE.match(new RegExp('\\.ld-c-' + p[0] + '\\s*\\{([^}]*)\\}'));
    assert.ok(m, '★ ' + p[1] + ' 칸의 자리가 없습니다.');
    assert.match(m[1], /grid-column:\s*1 \/ -1/,
      '★ ' + p[1] + ' 가 한 줄을 다 안 쓰면 다시 좁은 칸에 갇힙니다.');
    const r = m[1].match(/grid-row:\s*(\d+)/);
    assert.ok(r, '★ ' + p[1] + ' 의 줄 번호가 없습니다.');
    assert.ok(!rows[r[1]], '★ ' + p[1] + ' 가 ' + rows[r[1]] + ' 와 같은 줄(' + r[1] + ')입니다 — 포개집니다.');
    rows[r[1]] = p[1];
  });
  /* 줄 수를 «명시» 해야 한다 — 안 적으면 grid-row:4 가 갈 데가 없어 제멋대로 선다
     (이력관리에서 이미 밟은 함정이다) */
  const at = PHONE.indexOf('.ld-tb tr{ display:grid');
  assert.ok(at > 0, '.ld-tb tr 격자 규칙을 찾지 못했습니다');
  const tr = PHONE.slice(at, PHONE.indexOf('}', at));
  const gr = tr.match(/grid-template-rows:([^;]*)/);
  assert.ok(gr, '★ 줄 수를 안 적으면 넷째 줄이 갈 데가 없습니다.');
  assert.ok(gr[1].trim().split(/\s+/).length >= 4,
    '★ 줄이 ' + gr[1].trim() + ' 뿐입니다 — 긴 값 셋이 설 자리가 모자랍니다.');
});

test('★ 첫 줄의 짧은 값 넷은 서로 다른 자리에 선다', () => {
  const place = {};
  ['chk', 'st', 'amt', 'act'].forEach(function (k) {
    const m = PHONE.match(new RegExp('\\.ld-c-' + k + '\\s*\\{[^}]*grid-area:\\s*(\\d+)\\s*/\\s*(\\d+)'));
    assert.ok(m, '★ ld-c-' + k + ' 의 자리가 없습니다.');
    assert.equal(m[1], '1', '★ ' + k + ' 는 첫 줄에 서야 합니다.');
    assert.ok(!place[m[2]], '★ ' + k + ' 가 ' + place[m[2]] + ' 와 같은 칸입니다 — 글자가 포개집니다.');
    place[m[2]] = k;
  });
  /* 금액은 줄어들 수 있어야 한다 — 고정 폭이면 단추가 늘 때 화면 밖으로 밀린다.
     줄어들어도 값은 안 잘린다(위 검사의 white-space:normal 이 받쳐 준다). */
  const at = PHONE.indexOf('.ld-tb tr{ display:grid');
  const tr = PHONE.slice(at, PHONE.indexOf('}', at));
  assert.match(tr, /grid-template-columns:[^;]*minmax\(0, ?1fr\)/,
    '★ 금액 칸이 줄어들 수 없으면 단추 넷인 줄에서 가로로 넘칩니다.');
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

test('★ 붙여 둔 날짜에는 «초» 를 안 적는다 — 좁은 자리를 시각이 먹는다', () => {
  /* 「01-15 16:12:33」에서 뒤 절반은 어느 입금인지 가리는 데 안 쓰인다.
     온전한 값은 title 에 남아 있으므로 잃는 것이 없다. */
  assert.match(erp, /ld-inline-date'\},String\(row\.date\|\|''\)\.slice\(5, ?10\)/,
    '★ 시각까지 붙이면 첫 줄이 다시 넘칩니다.');
});

test('★ 담당 값을 두 곳에서 따로 내지 않는다', () => {
  /* 접은 자리와 제 칸이 서로 다른 값을 내면 넓은 화면과 폰이 딴소리를 한다. */
  const n = (erp.match(/_pendStaff\(_grp\[0\]\.head\.cand\)/g) || []).length;
  assert.equal(n, 1, '★ 담당 값을 두 번 냅니다 — 한 곳(_staffTxt)에서만 내야 합니다.');
  assert.match(erp, /var _staffTxt=/);
});

test('★ 폰에서 늘 보이는 처리 단추는 «주 단추 하나 + ⋯» 뿐이다', () => {
  /* 2026-08-23 대표 지시 「너무 클 필요 없다, 다른 방식을 찾아봐라」.
     폰 단추는 38px 이라 찾기·등록·보류·CMS 넷이 서면 화면의 3분의 1을 먹었다.
     줄여야 할 것은 «크기» 가 아니라 «개수» 다 — 크기는 손가락 자리 규칙이라 못 줄인다.
     ⚠ 없애는 것이 아니다. ⋯ 를 누르면 그 줄에서 바로 편다(넓은 화면은 넷이 그대로). */
  assert.match(PHONE, /\.ld-tb tbody \.ld-act-more\{[^}]*display:none/,
    '★ 나머지 단추를 안 접으면 넷이 그대로 화면을 먹습니다.');
  assert.match(PHONE, /tr\.ld-act-open \.ld-act-more\{[^}]*display:inline-block/,
    '★ 접었으면 «펴는 길»이 있어야 합니다 — 없으면 그 기능을 없앤 것입니다.');
  assert.match(erp, /className:'ld-act-toggle'/, '⋯ 단추가 없습니다.');
  assert.match(erp, /setActRow\(actRow===row\._k\?'':row\._k\)/,
    '★ 한 번에 한 줄만 펴야 합니다 — 여러 줄이 펴지면 도로 길어집니다.');
  /* 주 단추는 상태마다 하나씩 — 확정·확인·CMS·찾기 */
  ['확정', '확인', 'CMS', '찾기'].forEach(function (t) {
    assert.ok(new RegExp("ld-act-p'[\\s\\S]{0,600}?'" + t + "'").test(erp),
      '★ ' + t + ' 가 주 단추로 안 잡혀 있습니다 — ⋯ 뒤에 숨으면 한 번에 못 누릅니다.');
  });
  /* ⋯ 는 넓은 화면에 없다 — 자리가 넉넉해 넷이 나란히 들어간다 */
  assert.match(css, /\.ld-act-toggle\{ ?display:none/);
});

test('★ ⋯ 는 주 단추보다 좁다 — 안 좁히면 둘이 두 줄로 갈라진다', () => {
  /* 같은 세기(!important)면 «나중» 규칙이 이긴다. `.ld-c-act button{min-width:46px}`
     이 뒤에 있어서, 한 겹 더 좁게(button.ld-act-toggle) 적지 않으면 ⋯ 도 46px 이 된다. */
  const m = PHONE.match(/button\.ld-act-toggle\{[^}]*min-width:\s*(\d+)px/);
  assert.ok(m, '★ ⋯ 폭을 «button.» 을 붙여 적어야 뒤 규칙을 이깁니다.');
  const p = PHONE.match(/\.ld-c-act button\{[^}]*min-width:\s*(\d+)px/);
  assert.ok(p, '주 단추 폭 규칙을 찾지 못했습니다');
  assert.ok(+m[1] < +p[1], '★ ⋯ 가 주 단추(' + p[1] + 'px)만큼 넓습니다.');
});

test('★ 손가락 자리 규칙(min-height:38px)을 뒤집지 않았다', () => {
  /* 돈을 확정하는 단추다. 줄 높이를 줄이겠다고 단추를 작게 만들면 안 된다. */
  assert.doesNotMatch(PHONE, /\.ld-c-act[^}]*min-height:\s*(?!38)/);
  assert.doesNotMatch(PHONE, /\.ld-tb[^}]*button\{[^}]*min-height/);
});

test('★ 접는 칸은 셋뿐이다 — 나머지는 다 남는다', () => {
  const hid = PHONE.match(/\.ld-tb \.ld-c-no, ?\.ld-tb \.ld-c-date, ?\.ld-tb \.ld-c-staff\{[^}]*display:none/);
  assert.ok(hid, '★ 접는 칸 명단이 바뀌었으면 값이 어디 갔는지 함께 봐야 합니다.');
  ['amt', 'memo', 'co', 'kind', 'act', 'chk', 'st'].forEach(function (k) {
    assert.doesNotMatch(PHONE, new RegExp('\\.ld-c-' + k + '\\s*\\{[^}]*display:none'),
      '★ ld-c-' + k + ' 는 접으면 안 되는 칸입니다.');
  });
});

test('머리줄은 폰에서만 접는다 — 카드에는 이름표가 붙을 자리가 없다', () => {
  assert.match(PHONE, /\.ld-tb thead\{[^}]*display:none/);
  assert.doesNotMatch(WIDE, /\.ld-tb thead\s*\{[^}]*display:none/,
    '★ 넓은 화면에서 머리줄이 없으면 정렬을 누를 데가 사라집니다.');
});

test('폰에는 자판이 없다 — ↑↓·Enter 안내를 접는다', () => {
  assert.match(erp, /className:'ld-kb'/, '자판 띠에 손잡이가 없습니다.');
  assert.match(PHONE, /\.ld-kb\{[^}]*display:none/);
  /* 넓은 화면에서는 그대로 — 단축키는 있는 줄 모르면 없는 것과 같다. */
  assert.doesNotMatch(WIDE, /\.ld-kb\s*\{[^}]*display:none/,
    '★ 폰 구간 밖에서 접으면 넓은 화면에서도 단축키 안내가 사라집니다.');
});

/* ── 요약 줄의 「⋯」 ── */
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
