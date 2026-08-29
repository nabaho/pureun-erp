/* 칸 지도 화면 — 「모르는 자리를 물어보는 길」이 실제로 화면에 있는가
   설계서: docs/superpowers/specs/2026-08-29-kcareer-칸지도-서식채움-design.md */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
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

test('★ 전화번호는 «모양»으로 갈라 담는다 — 사무실 번호가 「휴대폰」 칸에 박히면 안 된다', () => {
  const fn = bare.slice(bare.indexOf('function _cvFillData'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.match(body, /phoneWork/, '사무실 번호 자리가 있어야 합니다');
  assert.doesNotMatch(body, /phone:\s*info\.phone/,
    '번호 하나를 그대로 휴대폰에 넣으면 틀린 번호가 서류에 나갑니다');
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
