const test = require('node:test');
const assert = require('node:assert/strict');
const Hwp = require('../js/pu-hwp-engine.js');
const HWPX = require('../hwpx_gen.js');

function hwpBytes() {
  return Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
}

function hwpxBytes() {
  return Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);
}

test('HWP and HWPX are detected by their real file signatures', () => {
  assert.equal(Hwp.detectFormat(hwpBytes(), 'sample.hwp'), 'hwp');
  assert.equal(Hwp.detectFormat(hwpxBytes(), 'sample.hwpx'), 'hwpx');
});

test('a disguised extension is rejected before it reaches the editor', () => {
  assert.throws(() => Hwp.validate(hwpBytes(), 'sample.hwpx'), /확장자/);
  assert.throws(() => Hwp.validate(Uint8Array.from([1, 2, 3]), 'sample.pdf'), /HWP/);
  assert.throws(() => Hwp.validate(Uint8Array.from([1, 2, 3]), 'fake.hwp'), /HWP/);
});

test('empty and oversized documents are rejected', () => {
  assert.throws(() => Hwp.validate(new Uint8Array(), 'empty.hwp'), /빈 문서/);
  assert.throws(() => Hwp.validate(hwpBytes(), 'large.hwp', { maxFileBytes: 4 }), /너무 큽니다/);
});

test('the existing HWPX generator produces a document accepted by the common engine', () => {
  const bytes = HWPX.build(HWPX.para('푸른 통합 한글문서 검사'));
  const meta = Hwp.validate(bytes, '취업규칙_검사.hwpx');
  assert.equal(meta.format, 'hwpx');
  assert.ok(meta.size > 1000);
});
