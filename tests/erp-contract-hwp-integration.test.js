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

test('선택한 계약서는 검증을 거치는 HWPX 초안으로 저장된다', () => {
  assert.match(erp, /function doHwpxMulti/);
  assert.match(erp, /HWPX\.bodyPara\(rendered\)/);
  assert.match(erp, /HWPX\.download\(body,base\+'\.hwpx'\)/);
  assert.match(erp, /📕 한글 \('/);
});

test('직원별 근로계약서도 HWPX 검토용 초안으로 저장된다', () => {
  assert.match(erp, /function exportEmploymentHwpx/);
  assert.match(erp, /HWPX\.tablePara\(rows,HWPX\.cols\(\[0\.25,0\.75\]\)\)/);
  assert.match(erp, /근로계약서 한글 초안 저장 완료/);
  assert.match(erp, /실제 근로조건과 법정 필수사항을 최종 확인/);
});

test('개인 급여명세서도 HWPX로 저장된다', () => {
  assert.match(erp, /function exportSlipHwpx/);
  assert.match(erp, /HWPX\.bodyPara\(buildSlipBody\(empSid,props\.selYM\)\)/);
  assert.match(erp, /급여명세서 한글 파일 저장 완료/);
});

test('모바일 계약서 버튼은 두 열로 줄바꿈되어 화면을 넘지 않는다', () => {
  assert.match(css, /\.contract-hwp-actions\{display:grid!important;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.erp-hwp-preview\{min-height:320px;max-height:none\}/);
});
