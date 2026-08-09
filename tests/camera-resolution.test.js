/* 폰 화질의 뿌리 — 화면 해상도 자체 (대표 보고 2026-08-09)

   대표님 폰에서 「화면캡처 1280×720 → 저장본 1180×660」이 찍혔다. 두 가지가
   동시에 잘못돼 있었다:
     ① 고해상도 사진 촬영이 실패해 미리보기 화면 캡처로 떨어졌고
     ② 그 화면이 1280×720 밖에 안 됐다 — 3840×2160 을 달라고 했는데도.
   `ideal` 은 부탁일 뿐이라 기기가 알아서 낮춰 잡는다. **들어온 그림이 720p 면
   뒤에서 무엇을 해도 그 이상이 안 된다** — 저장 화질을 올려도 소용없다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const photos = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

test('★ 카메라를 연 뒤 기기 최대 해상도로 다시 요청한다', () => {
  const m = photos.match(/async function openCam\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'openCam 을 찾지 못했습니다.');
  assert.ok(/getCapabilities/.test(m[0]),
    '이 기기가 낼 수 있는 최대치를 물어보지 않고 있습니다.');
  assert.ok(/applyConstraints\(\{ width:/.test(m[0]),
    'ideal 로만 부탁하면 기기가 낮춰 잡습니다 — 물어본 최대치로 다시 요청해야 합니다.');
});

test('해상도를 못 올려도 카메라는 열린다', () => {
  const m = photos.match(/async function openCam\(\)[\s\S]*?\n\}/);
  assert.ok(/못 올려도 촬영은 된다/.test(m[0]),
    '거부하는 기기에서 카메라가 아예 안 열리면 안 됩니다.');
});

test('★ 화면이 낮게 잡히면 폰 카메라를 권한다', () => {
  assert.ok(/id="camNative"/.test(photos), '권유 단추가 없습니다.');
  assert.ok(/CAM_LOW_EDGE/.test(photos), '낮은지 재는 기준이 없습니다.');
  assert.ok(/edge < CAM_LOW_EDGE/.test(photos),
    '늘 띄우면 성가시고, 안 띄우면 길이 없습니다 — 낮을 때만 띄웁니다.');
  assert.ok(/function useNativeCam\(\)/.test(photos), '누를 곳이 있어야 합니다.');
});

test('화면 크기는 영상이 준비된 뒤에 잰다', () => {
  const m = photos.match(/async function openCam\(\)[\s\S]*?\n\}/);
  assert.ok(/loadedmetadata/.test(m[0]),
    '켜자마자 재면 0 이 나와 늘 권유가 뜨거나 안 뜹니다.');
});

test('폰 카메라로 넘어갈 때 찍어 둔 것을 말없이 버리지 않는다', () => {
  const m = photos.match(/function useNativeCam\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'useNativeCam 을 찾지 못했습니다.');
  assert.ok(/camShots\.length && !confirm/.test(m[0]), '찍어 둔 것이 있는데 묻지 않고 버립니다.');
  assert.ok(/camDiscard\(\)/.test(m[0]),
    '앱 카메라를 안 끄면 기기가 폰 카메라를 막습니다(카메라는 하나만 잡힌다).');
});

test('★ 폰 카메라로 찍은 것도 서류 화질로 담는다', () => {
  assert.ok(/\$\('camInput'\)\.onchange = function \(\) \{ addFiles\(this\.files, true\)/.test(photos),
    'false 면 애써 크게 찍어 놓고 1600px·85% 로 깎아 담습니다 — 화질 문제와 같은 뿌리입니다.');
});
