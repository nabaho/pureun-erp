const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const erp = fs.readFileSync(path.join(root, 'pu-erp.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'pu-erp.css'), 'utf8');

test('푸른이알피가 공통 한글 엔진 다음 HWPX 생성기를 읽는다', () => {
  const engine = erp.indexOf('js/pu-hwp-engine.js');
  const generator = erp.indexOf('hwpx_gen.js');
  assert.ok(engine > 0);
  assert.ok(generator > engine);
});

test('계약서 첨부 HWP/HWPX를 공통 편집기와 미리보기로 연다', () => {
  assert.match(erp, /function openContractHwpAttachment/);
  assert.match(erp, /PureunHwp\.validate\(buf,att\.name\)/);
  assert.match(erp, /PureunHwp\.createEditor/);
  assert.match(erp, /PureunHwp\.renderPreview/);
  assert.match(erp, /한글 열기/);
});

/* 아래 셋은 «어떤 함수를 어떤 인자로 부르는지»가 아니라 «문서가 무엇을 담는지»를 본다.
   호출 모양을 못 박아 두면 서식을 개선할 때마다 검사가 먼저 막는다 —
   실제로 그렇게 되어 공용 서식층으로 옮기는 작업이 이 검사에 걸렸다. */
test('선택한 계약서는 공용 서식층을 거쳐 HWPX 초안으로 저장된다', () => {
  assert.match(erp, /function doHwpxMulti/);
  assert.match(erp, /HWPXDOC\.fromText\(rendered/);      // 조·항 구분을 살려 앉힌다
  assert.match(erp, /HWPX\.download\(/);
  assert.match(erp, /📕 한글 \('/);
});

test('직원별 근로계약서도 HWPX 검토용 초안으로 저장된다', () => {
  assert.match(erp, /function exportEmploymentHwpx/);
  assert.match(erp, /HWPXDOC\.infoTable\(/);              // 라벨·값이 선으로 갈린 표
  assert.match(erp, /HWPXDOC\.signBlock\(/);              // 서명란
  assert.match(erp, /근로계약서 한글 초안 저장 완료/);
  assert.match(erp, /실제 근로조건과 법정 필수사항을 최종 확인/);
});

test('개인 급여명세서는 화면과 같은 셈을 써서 HWPX로 저장된다', () => {
  assert.match(erp, /function exportSlipHwpx/);
  // 글자본(메일)과 한글본이 같은 slipData() 를 쓰는지 — 두 곳에서 따로 셈하면 어긋난다
  assert.match(erp, /function slipData\(empSid, ym\)/);
  assert.match(erp, /function buildSlipBody[\s\S]{0,200}slipData\(empSid, ym\)/);
  assert.match(erp, /var d=slipData\(empSid, props\.selYM\)/);
  assert.match(erp, /HWPXDOC\.moneyTable\(/);             // 금액은 오른쪽 정렬 표로
  assert.match(erp, /급여명세서 한글 파일 저장 완료/);
});

test('모바일 계약서 버튼은 두 열로 줄바꿈되어 화면을 넘지 않는다', () => {
  assert.match(css, /\.contract-hwp-actions\{display:grid!important;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.erp-hwp-preview\{min-height:320px;max-height:none\}/);
});
