'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');

test('★ 관리자 카드에 서버 이사 버튼이 있다', () => {
  assert.match(app, /runServerMigrate\(\)/);
  assert.match(app, /전체 직원 사진 창고로 옮기기/);
});

test('★ 되돌릴 수 없는 일이라 먼저 confirm 을 받는다', () => {
  const fn = app.match(/function runServerMigrate\([\s\S]*?\n\}/);
  assert.ok(fn, 'runServerMigrate 를 찾지 못했습니다.');
  assert.match(fn[0], /confirm\(/);
  assert.match(fn[0], /지워집니다/, '실시간DB에서 지워진다는 안내가 없습니다');
});

test('★ done 이 올 때까지 자동으로 이어서 호출한다', () => {
  const fn = app.match(/function runServerMigrate\([\s\S]*?\n\}/)[0];
  assert.match(fn, /r\.done/, 'done 값을 안 봅니다 — 한 번만 호출하고 멈추면 나머지가 안 옮겨집니다.');
});

test('★ 로그인 토큰을 실어 보낸다 — 안 실으면 401 로 거절됩니다', () => {
  const fn = app.match(/function runServerMigrate\([\s\S]*?\n\}/)[0];
  assert.match(fn, /getIdToken\(\)/);
  assert.match(fn, /Authorization.*Bearer/);
});

test('진행 상황을 화면에 누적으로 보여준다', () => {
  const fn = app.match(/function runServerMigrate\([\s\S]*?\n\}/)[0];
  assert.match(fn, /moved/);
  assert.match(fn, /failed/);
});
