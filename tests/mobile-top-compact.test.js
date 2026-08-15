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
  ['helpBtn', 'photoGalBtn', 'photoLogBtn', 'backupBtn', 'zipBtn'].forEach(function (id) {
    const m = gov.match(new RegExp('<span class="hdr-extra">[\\s\\S]*?</span>'));
    assert.ok(m && m[0].indexOf('id="' + id + '"') >= 0, id + ' 가 ⋯ 묶음 안에 없습니다');
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
