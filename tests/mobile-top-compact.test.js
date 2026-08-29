/* 폰 화면 위쪽 정리 (대표 지시 2026-08-15)
     "캡쳐1 컴팩트하게 캘린더 위쪽 정리해줘"
     "사업자정보 위에 정리좀해달라 불필요하게 2줄씩 선택 하게 된거 정리해달라"

   폰(412×760)에서 재어 보고 고친 것 — 정부컨설팅 일정관리와 계약관리 둘 다
   달력·목록이 시작하기 전에 줄이 너무 많았다.
   ⚠ 여기서 지키는 것은 **넓은 화면을 건드리지 않는다**는 조건이다.
     둘 다 display:contents 를 써서 PC 에서는 묶음이 없는 것처럼 배치된다 —
     이 조건이 깨지면 PC 한 줄 툴바가 무너진다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const gov = fs.readFileSync(path.join(R, 'gov-consulting.html'), 'utf8');
const erpCss = fs.readFileSync(path.join(R, 'css/pu-erp.css'), 'utf8');
const erp = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');

/* ── 정부컨설팅 일정관리 ── */

test('정부컨설팅: 가끔 쓰는 단추는 폰에서만 ⋯ 안으로 접는다', () => {
  // 단추 12개가 폰에서 두 줄을 먹어 달력이 그만큼 아래로 밀렸다
  assert.match(gov, /<span class="hdr-extra">/);
  assert.match(gov, /id="hdrMoreBtn"/);
  /* ⚠ 예전에는 «어떤 단추가 들어 있는지»를 이름으로 못 박았다(2026-08-29 고침).
     그래서 안 쓰는 단추 둘을 뺐을 때, 기능이 망가져서가 아니라 «지금 값»을 박아 둔
     탓에 검사가 깨졌다(CLAUDE.md 「검사를 쓰는 규칙」).
     못 박을 것은 이름표가 아니라 **「가끔 쓰는 것은 묶여 있고, 접었다 펼 수 있다」**
     는 규칙이다 — 단추가 늘든 줄든 이 규칙은 그대로다. */
  const box = gov.match(/<span class="hdr-extra">[\s\S]*?<\/span>/);
  assert.ok(box, '⋯ 묶음을 찾지 못했습니다');
  const ids = [...box[0].matchAll(/id="([^"]+)"/g)].map(function (m) { return m[1]; });
  assert.ok(ids.length >= 2, '묶을 것이 없으면 ⋯ 자체가 헛단추입니다 (지금 ' + ids.length + '개)');
  /* 늘 보여야 하는 것(저장 상태·알림·로그아웃)은 묶으면 안 된다 — 접히면 못 쓴다 */
  ['saveState', 'notifBtn', 'hdrLogout'].forEach(function (id) {
    assert.ok(ids.indexOf(id) < 0, id + ' 은(는) 늘 보여야 하는데 ⋯ 안에 넣었습니다');
  });
  // PC 는 묶음이 없는 것처럼 — 단추가 예전 그대로 한 줄에 늘어선다
  assert.match(gov, /\.hdr-extra\{display:contents;\}/);
  /* ⋯ 단추는 PC 에서 안 보여야 한다. !important 가 필요하다 —
     뒤에 오는 .notif-btn 의 display 에 그냥은 진다(실제로 한 번 그렇게 났다). */
  assert.match(gov, /\.hdr-more\{display:none!important;\}/);
  assert.match(gov, /\.hdr-more\{display:inline-flex!important;\}/);
  // 펼치기는 폰에서만 — 접힌 것을 열 길이 없으면 기능이 사라진 셈이 된다
  assert.match(gov, /r\.classList\.toggle\('x-on'\)/);
  assert.match(gov, /\.hdr-r\.x-on \.hdr-extra\{display:flex/);
});

test('정부컨설팅: 요약 4칸을 한 줄에 넣고 기준일 줄은 뺀다', () => {
  assert.match(gov, /\.sum-card\{flex:1 1 0;min-width:0;/, '절반 폭이면 넉 장이 두 줄을 먹습니다');
  // 바로 위에 「2026년 8월」이 있어 기준일이 한 줄을 통째로 쓸 값이 아니다
  assert.match(gov, /\.summary-date\{display:none!important;\}/);
  // 「저장 완료」 글씨는 100px 을 먹는다 — 폰에서는 점만 남긴다
  assert.match(gov, /\.hdr-r \.save-state #saveStateText\{display:none;\}/);
});

/* ── 푸른이알피 계약관리 ── */

test('이알피: KPI 가 4칸이면 폰에서도 한 줄에 넣는다', () => {
  /* 3칸으로 고정돼 있어 4칸짜리 화면이 3+1 로 갈라졌다 —
     한 칸만 있는 둘째 줄 때문에 목록이 44px 아래로 밀렸다(재어 봄). */
  assert.match(erp, /className:'mkpi-grid mkpi-n' \+ kpis\.length/);
  assert.match(erpCss, /\.mkpi-grid\.mkpi-n4\{ grid-template-columns: repeat\(4,minmax\(0,1fr\)\)/);
  // 4칸이면 라벨이 잘리므로 글씨를 한 단계 줄인다
  assert.match(erpCss, /\.mkpi-grid\.mkpi-n4 > div > div:first-child\{ font-size:9px/);
  // 5·6칸은 그대로 3칸 — 한 줄에 넣으면 글씨를 못 읽는다
  assert.doesNotMatch(erpCss, /\.mkpi-grid\.mkpi-n6\{/);
});

test('이알피: 깔때기 셋(종류·담당자·부담당)은 폰에서 한 줄에 나란히', () => {
  assert.match(erp, /h\('div', \{ className:'tb-filters' \}/);
  // PC 는 묶음이 없는 것처럼 — 넓은 화면 한 줄 툴바를 건드리지 않는다
  assert.match(erpCss, /\.tb-filters\{ display:contents; \}/);
  assert.match(erpCss, /\.tb-filters > select\{ flex:1 1 0 !important; min-width:0 !important;/);
  /* 12px — 위의 `select{font-size:16px}` 로는 셋이 한 줄에 안 들어가
     「전체 담당자」가 잘렸다(실제로 그렇게 났다). */
  assert.match(erpCss, /\.tb-filters > select\{[^}]*font-size:12px !important/);
});

test('이알피: 폰에서 달 이름 칸을 줄여 「이번 달만」이 아랫줄로 안 넘어간다', () => {
  assert.match(erp, /minWidth: winW<=768\?'74px':'88px'/);
});

/* ── 폰 전체 콤팩트 (대표 지시 2026-08-15 "폰화면 전체적으로 간결히 볼수 있게") ──
   이알피의 폰용 줄 상당수는 **가로로 밀어 보는 한 줄**로 설계돼 있다
   (`overflowX:'auto'` + `flexShrink:0` + 10~11px 알약, 앱 안에 37군데):
     · 입금관리 서브탭 8개 + 가져오기
     · 출금관리 단추 9개 (CSV·일괄·카드엑셀 …)
     · 사건·컨설팅·기금·기타의 깔때기 알약
   그런데 480px 이하에 걸린 「인라인 flex 는 모두 접는다」 규칙이 그 설계를 깨서
   한 줄이 세 줄이 되고 있었다. 폰에서 실제로 그려 재 본 값(412px):
     서브탭 3줄→1줄(40px) · 출금단추 3줄→1줄(38px) · 깔때기 3줄→1줄(40px) */
test('가로로 밀어 보는 줄은 폰에서도 접지 않는다', () => {
  assert.match(erpCss, /\[style\*="overflow-x: auto"\] \{ flex-wrap: nowrap !important;/);
  // 접는 규칙 자체는 남아 있어야 한다 — 다른 단추 묶음은 접혀야 보인다
  assert.match(erpCss, /\[style\*="display: flex"\]\[style\*="gap"\] \{ flex-wrap: wrap; \}/);
  /* 순서가 중요하다 — 접지 않는 규칙이 뒤에 와야 이긴다(둘 다 같은 매체 질의 안) */
  assert.ok(erpCss.indexOf('[style*="display: flex"][style*="gap"] { flex-wrap: wrap; }')
          < erpCss.indexOf('[style*="overflow-x: auto"] { flex-wrap: nowrap !important;'));
});

/* ★ 대표 화면 2026-08-15 — 내가 낸 사고. 접지 않게만 해 두었더니
   출금관리에서 **화면 전체가 옆으로 밀려** 머리글·KPI·검색칸까지 잘렸다.
   까닭: 이 줄들은 대개 다른 flex 상자의 아이템이고, flex 아이템의 기본값은
   `min-width:auto` — 속에 든 것보다 작아지지 않는다. 그래서 단추 아홉의 폭이
   그대로 부모를 밀었다. 폰에서 재어 보니 페이지 510px · 화면 412px 였다.
   작아질 수 있게 풀어 줘야 넘치는 부분이 **그 줄 안에서** 밀린다. */
test('★ 가로 스크롤 줄이 페이지를 옆으로 밀지 않는다', () => {
  const rule = erpCss.match(/\[style\*="overflow-x: auto"\] \{[^}]*\}/);
  assert.ok(rule, '가로 스크롤 줄 규칙을 찾지 못했습니다');
  assert.match(rule[0], /min-width: 0 !important/,
    '★ 없으면 줄이 안 줄어들어 화면 전체가 옆으로 밀립니다 (실제로 그렇게 났다)');
  assert.match(rule[0], /max-width: 100% !important/);
});

test('알약 깔때기는 글자 입력칸용 16px·42px 에 부풀지 않는다', () => {
  /* 16px·42px 은 **글자를 찍어 넣는 칸**이 확대되지 않게 하려는 값이다.
     고르기만 하는 알약까지 부풀려 한 줄에 둘도 안 들어갔다.
     가로 스크롤 줄 안의 select 만 되돌린다 — 다른 입력칸은 그대로 16px. */
  assert.match(erpCss, /\[style\*="overflow-x: auto"\] > select\{ font-size:11\.5px !important; min-height:30px !important;/);
  assert.match(erpCss, /input, select, textarea\{ font-size:16px !important; min-height:42px;/,
    '글자 입력칸의 확대 방지는 그대로 두어야 합니다');
});
