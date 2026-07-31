'use strict';
// kcareer.html 정적 검사 — 실행: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');

test('판정 모듈을 외부 파일로 로드한다', () => {
  assert.match(source, /<script src="js\/kcareer-scan\.js"><\/script>/);
});

test('서류 폴더는 읽기 전용으로만 연다 — readwrite 요청이 없어야 한다', () => {
  assert.ok(!/mode:\s*'readwrite'/.test(source), '원본 폴더에 쓰기 권한을 요청하면 안 됩니다');
  assert.ok(!/createWritable/.test(source), '원본 파일에 쓰기를 시도하면 안 됩니다');
  assert.ok(!/removeEntry/.test(source), '원본 파일을 삭제하면 안 됩니다');
});

test('폴더 연결 함수가 있다', () => {
  assert.match(source, /function fsSupported\(\)/);
  assert.match(source, /async function fsConnectFolder\(\)/);
  assert.match(source, /async function fsRoot\(\)/);
});
