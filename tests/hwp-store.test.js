const test = require('node:test');
const assert = require('node:assert/strict');

global.PureunHwp = require('../js/pu-hwp-engine.js');
const store = require('../js/pu-hwp-store.js');

test('사건별 문서 키를 일정하게 만든다', () => {
  assert.equal(store.recordId('esign-case', 'case 123'), 'esign-case::case_123');
});

test('빈 보관 위치는 거부한다', () => {
  assert.throws(() => store.recordId('', 'case-1'), /보관 위치/);
});

test('브라우저 보관소가 없으면 명확한 오류를 반환한다', async () => {
  const hwp = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  await assert.rejects(store.putBytes('esign-case', 'case-1', hwp, 'sample.hwp'), /브라우저/);
});
