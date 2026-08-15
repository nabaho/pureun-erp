'use strict';
// 앱바 등록 — 실행: node --test tests/*.test.js
//   새 프로그램을 만들 때 앱바 목록에 한 줄을 더하지 않으면
//   그 프로그램만 오갈 수 없는 섬이 된다(대표 지시 2026-08-07).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('★ 앱바 목록에 급여데이터함이 있다', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-appbar.js'), 'utf8');
  assert.match(src, /key:\s*'paydata'/);
  assert.match(src, /pu-paydata\.html/);
});

test('★ 앱바가 가리키는 파일이 실제로 있다', () => {
  const R = path.join(__dirname, '..');
  const src = fs.readFileSync(path.join(R, 'js', 'pu-appbar.js'), 'utf8');
  // 목록에 적힌 주소가 없는 파일이면 눌렀을 때 빈 화면이 뜬다.
  const urls = src.match(/url:\s*'([^']+\.html)'/g) || [];
  assert.ok(urls.length > 0, '앱바 목록에서 주소를 찾을 수 없습니다');
  urls.forEach(u => {
    const f = u.match(/'([^']+)'/)[1];
    assert.ok(fs.existsSync(path.join(R, f)), '앱바가 없는 파일을 가리킵니다: ' + f);
  });
});
