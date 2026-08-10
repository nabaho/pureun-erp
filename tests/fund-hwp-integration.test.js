const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'fund.html'), 'utf8');

test('fund management loads the shared HWP engine before its application code', () => {
  const engineAt = source.indexOf('js/pu-hwp-engine.js');
  const appAt = source.indexOf('<script>', engineAt);
  assert.ok(engineAt >= 0 && appAt > engineAt);
});

test('single and bulk HWP registration validate files before IndexedDB storage', () => {
  assert.match(source, /PureunHwp\.validate\(rd\.result,file\.name\)/);
  assert.match(source, /PureunHwp\.validate\(rd\.result,p\[1\]\.name\)/);
});

test('editing uses the shared adapter and has preview and original-download fallbacks', () => {
  assert.match(source, /PureunHwp\.createEditor/);
  assert.match(source, /PureunHwp\.renderPreview/);
  assert.match(source, /function hwpDownloadOriginal\(\)/);
  assert.doesNotMatch(source, /import\(RHWP_EDITOR_URL\)/);
});

test('the HWP modal has a narrow-screen layout', () => {
  assert.match(source, /@media\(max-width:700px\)/);
  assert.match(source, /hwpData\{display:none\}/);
  assert.match(source, /flex-wrap:wrap/);
});
