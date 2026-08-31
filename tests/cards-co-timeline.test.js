/* 기업 상세 1단계 — 사업·사건을 «축»으로 (대표 지시 2026-08-26)
   "기업상세에 사업자등록증 고유번호증으로 다시 나눌 필요가 없다. 기업의 정보와
    기업이 수행했던 사업·사건 등을 관리하고…"
   대표 결정: 1단계(타임라인)부터.

   ★ 1단계의 약속 — «서버에 아무것도 쓰지 않는다»
     이미 읽고 있던 값(loadErpCaseCons)의 «자리»만 바꾼다. 그래서 되돌리기도 쉽다.
   ★ 「서류 탭」은 접지만 «자료는 지우지 않는다» — 서류이름은 2단계에서
     서류를 사업·사건에 붙이는 재료다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8');

function slice(fromMark, toMark) {
  const a = HTML.indexOf(fromMark);
  const b = HTML.indexOf(toMark, a + 1);
  assert.ok(a > 0 && b > a, '표식을 못 찾았다: ' + fromMark);
  return HTML.slice(a, b);
}

/* ── 사업·사건이 «맨 위»에 온다 ── */

test('★ 사업·사건 칸이 회사 정보 «위»에 온다 — 무슨 일을 했나가 먼저다', () => {
  const body = slice('function coDetailPanelHtml(o){', 'function openCoDetailPanel(');
  const hist = body.indexOf('id="coErpHistBox"');
  /* ⚠ 2026-08-31: 기업정보 칸이 접기/펼치기(coInfoBoxHtml)로 옮겨 가면서, 그 안의
     «pdgrid」 글자는 더 이상 coDetailPanelHtml 자신의 몸통에 없다 — 별도 함수를
     부르는 쪽만 여기 남는다. 정보 칸이 시작하는 자리는 #coInfoBox 로 본다. */
  const info = body.search(/id="coInfoBox"/);
  assert.ok(hist > 0, '이력 칸을 못 찾았다');
  assert.ok(info > 0, '정보 칸을 못 찾았다');
  assert.ok(hist < info, '이력이 정보보다 아래면 스무 칸을 지나야 나온다');
});

test('이력 칸이 이름·폴더 «아래»에는 있다 — 어느 회사인지 먼저 보여야 한다', () => {
  const body = slice('function coDetailPanelHtml(o){', 'function openCoDetailPanel(');
  const name = body.indexOf('class="pdname"');
  const hist = body.indexOf('id="coErpHistBox"');
  assert.ok(name > 0 && name < hist, '회사 이름이 먼저 와야 한다');
});

test('서류 목록·사람 목록은 그대로 남는다 — 없애는 것이 아니라 차례를 바꾼 것이다', () => {
  const body = slice('function coDetailPanelHtml(o){', 'function openCoDetailPanel(');
  assert.match(body, /coDocsHtml\(o\)/, '서류 목록이 사라졌다');
  assert.match(body, /coConflictHtml\(o\)/, '어긋난 칸 알림이 사라졌다');
  assert.match(body, /이 회사 사람 \$\{o\.cards\.length\}명/, '사람 목록이 사라졌다');
});

test('이력 칸은 «하나»뿐이다 — 두 곳에 두면 하나는 늘 비어 있다', () => {
  const body = slice('function coDetailPanelHtml(o){', 'function openCoDetailPanel(');
  assert.strictEqual(body.split('id="coErpHistBox"').length - 1, 1);
});

/* ── 새 쓰기가 없다 ── */

