const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'docs-esign.html'), 'utf8');
const signHtml = fs.readFileSync(path.join(__dirname, '..', 'sign.html'), 'utf8');

test('관리자 문서 화면은 공통 HWP 엔진과 기기 보관소를 순서대로 읽는다', () => {
  const engine = html.indexOf('js/pu-hwp-engine.js');
  const store = html.indexOf('js/pu-hwp-store.js');
  assert.ok(engine > 0);
  assert.ok(store > engine);
});

test('사건 상세에 한글 원본 관리 동작이 연결되어 있다', () => {
  assert.match(html, /openCaseHwp\(\)/);
  assert.match(html, /PureunHwpStore\.putFile\('esign-case', curCaseId/);
  assert.match(html, /PureunHwp\.renderPreview/);
  assert.match(html, /원본 다운로드/);
});

test('공개 근로자 서명 화면에는 관리자 HWP 보관 기능을 노출하지 않는다', () => {
  assert.doesNotMatch(signHtml, /pu-hwp-store\.js/);
  assert.doesNotMatch(signHtml, /openCaseHwp/);
});
