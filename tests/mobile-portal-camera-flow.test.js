const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const enter = fs.readFileSync(path.join(R, 'enter.html'), 'utf8');
const photos = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

test('모바일 건의 단추는 헤더가 아니라 카메라 위에 고정된다', () => {
  assert.match(enter, /#sgFab\{position:fixed!important;[^}]*right:14px!important;bottom:78px!important;/s);
  assert.match(enter, /\.homebar \.hb-hint\{display:none!important;\}/);
});

test('인앱 브라우저도 화면 폭과 터치로 모바일 판정한다', () => {
  const fn = enter.match(/function isMobile\(\)\{[\s\S]*?\n  \}/)[0];
  assert.match(fn, /matchMedia\('\(max-width: 760px\)'\)/);
  assert.match(fn, /maxTouchPoints/);
});

test('포털 카메라는 중간 화면 없이 사진첩 카메라로 바로 간다', () => {
  const start = enter.indexOf('function openPortalCameraInput()');
  const end = enter.indexOf('function renderPortal', start);
  const fn = enter.slice(start, end);
  assert.match(enter, /id="portalCamInput"[^>]*accept="image\/\*"[^>]*capture="environment"/);
  assert.match(fn, /if\(input\) input\.click\(\)/);
  assert.match(fn, /savePortalCameraFile\(file, portalCameraBatchId\)/);
  assert.match(fn, /pu-photos\.html\?sso=1&portalcam=/);
  assert.doesNotMatch(fn, /sessionStorage\.setItem\('pu_open_camera','quick'\)/);
  assert.doesNotMatch(fn, /pu-camera\.html/);
});

test('인증 이동 뒤에도 카메라 요청을 기억하고 한 번만 쓴다', () => {
  const fn = photos.match(/function openCamIfAsked\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(fn, /sessionStorage\.getItem\('pu_open_camera'\)/);
  assert.match(fn, /sessionStorage\.removeItem\('pu_open_camera'\)/);
  assert.match(fn, /camQuickMode = quick && !camCardMode/);
});

test('빠른 촬영은 저장 뒤 카메라를 닫고 사진첩에 남긴다', () => {
  assert.match(photos, /id="camDone" onclick="finishCamShots\(\)"[^>]*>저장<\/button>/);
  const finish = photos.match(/function finishCamShots\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(finish, /if \(camQuickMode\) \{ camUpload\(\); return; \}/);
  const upload = photos.match(/async function camUpload\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(upload, /if \(camQuickMode && !camReturnTo\)/);
  assert.match(upload, /camDiscard\(\)/);
  assert.match(upload, /사진첩에 저장했습니다/);
});

test('명함 화질은 최대 해상도 우선·저장 3200px 95%를 쓴다', () => {
  const open = photos.match(/async function openCam\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(open, /width: \{ exact: mw \}, height: \{ exact: mh \}/);
  assert.match(open, /width: \{ ideal: mw \}, height: \{ ideal: mh \}/);
  const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
  assert.match(store, /maxEdge: 3200, quality: 0\.95/);
});
