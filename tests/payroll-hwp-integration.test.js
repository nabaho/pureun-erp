const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'payroll-os.html'), 'utf8');

test('급여관리는 공통 한글 엔진과 HWPX 생성기를 인증 전에 읽는다', () => {
  const engine = source.indexOf('js/pu-hwp-engine.js');
  const generator = source.indexOf('hwpx_gen.js');
  const auth = source.indexOf('firebase-auth-compat.js');
  assert.ok(engine > 0);
  assert.ok(generator > engine);
  assert.ok(auth > generator);
});

test('화면에 계산된 급여명세서를 표가 있는 HWPX 묶음으로 저장한다', () => {
  assert.match(source, /function exportPayrollSlipsHwpx/);
  assert.match(source, /document\.querySelectorAll\('\.slip'\)/);
  assert.match(source, /HWPX\.tablePara/);
  assert.match(source, /HWPX\.build\(body\)/);
  assert.match(source, /PureunHwp\.validate\(bytes,fileName\)/);
  assert.match(source, /PureunHwp\.download\(bytes,fileName,'hwpx'\)/);
});

test('여러 직원은 새 페이지로 구분되고 검토용 상태도 문서에 표시한다', () => {
  assert.match(source, /pageBreak:index>0/);
  assert.match(source, /미확정 검토용/);
  assert.match(source, /_급여명세서\.hwpx/);
});

test('모바일의 PDF와 한글 저장 버튼은 화면 폭 안에서 한 줄씩 배치된다', () => {
  assert.match(source, /\.sub\.noprint \.btn\{display:block;width:100%/);
  assert.match(source, /한글\(HWPX\) 저장/);
});

test('상세 급여 보고서도 현재 보이는 표를 공통 한글 파일로 저장한다', () => {
  assert.match(source, /function exportPayrollReportHwpx/);
  assert.match(source, /main\.querySelectorAll\('table'\)/);
  assert.match(source, /현재 결과표 한글\(HWPX\) 저장/);
  assert.match(source, /addPayrollReportHwpxAction\(m\)/);
  assert.match(source, /PureunHwp\.validate\(bytes,fileName\)/);
});
