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

test('자료 바이트 읽기는 한 곳에만 있다', () => {
  /* 같은 코드가 여러 벌이면 한 곳만 고쳐져 어긋난다.
     읽기(once)는 한 곳이어야 한다 — 쓰기(set)·지우기(remove)는 그대로 둔다.
     charCodeAt 으로 세지 않는다: 자료함과 상관없는 _unb64 도 그것을 쓴다. */
  assert.match(source, /async function matBytes\(id\)/);
  /* 따옴표·공백이 다르게 적힌 중복(예: DB_ROOT + '/materialFiles/' + id)도
     잡아야 한다 — 붙여쓴 모양만 세면 다시 베껴 써도 셈이 그대로 1로 나온다. */
  const reads = (source.match(/materialFiles\/\s*['"]?\s*\+?\s*id\s*\)\s*\.once\(/g) || []).length;
  assert.equal(reads, 1, '자료 파일을 읽는 곳이 아직 여러 곳입니다');
});

test('자료를 읽는 세 곳이 모두 matBytes 를 쓴다', () => {
  const each = ['async function downloadMaterial', 'async function fillMatPreview', 'async function previewMaterial'];
  each.forEach(head => {
    const at = source.indexOf(head);
    assert.ok(at > 0, head + ' 을 찾지 못했습니다');
    assert.match(source.slice(at, at + 2200), /await matBytes\(id\)/, head + ' 이 아직 직접 읽습니다');
  });
});

test('파일이 없으면 조용히 넘기지 않고 알린다', () => {
  const fn = source.slice(source.indexOf('async function matBytes'), source.indexOf('async function matBytes') + 600);
  assert.match(fn, /throw new Error/);
});
