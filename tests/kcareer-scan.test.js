'use strict';
// kcareer 서류 폴더 스캔·판정 모듈 단위테스트 — 실행: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const KS = require('../js/kcareer-scan.js');

test('isIgnoredFile: 임시·잠금·부산물 파일은 읽지 않는다', () => {
  assert.equal(KS.isIgnoredFile('.~lock.경력증명서 서류목록.xlsx#'), true);
  assert.equal(KS.isIgnoredFile('~$사무실사건.xlsx'), true);
  assert.equal(KS.isIgnoredFile('4NZFL.DOCX'), true);
  assert.equal(KS.isIgnoredFile('CLAUDE.md'), true);
  assert.equal(KS.isIgnoredFile('test_write'), true);
  assert.equal(KS.isIgnoredFile(''), true);
});

test('isIgnoredFile: 실제 서류는 읽는다', () => {
  assert.equal(KS.isIgnoredFile('2015 체당금국선노무사 위촉장 (2015.12.17).pdf'), false);
  assert.equal(KS.isIgnoredFile('위촉장.jpg'), false);
  assert.equal(KS.isIgnoredFile('컨설팅_실적증명_목록.xlsx'), false);
});

test('cleanCore: 확장자·발급일 괄호·사본 연번을 떼고 끝을 다듬는다', () => {
  assert.equal(KS.cleanCore('2015 체당금국선노무사 위촉장 (2015.12.17).pdf'), '2015 체당금국선노무사 위촉장');
  assert.equal(KS.cleanCore('충남지회 회장 위촉장 (2).pdf'), '충남지회 회장 위촉장');
  assert.equal(KS.cleanCore('4. 협약서.hwp'), '4. 협약서');
  assert.equal(KS.cleanCore('위촉장_.jpg'), '위촉장');
});

test('extOf: 소문자 확장자', () => {
  assert.equal(KS.extOf('인력양성사업 협약서.PDF'), 'pdf');
  assert.equal(KS.extOf('위촉장.jpg'), 'jpg');
  assert.equal(KS.extOf('test_write'), '');
});
