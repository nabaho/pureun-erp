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

test('★★ 편집기는 «앱 안»에서만 그린다 — 공통 엔진 편집기 길은 막았다 (2026-09-05)', () => {
  /* ■ 이 검사는 «뒤집힌» 것이다. 원래는 PureunHwp.createEditor 를 먼저 쓰라고 못박고 있었다.
     ■ 왜 뒤집었나 (대표 지시 「길막아」)
       그 길은 esm.sh 에서 @rhwp/editor 를 받아 남의 주소(edwardkim.github.io)로 iframe 을
       띄우고 대표 서식을 통째로 보냈다. 이 앱의 서류에는 주민등록번호·도장·계좌가 있다.
     ■ 게다가 얻는 것이 없었다 (실측 2026-09-05)
       getSelectionContext 가 editable:false — 읽기 «전용»이다. 눌러 쳐도 changeSeq 가 0 이고
       내용이 안 바뀐다. 첫 로드 12.4초. 위험만 있고 편집은 안 되는 길이었다.
     ■ 지금은 vendor/rhwp-core(WASM, 저장소 안)로 그린다 — A4 모양 그대로, 밖으로 안 나간다.
     ⚠ 이 검사를 다시 뒤집지 말 것. 뒤집으려면 서류가 어디로 가는지부터 다시 따져야 한다. */
  const bare = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  assert.doesNotMatch(bare, /PureunHwp\.createEditor/, '★ 밖으로 나가는 유일한 길이었습니다');
  assert.match(source, /previewKcareerHwp\(containerSel, buffer, fileName\)/,
    '앱 안의 엔진으로 그려야 합니다');
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
