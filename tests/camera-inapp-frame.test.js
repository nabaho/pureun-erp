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

test('명함·서류 모드만 눈에 보이는 안내와 안전한 자르기를 쓴다', () => {
  /* ⚠ 2026-08-27 대표 지시: "꺽쇠 없이 가운데 중앙에 o 모양으로" — 네 귀퉁이 꺽쇠를 걷었다.
     그래서 여기서 «꺽쇠의 모양»(border-left-width 따위)을 못 박지 않는다.
     지켜야 하는 뜻은 둘이다:
       ① 자르는 자리(#camFrame)의 «자리·크기»는 그대로다 — camShoot 이 이 칸을
          getBoundingClientRect 로 읽어 자른다. 옮기거나 줄이면 엉뚱한 데가 잘린다.
       ② 눈에 보이는 안내가 **무엇이든 하나는 있어야** 한다 — 없으면 어디에 맞출지 모른다. */
  assert.match(html, /#camFrame\{[^}]*left:27%;right:27%[^}]*aspect-ratio:1\.6\/1/,
    '★ 자르는 자리가 움직였습니다 — 찍은 사진이 엉뚱한 데서 잘립니다');
  assert.match(html, /#camAim\{[^}]*border-radius:50%/,
    '★ 눈에 보이는 조준 안내가 없습니다 — 어디에 맞출지 알 길이 없습니다');
  assert.match(html, /function cropPref\(\) \{ return showFrame\(\); \}/);
  const shoot = html.match(/async function camShoot\([^)]*\)[\s\S]*?(?=\nfunction renderCamStrip)/);
  assert.match(shoot[0], /if \(showFrame\(\)\)/);
});
