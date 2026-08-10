const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

test('명함첩은 공통 한글 엔진을 Firebase 사용 코드보다 먼저 읽는다', () => {
  const engine = source.indexOf('js/pu-hwp-engine.js');
  const auth = source.indexOf('firebase-auth-compat.js');
  assert.ok(engine > 0);
  assert.ok(auth > engine);
});

test('자료함의 HWP/HWPX는 다운로드 전에 공통 미리보기를 연다', () => {
  assert.match(source, /function openMaterialHwp/);
  assert.match(source, /PureunHwp\.validate\(bytes,name\)/);
  assert.match(source, /PureunHwp\.renderPreview\(\$\('matHwpBody'\),bytes,name\)/);
  assert.match(source, /if\(\/\^\(hwp\|hwpx\)\$\/\.test\(matExt\(m\.fileName\)\)\)/);
});

test('미리보기 실패 시에도 원본을 내려받을 수 있다', () => {
  assert.match(source, /function downloadMaterialOriginal/);
  assert.match(source, /PureunHwp\.download\(_matHwpCurrent\.bytes/);
  assert.match(source, /원본은 그대로 보관되어 있습니다/);
});

test('한글 자료 창은 모바일에서 화면을 넘지 않는다', () => {
  assert.match(source, /\.mat-hwp-modal\{width:min\(1100px,96vw\)/);
  assert.match(source, /@media\(max-width:760px\)[\s\S]*?\.mat-hwp-modal\{width:100%;height:94vh/);
});
