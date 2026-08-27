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
  assert.match(flow, /pu-photos\.html\?cam=1&mode=photo&quick=1&from=portal&sso=1&v=/);
  assert.match(flow, /sessionStorage\.setItem\('pu_open_camera'/);
  assert.doesNotMatch(flow, /pu-camera\.html|input\.click|needsDirectNativeCamera/);
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
  const clearAt = fn.indexOf('clearCameraIntent()');
  assert.ok(openAt >= 0 && clearAt > openAt);
  assert.ok((fn.match(/clearCameraIntent\(\)/g) || []).length >= 2,
    '성공뿐 아니라 권한 거부·최종 실패도 요청 표시를 지워야 합니다.');
});

/* ⚠ 2026-08-27 대표 지시로 «알림 글귀»가 바뀌었다("찍은 사진 — 눌러서 전부 보기").
   그래서 글귀를 못 박지 않는다. 지켜야 하는 뜻은 «왼쪽 아래에 방금 찍은 것이
   보이고, 그것이 한꺼번에 저장된다»는 것이다. */
test('연속촬영은 왼쪽 아래 최근 사진과 한꺼번에 저장을 유지한다', () => {
  assert.match(photos, /camShots\.push\(/);
  assert.match(photos, /id="camLast"/);
  assert.match(photos, /last\.src = camShots\[n - 1\]\.url/);
  assert.match(photos, /const files = picked\.map/);
  assert.match(photos, /await addFiles\(files,\s*true,\s*\{\s*fromCam:\s*true,/);
});
test('카메라를 닫지 않고 계속 찍으며 왼쪽 아래에 최근 사진을 보여 준다', () => {
  assert.match(photos, /camShots\.push\(/);
  assert.match(photos, /renderCamStrip\(\)/);
  assert.match(photos, /id="camLast"/);
  assert.match(photos, /\.camSpacer\{width:88px;[^}]*display:flex/);
  assert.match(photos, /\.camSpacer img\{width:46px;height:46px/);
  assert.match(photos, /last\.src = camShots\[n - 1\]\.url/);
  /* 몇 장 찍었는지가 화면 어딘가에 늘 있어야 한다 — 예전엔 윗줄이었고, 지금은
     사진에 붙는 「n장」 딱지와 완료 단추다(윗줄은 상한이 가까울 때만 뜬다). */
  assert.match(photos, /more\.textContent = n \+ '장'/,
    '★ 몇 장 찍었는지 알 길이 없어졌습니다');
});

test('저장이 끝난 뒤에만 포털 선택 화면으로 돌아간다', () => {
  const start = photos.indexOf('async function camUpload()');
  const end = photos.indexOf('/* ══════ 끌어다 놓기', start);
  const flow = photos.slice(start, end);
  assert.match(photos, /from === 'portal' \? 'enter\.html'/);
  assert.ok(flow.indexOf('await addFiles(files') < flow.indexOf('camGoBack()'));
});
