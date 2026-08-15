const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

test('앱 안 브라우저도 사진첩이나 매장 확인형 카메라로 우회하지 않는다', () => {
  const open = html.match(/async function openCam\(\)[\s\S]*?\n\}/);
  assert.ok(open);
  assert.match(open[0], /navigator\.mediaDevices\.getUserMedia/);
  assert.doesNotMatch(open[0], /inAppBrowser|camInput|\.click\(\)/);
  assert.doesNotMatch(html, /id="camInput"[^>]*capture|id="camNative"/);
});

test('일반사진과 명함·서류 모드가 명시적으로 분리된다', () => {
  assert.match(html, /id="camModePhoto"[^>]*setCamCaptureMode\('photo'\)/);
  assert.match(html, /id="camModeDocument"[^>]*setCamCaptureMode\('document'\)/);
  assert.match(html, /let camCaptureMode = 'photo'/);
  assert.match(html, /function frameOn\(\) \{ return camCaptureMode === 'document'; \}/);
  assert.match(html, /function showFrame\(\) \{ return frameOn\(\) && camCardSeen; \}/);
});

test('일반사진에서는 사각 틀과 자동촬영 감시를 끈다', () => {
  const mode = html.match(/function setCamCaptureMode\(mode\)[\s\S]*?\n\}/);
  assert.ok(mode);
  assert.match(mode[0], /camCaptureMode = mode === 'document' \? 'document' : 'photo'/);
  assert.match(mode[0], /stopFrameWatch\(\)/);
  assert.match(mode[0], /camCardSeen = false/);
  assert.match(mode[0], /stopAutoWatch\(\)/);
});

test('명함·서류 모드만 네 귀퉁이 안내와 안전한 자르기를 쓴다', () => {
  assert.match(html, /#camFrame i\{[^}]*border:0 solid #34d399/);
  assert.match(html, /#camFrame i\.tl\{[^}]*border-left-width:3px[^}]*border-top-width:3px/);
  assert.match(html, /function cropPref\(\) \{ return showFrame\(\); \}/);
  const shoot = html.match(/async function camShoot\([^)]*\)[\s\S]*?(?=\nfunction renderCamStrip)/);
  assert.match(shoot[0], /if \(showFrame\(\)\)/);
});
