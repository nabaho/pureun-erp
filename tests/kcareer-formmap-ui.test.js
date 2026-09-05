/* 칸 지도 화면 — 「모르는 자리를 물어보는 길」이 실제로 화면에 있는가
   설계서: docs/superpowers/specs/2026-08-29-kcareer-칸지도-서식채움-design.md */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cutFn } = require('./cut-fn');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');
/* 주석을 먼저 걷는다 — 잘 쓴 주석이 검사를 통과시켜서는 안 된다 */
const bare = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

test('칸 지도 모듈을 읽어 들인다 — 캐시 번호를 붙여서', () => {
  assert.match(source, /js\/kcareer-formmap\.js\?v=\d+/);
});

test('오른쪽 패널이 세 칸 서랍이다 — 채울 곳 · 내 정보 · 경력·자격', () => {
  assert.match(bare, /function rhDrawerTab/);
  ['채울 곳', '내 정보', '경력·자격'].forEach((t) =>
    assert.ok(source.indexOf(t) > 0, '「' + t + '」 칸이 있어야 합니다'));
});

test('★ 「내 정보」 목록이 있다 — 성명·연락처를 클릭으로 넣을 길이 없어서 손으로 쳤다', () => {
  assert.match(bare, /function rhRenderMyInfo/);
  const fn = bare.slice(bare.indexOf('function rhRenderMyInfo'));
  assert.match(fn.slice(0, 1200), /insertToEditor\(/, '클릭하면 편집기 커서 자리에 들어가야 합니다');
});

test('서랍을 접을 수 있다 — 접으면 문서가 화면을 다 쓴다', () => {
  assert.match(bare, /function rhDrawerToggle/);
  assert.match(source, /rh-drawer-off/);
});

test('★ 채운 결과를 «보고 있는 편집기»에 다시 올린다 — 다른 창에만 띄우면 손으로 친다', () => {
  const fn = bare.slice(bare.indexOf('function rhFillByMap'));
  assert.match(fn.slice(0, 3000), /mountEditor\(/,
    '편집기를 다시 올려야 이어서 손볼 수 있습니다');
});

test('못 읽은 글상자·중첩표를 화면에 적는다 — 조용히 빠지면 「비어 있다」가 된다', () => {
  assert.match(bare, /warn\.textBoxes/);
  assert.match(bare, /warn\.nested/);
});

test('넣지 못한 자리를 화면에 적는다', () => {
  assert.match(bare, /failed\.length/);
});

test('고른 짝을 «서식 지문»으로 기억한다 — 서식이 바뀌면 옛 기억을 쓰지 않는다', () => {
  assert.match(bare, /function rhMemorySave/);
  assert.match(bare, /function rhMemoryLoad/);
  const save = bare.slice(bare.indexOf('function rhMemorySave'));
  assert.match(save.slice(0, 900), /\bfp\b/, '이름이 아니라 «지문»으로 기억해야 합니다');
});

test('기억은 서식마다 따로 담는다 — 하나로 뭉치면 서식을 바꿀 때 엉킨다', () => {
  assert.match(bare, /form_maps/);
});

test('주민등록번호 자리는 「자동으로 안 넣는다」고 화면에 적는다', () => {
  assert.match(bare, /rrn/);
});

test('★ 사무실 번호가 「휴대폰」 칸에 박히면 안 된다', () => {
  /* ⚠ 이 규칙을 지키는 «방법»이 2026-08-30 에 바뀌었다.
     전에는 번호 칸이 하나뿐이라 번호 «모양»을 보고 짐작해 갈랐다.
     이제 기본정보에 휴대폰·사무실이 따로 있어 짐작할 일이 없다 —
     대신 갈라 담기 «전»에 넣어 둔 옛 번호를 한 번 제자리로 옮긴다(_piMigrate).
     지켜야 할 것은 방법이 아니라 «사무실 번호가 휴대폰이라고 단언되지 않는 것»이다. */
  const fill = cutFn(bare, 'function _cvFillData(');
  assert.match(fill, /phoneWork/, '사무실 번호 자리가 있어야 합니다');
  const mig = cutFn(bare, 'function _piMigrate(');
  assert.match(mig, /01\[016789\]/, '휴대폰 모양을 보고 갈라야 합니다');
  assert.match(mig, /phoneWork=tel/, '휴대폰이 아니면 사무실 자리로 옮겨야 합니다');
  assert.match(mig, /o\.phone=''/, '옮겼으면 휴대폰 칸은 비워야 합니다 — 안 비우면 두 곳에 남습니다');
});

test('초록은 «실제로 채워진다»는 뜻이어야 한다 — 값이 없으면 노랑', () => {
  const fn = bare.slice(bare.indexOf('function rhRenderMap'));
  assert.match(fn.slice(0, 3000), /willFill/,
    '열쇠만 보고 초록으로 칠하면 「채운다더니 비어 있다」가 됩니다');
});

test('도장은 «누를 때만» 찍힌다 — 채우기와 한 단추로 묶지 않는다', () => {
  assert.match(bare, /function rhStampDoc/);
  /* 그 함수 «본문만» 본다 — 창을 넉넉히 잡으면 옆 함수까지 딸려 와 검사가 헛돈다 */
  const at = bare.indexOf('function rhFillByMap');
  const rest = bare.slice(at + 20);
  const end = rest.search(/\n(async )?function /);
  const fill = rest.slice(0, end > 0 ? end : 3000);
  assert.doesNotMatch(fill, /rhStampDoc|KcareerHwpStamp/,
    '채우기가 도장까지 찍으면 안 찍을 서류에도 찍힙니다');
});

test('도장 모듈을 읽어 들인다 — 캐시 번호를 붙여서', () => {
  assert.match(source, /js\/kcareer-hwpstamp\.js\?v=\d+/);
});

test('도장 자리를 못 찾으면 찍지 않고 알린다 — 아무 데나 날인하면 되돌릴 수 없다', () => {
  const at = bare.indexOf('function rhStampDoc');
  const fn = bare.slice(at, at + 3000);
  assert.match(fn, /if\(!done\)/, '자리를 못 찾았을 때의 길이 있어야 합니다');
});

/* ── ✍ 서식 입력판 (대표 제안·승인 2026-08-29) ── */

test('입력판 모듈을 읽어 들인다 — 캐시 번호를 붙여서', () => {
  assert.match(source, /js\/kcareer-formhtml\.js\?v=\d+/);
});

test('입력판과 「한글로 보기」를 오갈 수 있다 — 친 값이 진짜 A4에 어떻게 들어갔는지 본다', () => {
  assert.match(bare, /function rhSetMode/);
  assert.match(source, /id="kfSheet"/);
  assert.match(bare, /function rhPreviewHwp/);
});

test('★ 저장은 «원본 한글»에 넣는다 — HTML 을 그대로 내면 서식이 달라진다', () => {
  const at = bare.indexOf('function rhComposeBytes');
  const fn = bare.slice(at, at + 1400);
  assert.match(fn, /KcareerFormMap\.apply/, '원본 XML 의 그 칸에 넣어야 합니다');
  assert.match(fn, /values:\s*vals/, '입력판에 친 값을 넘겨야 합니다');
  assert.doesNotMatch(fn, /innerHTML/, 'HTML 을 그대로 내면 안 됩니다');
});

test('저장과 미리보기가 «같은 길»을 쓴다 — 갈라지면 보이는 것과 저장이 어긋난다', () => {
  ['rhSaveInput', 'rhPreviewHwp'].forEach((fn) => {
    const at = bare.indexOf('function ' + fn);
    assert.match(bare.slice(at, at + 800), /rhComposeBytes\(\)/, fn + ' 도 같은 길을 써야 합니다');
  });
});

test('「내 정보」를 누르면 «지금 짚은 칸»에 들어간다 — 커서 자리가 가장 안 헷갈린다', () => {
  const at = bare.indexOf('function insertToEditor');
  assert.match(bare.slice(at, at + 400), /rhPutValue\(text\)/);
});

test('못 그리는 것(글상자·칸 안의 표)을 화면에 적는다', () => {
  const at = bare.indexOf('function rhBuildInput');
  const fn = bare.slice(at, at + 2200);
  assert.match(fn, /textBoxes/);
  assert.match(fn, /nested/);
});

test('★ 입력판과 한글을 «나란히» 볼 수 있다 — 눈을 옮기지 않고 견준다', () => {
  assert.match(source, /id="kfM3"/);
  assert.match(source, /id="kfPair"/);
  assert.match(bare, /rhSetMode\('both'\)/);
  assert.match(source, /#kfPair\.kf-both\{display:grid;grid-template-columns:1fr 1fr/);
});

test('서식을 열면 머리 부분을 접는다 — 「너무 많이 공간을 차지한다」(대표 지적)', () => {
  assert.match(bare, /rh-doc-on/);
  assert.match(source, /\.rh-doc-on \.page>h2/, '서식을 보는 동안 제목 줄은 접습니다');
  assert.match(source, /\.rh-doc-on \.rh-fold>\.rh-fold-b\{display:none\}/);
});

test('머리를 «없애지는» 않는다 — 다른 서식으로 바꿔 올릴 길이 사라진다', () => {
  const at = source.indexOf('.rh-doc-on');
  const css = source.slice(at, at + 700);
  assert.doesNotMatch(css, /\.rh-fold\{display:none\}/, '접이칸 자체를 숨기면 안 됩니다');
  assert.match(css, /\.rh-fold>summary\{padding/, '요약 줄은 남아야 합니다');
});

test('머리를 한 줄 줄였다 — 모드 단추가 편집 줄 안에 있다 (대표 지적 2026-08-29)', () => {
  /* 「편집」 딱지만 있던 줄과 모드 줄이 따로 있어 머리가 세 줄이었다.
     딱지는 뺀다 — 단추가 이미 무슨 화면인지 말해 준다. */
  const at = source.indexOf('class="rc-bar"');
  const bar = source.slice(at, at + 1800);
  assert.ok(bar.indexOf('id="kfModes"') > 0, '모드 단추가 편집 줄 안에 있어야 합니다');
  assert.equal((source.match(/id="kfModes"/g) || []).length, 1, '모드 줄이 둘이면 안 됩니다');
});

test('안내문은 «따로» 한 줄 — 단추 줄에 끼우면 단추가 밀린다', () => {
  assert.match(source, /id="kfHintBar"/);
  assert.match(source, /\.kf-hintbar\{/);
});

test('★ 탭줄과 「양식 올리기」가 한 줄이다 (대표 지시 2026-08-30)', () => {
  assert.match(source, /class="rh-topbar"/);
  const seg = source.slice(source.indexOf('class="rh-topbar"'), source.indexOf('class="rh-topbar"') + 1800);
  assert.ok(seg.indexOf('id="rh-tabrow"') > 0, '탭줄이 그 안에 있어야 합니다');
  assert.ok(seg.indexOf('id="rhUploadBar"') > 0, '올리기 줄도 같은 칸에 있어야 합니다');
  assert.match(source, /\.rh-topbar\{display:flex[^}]*flex-wrap:wrap/, '좁아지면 내려가야 합니다');
});

test('★ 탭줄은 패널 «밖»에 있다 — 안에 넣으면 다른 탭에서 탭줄이 사라진다', () => {
  const hub = source.slice(source.indexOf('id="page-resume-hub"'));
  const iTab = hub.indexOf('id="rh-tabrow"');
  /* ⚠ 어느 탭이 첫 탭인지로 못박지 말 것 — 순서는 대표 지시로 바뀐다
     (2026-09-05 「기관 양식 채우기 우선」). 여기서 지킬 것은 «탭줄이 패널보다 앞»뿐이다. */
  const iPanel = hub.indexOf('class="tabpanel');
  assert.ok(iTab > 0 && iPanel > 0);
  assert.ok(iTab < iPanel, '탭줄이 첫 패널보다 앞이어야 합니다');
});

test('올리기 줄은 «양식 편집» 탭에서만 뜬다 — 보관함 탭에서는 쓸 일이 없다', () => {
  const at = bare.indexOf('function rhTab');
  assert.match(bare.slice(at, at + 900), /rhUploadBar[\s\S]{0,120}tabId==='rh-edit'/);
});