test('★ 1단계는 서버에 아무것도 쓰지 않는다', () => {
  const body = slice('function coDetailPanelHtml(o){', 'function openCoDetailPanel(');
  assert.ok(!/Store\.(put|del|db)/.test(body), '패널을 그리면서 쓰기가 나가면 안 된다');
  assert.ok(!/\.update\(|\.set\(|\.remove\(/.test(body), '쓰기 호출이 있다');
});

test('읽는 자리도 그대로다 — 이미 부르던 loadErpCaseCons 를 쓴다', () => {
  const body = slice('function openCoDetailPanel(key){', 'function sortBy(key){');
  assert.match(body, /loadErpCaseCons\(/, '새 읽기 길을 만들지 않았다');
  /* 늦게 온 답을 다른 회사 칸에 쓰지 않는다 — 이미 있던 안전장치를 지킨다.
     ⚠ 「state.coPick===key 라는 글자가 어딘가 있다」로는 부족하다. 이 함수는 그 값을
       세팅하기도 해서, 안전장치를 «떼어내도» 통과했다(되돌림이 잡아 준 자리).
       콜백 «안»에 걸려 있는지를 본다. */
  assert.match(body, /loadErpCaseCons\(data=>\{ if\(state\.coPick===key\)/,
    '회사가 바뀌면 늦은 답을 버려야 한다');
});

/* ── 「서류 탭」을 접었다 ── */

test('★ 옆줄 「서류 탭」 목록이 안 나온다', () => {
  const body = slice('const CO_SIDE_DOC_TABS', 'h += pcSideBottomHtml();');
  assert.match(body, /const CO_SIDE_DOC_TABS = false;/, '접는 스위치가 있어야 한다');
  assert.match(body, /CO_SIDE_DOC_TABS \? coTagList\(cos\) : \[\]/,
    '스위치가 꺼지면 목록이 비어야 한다');
});

test('★ 서류이름 자료는 «지우지 않는다» — 2단계의 재료다', () => {
  /* 화면에서만 뺀다. 지우는 코드가 들어오면 이름 대조를 할 수 없게 된다. */
  const body = slice('const CO_SIDE_DOC_TABS', 'h += pcSideBottomHtml();');
  assert.ok(!/tags.*null|remove\(|coTagHidden.*null/.test(body), '자료를 지우면 안 된다');
  /* 담는 길도 그대로 — 손으로 담아 둔 것을 잃지 않게 */
  /* ⚠ 담는 단추는 «PC 와 폰» 두 곳에 있다. 한 곳만 세면 다른 한 곳을 없애도 통과한다
       (되돌림이 잡아 준 자리). 둘 다 남아야 손으로 담아 둔 길을 잃지 않는다. */
  assert.strictEqual(HTML.split('onclick="coAssignTag()"').length - 1, 2,
    '담는 길이 PC·폰 두 곳에 다 있어야 한다');
  assert.match(HTML, /function coTagList\(/, '서류이름을 세는 함수는 남아 있어야 한다');
});

test('되돌리는 길이 코드에 적혀 있다', () => {
  const body = slice('/* ── 「서류 탭」을 접는다', 'const CO_SIDE_DOC_TABS = false;');
  assert.match(body, /CO_SIDE_DOC_TABS/, '어떻게 되돌리는지 적어야 한다');
  assert.match(body, /지우지 않는다/, '자료가 남는다는 것을 적어야 한다');
});

test('빈 자리 안내글이 «이제 맞는 말»로 바뀌었다', () => {
  /* ⚠ 주석을 먼저 뗀다 — 왜 바꿨는지 적은 주석에 옛 글귀가 그대로 들어 있다.
       그냥 세면 «설명»을 «화면 글귀»로 읽는다(이 저장소에서 여러 번 밟은 함정). */
  const bare = HTML.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/여기에 서류 탭이 생깁니다/.test(bare),
    '접어 놓고 「여기에 생깁니다」라고 하면 거짓말이 된다');
  assert.match(bare, /그 회사가 한 «사업·사건»과/, '어디서 보는지 알려 줘야 한다');
});

/* ── 이력 칸이 원래 하던 일은 그대로 ── */

test('갈래·기간·담당·상태를 그대로 보여 준다 — 1단계에서 손대지 않았다', () => {
  const body = slice('function erpHistRowHtml(row, grouped){', 'var _coHist =');
  assert.match(body, /ERP_HIST_LABEL\[kind\]/, '갈래 딱지');
  assert.match(body, /row\.from/, '기간');
  assert.match(body, /erpMgrName\(row\.mgr\)/, '담당');
  assert.match(body, /ERP_HIST_STAT_LABEL\[row\.stat\]/, '상태');
});

test('네 갈래를 다 본다 — 컨설팅·사건·기금·기타', () => {
  const body = slice('const ERP_HIST_KINDS = [', 'let _erpCaseCons');
  ['consulting', 'case', 'fund', 'other'].forEach(k => {
    assert.ok(body.indexOf("kind:'" + k + "'") >= 0, k + ' 갈래가 빠졌다');
  });
});

test('기록이 없으면 칸을 안 그린다 — 빈 칸이 자리만 먹으면 안 된다', () => {
  const body = slice('function coHistPaint(){', 'function coFTabList(folder){');
  assert.match(body, /if\(!recs\.length\)\{ box\.innerHTML=''; return; \}/);
});
