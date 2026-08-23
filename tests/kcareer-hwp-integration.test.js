const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'kcareer.html'), 'utf8');

test('이력관리는 공통 한글 엔진과 HWPX 생성기를 순서대로 읽는다', () => {
  const engine = source.indexOf('js/pu-hwp-engine.js');
  const generator = source.indexOf('hwpx_gen.js');
  assert.ok(engine > 0);
  assert.ok(generator > engine);
});

test('보관된 HWP/HWPX 원본은 공통 엔진으로 검증하고 미리 본다', () => {
  assert.match(source, /function previewKcareerHwp/);
  assert.match(source, /PureunHwp\.validate\(buffer,name\)/);
  assert.match(source, /PureunHwp\.renderPreview\(box,buffer,name\)/);
  assert.match(source, /\^\(hwp\|hwpx\)\$/);
});

test('편집기는 공통 엔진을 먼저 사용하고 기존 편집기를 안전망으로 남긴다', () => {
  assert.match(source, /PureunHwp\.createEditor\(containerSel,buffer,fileName\)/);
  assert.match(source, /공통 한글 편집기 폴백/);
  assert.match(source, /_rhwp = await createEditor/);
});

test('빠른 이력서와 경력증명서는 표 구조를 가진 정상 HWPX를 만든다', () => {
  // 표는 «화면에 그려진 열폭을 실측»해 옮긴다 — 열폭이 모두 같은 격자로 뭉개지 않는다
  assert.match(source, /HWPXDOC\.fromHtml\(sheet, doc/);
  assert.match(source, /const bytes=HWPX\.build\(\[\{body:body/);
  assert.match(source, /PureunHwp\.validate\(bytes,name\)/);
  assert.match(source, /표 구조와 입력 내용이 함께 저장/);
});

test('모바일 한글 작업 버튼과 문서 화면은 옆으로 밀려나지 않게 정리된다', () => {
  assert.match(source, /\.cv-toolbar\{display:grid!important;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(source, /\.cv-sheet-scroll/);
  assert.match(source, /\.kc-hwp-preview\{min-height:60vh/);
});
