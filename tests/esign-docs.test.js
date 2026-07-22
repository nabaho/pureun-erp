'use strict';
const test = require('node:test');
const assert = require('node:assert');
const ED = require('../js/esign-docs.js');

test('fmtIdNo: 숫자만 뽑아 하이픈 형식으로', () => {
  assert.strictEqual(ED.fmtIdNo('7901011234567'), '790101-1234567');
  assert.strictEqual(ED.fmtIdNo('790101 - 1234567'), '790101-1234567');
});

test('validateIdNo: 정상 형식 통과', () => {
  assert.strictEqual(ED.validateIdNo('790101-1234567').ok, true);   // 내국인
  assert.strictEqual(ED.validateIdNo('900215-5234567').ok, true);   // 외국인등록번호(5~8)
});

test('validateIdNo: 불량 형식 거부', () => {
  assert.strictEqual(ED.validateIdNo('79010-1234567').ok, false);    // 자릿수 부족
  assert.strictEqual(ED.validateIdNo('791301-1234567').ok, false);   // 13월
  assert.strictEqual(ED.validateIdNo('790132-1234567').ok, false);   // 32일
  assert.strictEqual(ED.validateIdNo('790101-0234567').ok, false);   // 성별코드 0
  assert.strictEqual(ED.validateIdNo('').ok, false);
});

test('maskIdNo: 뒤 6자리 마스킹', () => {
  assert.strictEqual(ED.maskIdNo('790101-1234567'), '790101-1******');
});

test('fillVars: 플레이스홀더 치환', () => {
  assert.strictEqual(ED.fillVars('성명: {{이름}} ({{주민등록번호}})', { '이름': '홍길동', '주민등록번호': '790101-1234567' }),
    '성명: 홍길동 (790101-1234567)');
});

test('ESIGN_FORMS: 3종 양식 존재, 플레이스홀더 포함', () => {
  ['delegationAgreement', 'delegation', 'privacyConsent'].forEach(function (k) {
    assert.ok(ED.ESIGN_FORMS[k] && ED.ESIGN_FORMS[k].title && ED.ESIGN_FORMS[k].body.length > 100, k);
  });
  assert.ok(ED.ESIGN_FORMS.delegation.body.includes('{{이름}}'));
});
