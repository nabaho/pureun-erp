/* 기업정보함 — 사진 없는 기존 항목에 앞면 사진 붙이기 (대표 지시 2026-08-15)

   왜: "원본 사진 없음" 안내의 [📁 사진 첨부] 버튼이 fileInput(새 항목 올리기
   대기열)으로 갔다 — 눌러 사진을 고르면 openEditor(null,…) 로 **새 항목**이
   열려, 지금 고치던 이름·회사 등은 그 새 항목에 남고 원래 항목은 그대로
   사진 없는 채로 남았다. 사진첩의 "원본이 없습니다" 복구 기능(본문만 다시
   올리기)을 만들다가 기업정보함에서도 같은 문제를 찾아 함께 고친다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8');

test('★ 사진 없는 항목의 [사진 첨부] 버튼은 fileInput(새 항목 올리기)이 아니라 frontInput 을 연다', () => {
  const m = html.match(/원본 사진 없음[\s\S]{0,200}/);
  assert.ok(m, '"원본 사진 없음" 안내를 찾지 못했습니다.');
  assert.match(m[0], /onclick="frontInput\.click\(\)"/,
    'fileInput 으로 가면 지금 고치던 이름·회사가 새 항목에 남고, 사진 없는 원래 항목은 그대로 남습니다.');
  assert.doesNotMatch(m[0], /onclick="fileInput\.click\(\)"/);
});

test('★ frontInput 은 한 장만 받는다 — 새 항목 올리기 대기열과 안 섞인다', () => {
  const m = html.match(/<input type="file" id="frontInput"[^>]*>/);
  assert.ok(m, 'frontInput 을 찾지 못했습니다.');
  assert.doesNotMatch(m[0], /multiple/, '한 장만 바꾸는 자리라 여러 장을 받으면 안 됩니다.');
  assert.match(m[0], /onchange="onFrontFile\(this\.files\)/);
});

test('★ onFrontFile 은 openEditor 를 다시 안 부른다 — 지금 열린 항목을 그대로 고친다', () => {
  const fn = html.match(/async function onFrontFile\([\s\S]*?\n\}/);
  assert.ok(fn, 'onFrontFile 을 찾지 못했습니다.');
  assert.doesNotMatch(fn[0], /openEditor\(/,
    '★ openEditor(null,…) 를 부르면 새 항목 창이 열려, 지금 입력 중이던 이름·회사가 새 항목으로 갑니다.');
  assert.match(fn[0], /editing\.photo = await fileToImage\(f\)/);
  assert.match(fn[0], /editing\.photoDirty = true/,
    'photoDirty 를 안 세우면 저장할 때 saveEditor 가 새 사진을 반영하지 않습니다.');
});

test('저장할 때는 editing.id 를 그대로 쓴다 — 새 id 를 만들지 않는다', () => {
  // onFrontFile 자체가 아니라 saveEditor 의 전제조건이다 — 이게 무너지면
  // photoDirty 를 세워도 사진이 새 항목에 붙는다.
  const fn = html.match(/async function saveEditor\(\)[\s\S]*?\n\}/);
  assert.ok(fn, 'saveEditor 를 찾지 못했습니다.');
  assert.match(fn[0], /id: editing\.id\|\|uid\(\)/,
    'editing.id 가 있는데도 새 id 를 만들면, 사진만 새로 붙여도 새 항목이 됩니다.');
});
