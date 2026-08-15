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
  const start = enter.indexOf('function wireCamFab()');
  const end = enter.indexOf('function renderPortal', start);
  const fn = enter.slice(start, end);
  assert.match(fn, /pu-photos\.html\?cam=1&quick=1&from=portal&sso=1&v=/);
  assert.match(enter, /id="portalCamInput"[^>]+accept="image\/jpeg,image\/png"[^>]+capture="environment"/);
  assert.match(fn, /needsDirectNativeCamera\(\)/);
  assert.match(fn, /input\.click\(\)/);
  assert.doesNotMatch(fn, /pu-camera\.html/);
});

test('카카오톡에서도 시스템 확인 화면 대신 화면 안 연속촬영을 우선한다', () => {
  const fn = enter.match(/function needsDirectNativeCamera\(\)\{[\s\S]*?\n  \}/)[0];
  assert.match(fn, /navigator\.mediaDevices\.getUserMedia/);
  assert.doesNotMatch(fn, /KAKAOTALK|NAVER|DaumApps|embedded/);
});

test('포털 빠른 촬영은 흐림 확인창 없이 모든 사진을 계속 담는다', () => {
  const shoot = photos.match(/async function camShoot\(opts\) \{[\s\S]*?\n\}/)[0];
  assert.match(shoot, /if \(blurry && !camQuickMode\) \{ setCamWarn\(true\); return; \}/);
  const res = photos.match(/function checkCamRes\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(res, /!camQuickMode && edge && edge < CAM_LOW_EDGE/);
});

test('아이폰 기본 카메라 사진은 페이지 이동 전에 고화질 JPEG로 확정한다', () => {
  assert.match(enter, /function portalCameraJpeg\(file\)/);
  assert.match(enter, /maxEdge = 4096/);
  assert.match(enter, /canvas\.toBlob\([\s\S]*?'image\/jpeg',\s*0\.95\)/);
  assert.match(enter, /savePortalCameraFile\(file\)[\s\S]*?portalCameraJpeg\(file\)/);
  assert.match(enter, /blob:photo\.blob/);
});

test('인증 이동 뒤에도 카메라 요청을 기억하고 한 번만 쓴다', () => {
  const fn = photos.match(/function openCamIfAsked\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(fn, /sessionStorage\.getItem\('pu_open_camera'\)/);
  assert.match(fn, /sessionStorage\.removeItem\('pu_open_camera'\)/);
  assert.match(fn, /camQuickMode = quick && !camCardMode/);
});

test('포털 빠른 촬영은 여러 장 저장 뒤 카메라를 닫고 포털로 돌아간다', () => {
  assert.match(photos, /id="camDone" onclick="finishCamShots\(\)"[^>]*>저장<\/button>/);
  const finish = photos.match(/function finishCamShots\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(finish, /if \(camQuickMode\) \{ camUpload\(\); return; \}/);
  const upload = photos.match(/async function camUpload\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(photos, /from === 'portal' \? 'enter\.html'/);
  assert.match(upload, /if \(camReturnTo\) \{ camDiscard\(\); camGoBack\(\); \}/);
  const close = photos.match(/function closeCam\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(close, /camDiscard\(\);[\s\S]*if \(camReturnTo\) camGoBack\(\)/);
});

test('명함 화질은 최대 해상도 우선·저장 3200px 95%를 쓴다', () => {
  const open = photos.match(/async function openCam\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(open, /width: \{ exact: mw \}, height: \{ exact: mh \}/);
  assert.match(open, /width: \{ ideal: mw \}, height: \{ ideal: mh \}/);
  const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
  assert.match(store, /maxEdge: 3200, quality: 0\.95/);
});
