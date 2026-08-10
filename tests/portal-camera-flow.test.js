const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const test = require('node:test');

const root = path.join(__dirname, '..');
const portal = fs.readFileSync(path.join(root, 'enter.html'), 'utf8');
const photos = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');
const erp = fs.readFileSync(path.join(root, 'pu-erp.html'), 'utf8');

test('일반 모바일 포털 카메라는 사진첩 목록 없이 연속촬영 카메라를 바로 연다', () => {
  const start = portal.indexOf('function wireCamFab()');
  const end = portal.indexOf('function renderPortal', start);
  const flow = portal.slice(start, end);
  assert.match(flow, /location\.href\s*=\s*'pu-photos\.html\?cam=1&quick=1&from=portal&sso=1&v='/);
  assert.match(portal, /id="portalCamInput"[^>]+capture="environment"/);
  assert.match(flow, /needsDirectNativeCamera\(\)/);
  assert.match(flow, /input\.click\(\)/);
  const native = portal.match(/function needsDirectNativeCamera\(\)\{[\s\S]*?\n  \}/)[0];
  /* (2026-08-10) 뒤집었다 — 대표 제보: "왜 카메라 바로 안 나오고 묻는 문구가 계속 나오나".
     폰 카메라는 «손가락으로 지금 막 누른» 자리에서만 열린다. 사진첩으로 넘어간 뒤에는
     그 자격이 사라져 못 열고, 「카메라 열기」를 한 번 더 눌러야 하는 화면이 떴다.
     포털의 누른 자리에서 열면 곧바로 열린다. */
  assert.match(native, /portalInAppBrowser\(\)/, '앱 안 브라우저도 곧바로 폰 카메라로');
  assert.match(native, /noWebCamera/, '웹 카메라가 아예 없는 기기도 그대로');
});

test('카카오톡 포털도 기본 카메라 확인 화면 없이 연속촬영 화면으로 이동한다', () => {
  const start = portal.indexOf('function wireCamFab()');
  const end = portal.indexOf('function renderPortal', start);
  const flow = portal.slice(start, end);
  const native = portal.match(/function needsDirectNativeCamera\(\)\{[\s\S]*?\n  \}/)[0];
  assert.match(flow, /pu-photos\.html\?cam=1&quick=1&from=portal/);
  /* (2026-08-10) 뒤집었다 — 대표 제보: "왜 카메라 바로 안 나오고 묻는 문구가 계속 나오나".
     폰 카메라는 «손가락으로 지금 막 누른» 자리에서만 열린다. 사진첩으로 넘어간 뒤에는
     그 자격이 사라져 못 열고, 「카메라 열기」를 한 번 더 눌러야 하는 화면이 떴다.
     포털의 누른 자리에서 열면 곧바로 열린다. */
  assert.match(native, /portalInAppBrowser\(\)/, '앱 안 브라우저도 곧바로 폰 카메라로');
  assert.match(native, /noWebCamera/, '웹 카메라가 아예 없는 기기도 그대로');
  /* (2026-08-10) 뒤집었다 — 대표 제보: "카메라 누르면 계속 이 문구 나온다".
     앱 안 브라우저는 카메라 허락을 «기억하지 않아» 누를 때마다 권한 창이 떴다.
     그 창은 브라우저가 띄우는 것이라 우리가 못 없앤다 — 카메라 API 를 아예 안 부르는 것만이 답.
     그래서 빠른촬영(camQuickMode)에서도 폰 기본 카메라로 보낸다.
     잃는 것: 한 장마다 폰의 확인 화면. 얻는 것: 권한 창이 안 뜨고 그림이 더 선명하다. */
  assert.match(photos, /if \(inAppBrowser\(\)\) \{/);
  assert.doesNotMatch(photos, /inAppBrowser\(\) && !camQuickMode/, '빠른촬영만 빼놓으면 그 길에서 권한 창이 다시 뜬다');
  assert.match(photos, /if \(blurry && !camQuickMode\)/);
});

test('앱 내부 브라우저 촬영 파일은 임시 보관 후 안전 대기열로 옮긴다', () => {
  assert.match(portal, /indexedDB\.open\('puPortalCamera',\s*1\)/);
  assert.match(portal, /pu-photos\.html\?sso=1&portalcam=/);
  assert.match(portal, /function portalCameraJpeg\(file\)/);
  assert.match(portal, /canvas\.toBlob\([\s\S]*?'image\/jpeg',\s*0\.95\)/);
  assert.match(portal, /blob:photo\.blob/);
  assert.match(photos, /function takePortalCameraFile\(\)/);
  assert.match(photos, /await addFiles\(files,\s*true,\s*\{\s*fromCam:\s*true,\s*portalCapture:\s*true\s*\}\)/);
  assert.match(photos, /촬영한 사진을 준비하고 있습니다/);
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
