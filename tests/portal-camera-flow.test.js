const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const test = require('node:test');

const root = path.join(__dirname, '..');
const portal = fs.readFileSync(path.join(root, 'enter.html'), 'utf8');
const photos = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');
const erp = fs.readFileSync(path.join(root, 'pu-erp.html'), 'utf8');

test('모바일 포털 카메라는 사진첩 목록 없이 연속촬영 카메라를 바로 연다', () => {
  const start = portal.indexOf('function wireCamFab()');
  const end = portal.indexOf('function renderPortal', start);
  const flow = portal.slice(start, end);
  assert.match(flow, /location\.href\s*=\s*'pu-photos\.html\?cam=1&quick=1&from=portal&sso=1&v='/);
  assert.doesNotMatch(portal, /id="portalCamInput"/);
  assert.doesNotMatch(portal, /id="portalCamMore"/);
});

test('연속촬영 사진은 사진첩의 기존 안전 대기열로 한꺼번에 보낸다', () => {
  assert.match(photos, /const files = picked\.map/);
  assert.match(photos, /await addFiles\(files,\s*true,\s*\{\s*fromCam:\s*true,/);
});

test('카메라를 닫지 않고 계속 찍으며 왼쪽 아래에 최근 사진을 보여 준다', () => {
  assert.match(photos, /camShots\.push\(/);
  assert.match(photos, /renderCamStrip\(\)/);
  assert.match(photos, /id="camLast"[^>]*방금 찍은 사진/);
  assert.match(photos, /\.camSpacer\{width:88px;[^}]*display:flex/);
  assert.match(photos, /\.camSpacer img\{width:46px;height:46px/);
  assert.match(photos, /last\.src = camShots\[n - 1\]\.url/);
  assert.match(photos, /id="camCount"/);
});

test('저장이 끝난 뒤에만 포털 선택 화면으로 돌아간다', () => {
  const start = photos.indexOf('async function camUpload()');
  const end = photos.indexOf('/* ══════ 끌어다 놓기', start);
  const flow = photos.slice(start, end);
  assert.match(photos, /from === 'portal' \? 'enter\.html'/);
  assert.ok(flow.indexOf('await addFiles(files') < flow.indexOf('camGoBack()'));
});

test('예전 ERP 홈 바로가기는 모바일에서 포털 선택 화면으로 보낸다', () => {
  assert.match(erp, /mobile\s*&&\s*!fromPortal/);
  assert.match(erp, /location\.replace\('enter\.html\?from=erp-shortcut/);
  assert.match(erp, /fromPortal\s*=\s*\/\[\?&\]sso=1/);
});
