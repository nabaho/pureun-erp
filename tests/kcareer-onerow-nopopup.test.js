/* 경력관리 — 팝업 없이 «지금 화면»에서 끝내기 + 머리를 한 줄로
   (대표 지시 2026-08-30: 「잘 안된다 … 팝업 창 없이 현재 화면에서 정리할 수 있게
    … 캡쳐3 한줄로 만들어라」)

   무엇이 문제였나 — 실측 셋:
   ① 서식을 «올리기만 해도» 큰 창이 튀어나왔다. 편집기에 원본이 이미 나오는데
      같은 것을 한 번 더 덮어 보여 주면서, 닫기·저장을 그 창 안에서만 하게 만들었다.
   ② 「내 정보로 채우기」 단추가 «두 개»고 서로 다르게 동작했다.
      팝업 쪽은 칸 지도도 AI 짝짓기도 되돌리기도 안 걸리는 옛 길이었다 — 「잘 안된다」.
   ③ 「하던 작업이 있습니다」가 «따로 한 줄»을 먹어 머리가 두 줄이었다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cutFn } = require('./cut-fn');

const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');
/* 소스를 글자로 보는 검사는 «주석을 먼저 걷는다» — 잘 쓴 주석이 검사를 통과시킨다 */
const bare = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

/* ── ① 팝업이 저절로 뜨지 않는다 ── */

test('★ 서식을 올려도 큰 창이 «저절로» 뜨지 않는다', () => {
  const fn = cutFn(bare, 'async function importTemplateFile(');
  assert.ok(fn.indexOf('mountEditor(buf,fname,cfg)') > 0, '올리기 길을 찾지 못했습니다');
  assert.doesNotMatch(fn, /openHwpViewer/,
    '올리자마자 팝업을 띄우면 화면이 덮이고 닫기·저장을 그 안에서만 하게 됩니다');
});

test('★ 채운 뒤에도 팝업으로 튀지 않는다 — 보던 화면에 그대로 나온다', () => {
  const fn = cutFn(bare, 'async function rhAutoFillDoc_');
  assert.doesNotMatch(fn, /openHwpViewer\(filled/, '채운 결과는 지금 화면에 얹어야 합니다');
  assert.match(fn, /mountEditor\(/);
});

test('큰 창은 «원할 때만» 연다 — 단추는 남아 있어야 한다', () => {
  assert.match(source, /onclick="rhOpenBigPopup\(\)"/,
    '팝업을 아예 없애지는 않습니다 — 크게 보고 싶을 때가 있습니다');
});

/* ── ② 채우는 길은 하나 ── */

test('★ 「내 정보로 채우기」는 칸 지도가 있으면 «좋은 쪽»으로 간다', () => {
  const fn = cutFn(bare, 'async function rhAutoFillDoc(');
  assert.match(fn, /_rhMap/, '칸 지도가 있는지 먼저 봐야 합니다');
  assert.match(fn, /rhFillByMap\(\)/,
    '칸 지도·AI 짝짓기·되돌리기가 걸린 길로 넘겨야 합니다');
});

test('★ 팝업에서 눌러도 «지금 화면»에서 채운다 — 창을 닫고 간다', () => {
  assert.match(cutFn(bare, 'async function rhAutoFillDoc('), /closeHwpView\(\)/);
});

test('두 단추가 같은 곳으로 간다 — 어느 것을 눌러도 결과가 같아야 한다', () => {
  const calls = (source.match(/onclick="rhAutoFillDoc\(\)"/g) || []).length;
  assert.ok(calls >= 2, '인라인과 팝업 두 자리에 있어야 합니다 (지금 ' + calls + ')');
});

/* ── ③ 닫기·임시저장을 지금 화면에서 ── */

test('★ 팝업에 들어가지 않고 «치우기»가 된다', () => {
  assert.match(source, /onclick="rhCloseDoc\(\)"/, '치우기 단추가 편집 줄에 있어야 합니다');
  assert.match(bare, /async function rhCloseDoc/);
});

test('★ 치우는 것과 «버리는 것»은 다르다 — 치워도 담아 둔 것은 남는다', () => {
  const fn = cutFn(bare, 'async function rhCloseDoc(');
  assert.doesNotMatch(fn, /rhDraftDrop|deleteFile\(RH_DRAFT\)/,
    '치웠다가 「↩ 이어서」로 돌아올 수 없으면 아무도 치우지 않습니다');
  assert.match(fn, /rhDraftNow\(\)/, '치우기 전에 담아야 합니다');
});

test('치우면 편집 카드가 «내려간다» — 빈 화면이 남으면 안 된다', () => {
  const fn = cutFn(bare, 'async function rhCloseDoc(');
  assert.match(fn, /rcEditCard/);
  assert.match(fn, /rh-doc-on/, '한글 서식 넓은 배치도 풀어야 합니다');
});

test('★ 임시저장을 «눌러서» 할 수 있다 — 저절로 되는 것은 눈에 안 보인다', () => {
  assert.match(source, /onclick="rhDraftNow\(\)"/);
  const fn = cutFn(bare, 'async function rhDraftNow(');
  assert.match(fn, /exportEditedHwpx\(\)/, '지금 편집기에 있는 그대로를 담아야 합니다');
  assert.match(fn, /rhDraftSave\(\)/);
});

/* ── ④ 머리가 한 줄 ── */

test('★ 「하던 작업」 딱지는 올리기 줄 «안»에 있다 — 따로 한 줄을 먹으면 안 된다', () => {
  const at = source.indexOf('id="rhUploadBar"');
  const end = source.indexOf('</div><!-- .rh-topbar -->');
  assert.ok(at > 0 && end > at, '올리기 줄을 찾지 못했습니다');
  assert.ok(source.slice(at, end).indexOf('id="rhResumeBar"') > 0,
    '「이어서 하기」가 올리기 줄 밖에 있으면 머리가 두 줄이 됩니다');
});

test('딱지 하나만 있다 — 옛 자리에 남겨 두면 두 개가 뜬다', () => {
  assert.equal((source.match(/id="rhResumeBar"/g) || []).length, 1);
});

test('이름이 길어도 줄을 밀지 않는다 — …으로 줄이고 전체는 마우스로 본다', () => {
  const name = source.slice(source.indexOf('.rh-chip-name{'), source.indexOf('.rh-chip-name{') + 200);
  assert.match(name, /text-overflow:\s*ellipsis/);
  const chip = source.slice(source.indexOf('.rh-chip{'), source.indexOf('.rh-chip{') + 250);
  assert.match(chip, /max-width/);
  assert.match(bare, /msg\.title=/, '전체 이름을 볼 방법이 있어야 합니다');
});

test('★ 딱지가 떠 있을 때만 설명글을 접는다 — 창 너비로 재면 안 걸린다', () => {
  /* 창은 1920인데 이 줄이 실제로 쓰는 폭은 1200이라, @media 로는 영영 안 걸렸다(실측). */
  assert.match(source, /#rhUploadBar\.has-chip \.rc-drop-sub\{display:none\}/);
  assert.match(cutFn(bare, 'function rhDraftCheck('), /classList\.toggle\('has-chip'/);
});
