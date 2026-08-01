const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('급여관리는 모바일 단일열 배치와 저장 상태를 제공한다', () => {
  const src = read('payroll-os.html');
  assert.match(src, /@media\s*\(max-width:760px\)/);
  assert.match(src, /\.cards\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(src, /id="saveState"[^>]*aria-live="polite"/);
  assert.match(src, /setSaveState\('saving','저장 중…'\)/);
  assert.match(src, /setSaveState\('failed','저장 실패'\)/);
});

test('문서관리는 좁은 화면에서 표를 카드 안에서 스크롤하고 저장 상태를 제공한다', () => {
  const src = read('docs-esign.html');
  assert.match(src, /@media\(max-width:700px\)/);
  assert.match(src, /\.card\{padding:13px;overflow-x:auto\}/);
  assert.match(src, /table\{min-width:640px\}/);
  assert.match(src, /function trackedWrite\(promise\)/);
  assert.match(src, /id="saveState"[^>]*aria-live="polite"/);
  assert.match(src, /EsignDocs\.esc\(m\.title \|\| '\(제목 없음\)'\)/);
  assert.match(src, /EsignDocs\.esc\(m\.company \|\| ''\)/);
  assert.match(src, /사건 생성에 실패했습니다/);
});

test('기금관리는 모든 Firebase 쓰기를 공통 저장 상태로 감시한다', () => {
  const src = read('fund.html');
  assert.match(src, /function installWriteStatus\(\)/);
  assert.match(src, /\['set','update','remove'\]\.forEach/);
  assert.match(src, /id="saveState"[^>]*aria-live="polite"/);
});

test('컨설팅 포털 인증 대기는 1.5초를 넘기지 않는다', () => {
  const src = read('gov-consulting.html');
  const waits = [...src.matchAll(/classList\.remove\('sso-wait'\)[\s\S]{0,40}?(\d+)\)/g)].map((m) => Number(m[1]));
  assert.ok(waits.length >= 2);
  assert.ok(waits.every((ms) => ms <= 1500));
});

test('취업규칙 헤더 도구는 휴대폰에서 두 열로 재배치된다', () => {
  const src = read('rules.html');
  assert.match(src, /@media\(max-width:700px\)/);
  assert.match(src, /header \.toolbar\{order:3;width:100%;display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(src, /#daejo-tools\{flex-wrap:wrap!important;overflow-x:visible!important\}/);
});
