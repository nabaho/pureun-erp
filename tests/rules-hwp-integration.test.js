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
  assert.match(writer, /H\.download\(\[\{body:body[\s\S]{0,90}'취업규칙_'/);
});

/* 취업규칙 작성기가 내는 한글본은 노동부 표준취업규칙과 같은 조판이어야 한다 —
   원본과 mm 단위로 맞춘 값은 rule 용지 프리셋과 조 문단(articleRun)에 들어 있다.
   조마다 「제N조 (제목) 본문」을 한 문단에 통째로 넣으면 줄간격·들여쓰기가 어긋난다. */
test('취업규칙 작성기는 표준취업규칙 조판(rule 프리셋·조 제목만 굵게)으로 낸다', () => {
  assert.match(writer, /HWPXDOC/);
  assert.match(writer, /D\.begin\('rule'\)/);
  assert.match(writer, /H\.articleRun\(\{title:/);
  assert.match(writer, /H\.chapter\(/);
});
