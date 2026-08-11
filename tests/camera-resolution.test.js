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

test('낮은 미리보기에서도 별도 확인 없이 고해상도 촬영을 시도한다', () => {
  assert.doesNotMatch(photos, /id="camNative"|function useNativeCam\(\)/);
  assert.match(photos, /takePhoto\(camPhotoBest\(\)\)/);
});

test('앱 안 카메라는 운영체제 확인형 카메라로 우회하지 않는다', () => {
  const m = photos.match(/async function openCam\(\)[\s\S]*?\n\}/);
  assert.ok(m && /getUserMedia/.test(m[0]));
  assert.doesNotMatch(m[0], /camInput|\.click\(\)/);
});

test('촬영한 사진은 사용자가 나중에 지울 때까지 남는다', () => {
  const shoot = photos.match(/async function camShoot\([^)]*\)[\s\S]*?(?=\nfunction renderCamStrip)/);
  assert.ok(shoot && /camShots\.push\(/.test(shoot[0]));
  assert.doesNotMatch(shoot[0], /camShots\.pop\(\)/);
});

test('문서 촬영은 고해상도 후보 중 가장 선명한 사진을 고른다', () => {
  assert.match(photos, /const CAM_DOC_BURST = 3/);
  assert.match(photos, /usable\.sort\(function \(a, b\) \{ return b\.sharp - a\.sharp; \}\)/);
});
