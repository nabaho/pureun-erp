/* #pcDetail 은 원래 body.pc 일 때만 옆에 붙는 패널로 보였다(display:none 이 기본).
   폰(760px 이하)에서는 .open 이 붙으면 전체화면으로 보이게 하는 CSS 를 확인한다.
   ⚠ 내용(coDetailPanelHtml 등)은 손대지 않는다 — CSS 만 추가하는 과제다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

test('#pcDetail 은 여전히 body.pc 가 아니면 기본은 숨겨져 있다', () => {
  assert.match(source, /#pcDetail\{[^}]*display:none/);
});

test('760px 이하에서 #pcDetail.open 은 전체화면으로 뜬다', () => {
  const at = source.indexOf('#pcDetail{');
  assert.ok(at > 0);
  const around = source.slice(at, at + 1500);
  assert.match(around, /@media\(max-width:760px\)\{[^}]*#pcDetail\.open\{[^}]*display:flex/s);
  assert.match(around, /@media\(max-width:760px\)\{[^}]*#pcDetail\.open\{[^}]*position:fixed;\s*inset:0/s);
});

test('coDetailPanelHtml·openCoDetailPanel·closePcDetail 은 그대로다(내용은 안 건드림)', () => {
  assert.match(source, /function coDetailPanelHtml\(o\)/);
  assert.match(source, /function openCoDetailPanel\(key\)/);
  assert.match(source, /function closePcDetail\(\)/);
});
