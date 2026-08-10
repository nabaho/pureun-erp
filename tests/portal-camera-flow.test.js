const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const test = require('node:test');

const root = path.join(__dirname, '..');
const portal = fs.readFileSync(path.join(root, 'enter.html'), 'utf8');
const photos = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');
const erp = fs.readFileSync(path.join(root, 'pu-erp.html'), 'utf8');

test('모바일 포털 카메라는 사진첩으로 먼저 이동하지 않고 기본 카메라를 연다', () => {
  const start = portal.indexOf('function wireCamFab()');
  const end = portal.indexOf('function renderPortal', start);
  const flow = portal.slice(start, end);
  assert.match(portal, /id="portalCamInput"[^>]+capture="environment"/);
  assert.match(flow, /input\.click\(\)/);
  assert.doesNotMatch(flow, /if\(isMobile\(\)[\s\S]{0,300}location\.href\s*=\s*'pu-photos\.html\?cam=1/);
});

test('촬영 파일은 임시 보관 후 사진첩의 기존 안전 대기열로 옮긴다', () => {
  assert.match(portal, /indexedDB\.open\('puPortalCamera',\s*1\)/);
  assert.match(photos, /function takePortalCameraFile\(\)/);
  assert.match(photos, /addFiles\(\[file\],\s*true,\s*\{\s*fromCam:\s*true,\s*portalCapture:\s*true\s*\}\)/);
  assert.match(photos, /_portalCapture:\s*!!\(opts\s*&&\s*opts\.portalCapture\)/);
});

test('서버 저장이 끝나기 전에는 포털로 돌아가지 않는다', () => {
  const start = photos.indexOf('function onQueueChange');
  const end = photos.indexOf('/* ══════ 서류 판독', start);
  const flow = photos.slice(start, end);
  assert.match(flow, /j\.state\s*===\s*'done'/);
  assert.match(flow, /location\.replace\('enter\.html\?v='/);
});

test('예전 ERP 홈 바로가기는 모바일에서 포털 선택 화면으로 보낸다', () => {
  assert.match(erp, /mobile\s*&&\s*!fromPortal/);
  assert.match(erp, /location\.replace\('enter\.html\?from=erp-shortcut/);
  assert.match(erp, /fromPortal\s*=\s*\/\[\?&\]sso=1/);
});
