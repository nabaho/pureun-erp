const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const test = require('node:test');

const root = path.join(__dirname, '..');
const portal = fs.readFileSync(path.join(root, 'enter.html'), 'utf8');
const gateway = fs.readFileSync(path.join(root, 'pu-camera.html'), 'utf8');
const photos = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');

test('통합화면 카메라는 전용 카메라 문으로만 들어간다', () => {
  const flow = portal.match(/function wireCamFab\(\)\{[\s\S]*?\n  \}/)[0];
  assert.match(flow, /pu-camera\.html\?mode=photo&quick=1&from=portal&sso=1&v=/);
  assert.match(flow, /sessionStorage\.setItem\('pu_open_camera'/);
  assert.doesNotMatch(flow, /pu-photos\.html|input\.click|needsDirectNativeCamera/);
  assert.doesNotMatch(portal, /id="portalCamInput"[^>]*capture/);
});

test('카메라 문은 요청을 기억한 뒤 사진첩 촬영화면으로 넘긴다', () => {
  assert.match(gateway, /sessionStorage\.setItem\('pu_open_camera'/);
  assert.match(gateway, /params\.set\('cam', '1'\)/);
  assert.match(gateway, /params\.set\('mode', mode\)/);
  assert.match(gateway, /location\.replace\('pu-photos\.html\?' \+ params\.toString\(\)\)/);
});

test('실제 카메라가 열린 뒤에만 요청 표시를 지운다', () => {
  const fn = photos.match(/function openCamIfAsked\(\) \{[\s\S]*?\n\}/)[0];
  const openAt = fn.indexOf('openCam().then');
  const removeAt = fn.indexOf("sessionStorage.removeItem('pu_open_camera')");
  assert.ok(openAt >= 0 && removeAt > openAt);
  assert.match(fn, /if \(opened\)/);
});

test('연속촬영은 왼쪽 아래 최근 사진과 한꺼번에 저장을 유지한다', () => {
  assert.match(photos, /camShots\.push\(/);
  assert.match(photos, /id="camLast"[^>]*방금 찍은 사진/);
  assert.match(photos, /last\.src = camShots\[n - 1\]\.url/);
  assert.match(photos, /const files = picked\.map/);
  assert.match(photos, /await addFiles\(files,\s*true,\s*\{\s*fromCam:\s*true,/);
});
