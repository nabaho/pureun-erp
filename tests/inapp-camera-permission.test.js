const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const photos = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');
const portal = fs.readFileSync(path.join(root, 'enter.html'), 'utf8');

test('앱 안 브라우저에서도 사진첩이나 기본 파일 선택기로 우회하지 않는다', () => {
  const open = photos.match(/async function openCam\(\)[\s\S]*?\n\}/);
  assert.ok(open, 'openCam 함수를 찾지 못했습니다');
  assert.match(open[0], /navigator\.mediaDevices\.getUserMedia/);
  assert.doesNotMatch(open[0], /inAppBrowser|camInput|\.click\(\)/);
  assert.doesNotMatch(photos, /id="camInput"[^>]*capture|id="camNative"/);
});

test('포털 카메라 단추는 언제나 전용 카메라 관문으로 이동한다', () => {
  const wire = portal.match(/function wireCamFab\(\)[\s\S]*?\n  \}/);
  assert.ok(wire, '포털 카메라 연결 함수를 찾지 못했습니다');
  assert.match(wire[0], /pu-camera\.html\?mode=photo&quick=1&from=portal&sso=1&v=/);
  assert.doesNotMatch(wire[0], /portalCamInput|needsDirectNativeCamera|\.click\(\)/);
});

test('카메라 권한 실패 시 검은 준비 화면을 닫는다', () => {
  const open = photos.match(/async function openCam\(\)[\s\S]*?(?=\n\/\* 준비하다)/);
  assert.ok(open, 'openCam 전체 구역을 찾지 못했습니다');
  assert.match(open[0], /catch \(e2\)[\s\S]*?camFail\(\);[\s\S]*?return false;/);
});
