const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const rules = fs.readFileSync(path.join(root, 'rules.html'), 'utf8');
const writer = fs.readFileSync(path.join(root, 'chwieop.html'), 'utf8');
const generator = fs.readFileSync(path.join(root, 'hwpx_gen.js'), 'utf8');

function scriptOrder(source) {
  return {
    engine: source.indexOf('js/pu-hwp-engine.js'),
    generator: source.indexOf('hwpx_gen.js')
  };
}

test('employment-rules screens load the shared engine before the HWPX generator', () => {
  for (const source of [rules, writer]) {
    const order = scriptOrder(source);
    assert.ok(order.engine >= 0 && order.generator > order.engine);
  }
});

test('all HWPX generator downloads pass through common validation and download', () => {
  assert.match(generator, /common\.validate\(u8,fname\)/);
  assert.match(generator, /common\.download\(u8,fname,"hwpx"\)/);
  assert.match(generator, /return u8/);
});

test('rules document families continue to use the one shared generator route', () => {
  for (const label of ['신구대조표', '취업규칙제출서류', 'downloadOneDoc']) {
    assert.match(rules, new RegExp(label));
  }
  assert.match(writer, /H\.download\(body,'취업규칙_'/);
});
