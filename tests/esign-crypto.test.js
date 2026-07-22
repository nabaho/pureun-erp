'use strict';
// 전자위임장 암호화 모듈 단위테스트 — 실행: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const EC = require('../js/esign-crypto.js');

test('randomToken: 32자 hex, 매번 다름', () => {
  const a = EC.randomToken(), b = EC.randomToken();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notStrictEqual(a, b);
});

test('제출 암호화 라운드트립: 원본과 복호화 결과 일치', async () => {
  const keys = await EC.generateCaseKeys();
  const data = { name: '홍길동', idNo: '790101-1234567', phone: '010-1234-5678', sigPng: 'data:image/png;base64,AAAA' };
  const sealed = await EC.encryptSubmission(data, keys.pubKeyJwk);
  assert.ok(sealed.enc && sealed.encKey && sealed.iv);
  // 암호문에 평문이 노출되지 않아야 함
  assert.ok(!JSON.stringify(sealed).includes('홍길동'));
  const opened = await EC.decryptSubmission(sealed, keys.privKeyJwk);
  assert.deepStrictEqual(opened, data);
});

test('개인키 비밀번호 보호 라운드트립', async () => {
  const keys = await EC.generateCaseKeys();
  const prot = await EC.protectPrivKey(keys.privKeyJwk, '사건비번1234');
  assert.ok(prot.data && prot.salt && prot.iv);
  const restored = await EC.unprotectPrivKey(prot, '사건비번1234');
  assert.deepStrictEqual(restored, keys.privKeyJwk);
});

test('개인키 비밀번호 오입력 시 실패', async () => {
  const keys = await EC.generateCaseKeys();
  const prot = await EC.protectPrivKey(keys.privKeyJwk, '올바른비번');
  await assert.rejects(EC.unprotectPrivKey(prot, '틀린비번'));
});

test('다른 사건 키로는 복호화 불가', async () => {
  const k1 = await EC.generateCaseKeys();
  const k2 = await EC.generateCaseKeys();
  const sealed = await EC.encryptSubmission({ name: '홍길동' }, k1.pubKeyJwk);
  await assert.rejects(EC.decryptSubmission(sealed, k2.privKeyJwk));
});
