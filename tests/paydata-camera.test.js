'use strict';
// 폰 촬영 — 실행: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-paydata.html'), 'utf8');

test('★ 폰에서 카메라가 바로 열린다', () => {
  // capture 없이 accept="image/*" 만 두면 갤러리가 먼저 뜬다.
  assert.match(html, /capture=["']environment["']/);
});

test('찍은 것도 같은 담기 층을 쓴다', () => {
  // 촬영만 다른 길로 담으면 검사·상한·확장자 규칙이 갈린다.
  const m = html.match(/function shotToPending[\s\S]*?\n\}/);
  assert.ok(m, 'shotToPending 함수가 없습니다');
  assert.match(m[0], /S\.saveFile/);
});

test('찍은 것은 촬영으로 표시된다', () => {
  const m = html.match(/function shotToPending[\s\S]*?\n\}/);
  assert.match(m[0], /camera/);
});

test('★ 촬영 단추는 대기 칸이 비어 있어도 보인다', () => {
  // 파일 올리기 단추와 같은 원칙 — 목록이 비면 일찍 끝나 단추까지 사라지면
  // 처음 쓰는 사람은 찍을 방법을 못 찾는다.
  const m = html.match(/function screenPending[\s\S]*?\n\}/);
  const beforeReturn = m[0].slice(0, m[0].indexOf('if (!ids.length)'));
  assert.match(beforeReturn, /pickShot\(\)/);
  assert.match(beforeReturn, /id="shotPick"/);
});

test('한 번에 여러 장 찍은 것도 받는다', () => {
  const m = html.match(/function shotToPending[\s\S]*?\n\}/);
  assert.match(m[0], /Promise\.all/);
});

test('찍어서 올리다 막히면 조용히 넘어가지 않고 알린다', () => {
  const m = html.match(/function shotToPending[\s\S]*?\n\}/);
  assert.match(m[0], /alert\(/);
});
