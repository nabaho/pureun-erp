const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const enter = fs.readFileSync(path.join(R, 'enter.html'), 'utf8');
const photos = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

test('모바일 건의 단추는 카메라를 가리지 않는다', () => {
  assert.match(enter, /#sgFab\{position:fixed!important;[^}]*right:14px!important;bottom:78px!important;/s);
});

test('포털 카메라는 일반사진 모드로 고정해 진입한다', () => {
  const fn = enter.match(/function wireCamFab\(\)\{[\s\S]*?\n  \}/)[0];
  assert.match(fn, /mode=photo&quick=1&from=portal/);
  assert.doesNotMatch(fn, /pu-photos\.html|capture|input\.click/);
});

test('포털 촬영은 확인창 없이 계속 누적된다', () => {
  const shoot = photos.match(/async function camShoot\(opts\) \{[\s\S]*?(?=\nfunction renderCamStrip)/)[0];
  assert.doesNotMatch(shoot, /setCamWarn|alert\([^)]*흐리|다시 찍기|그대로 쓰기/);
  assert.match(shoot, /camShots\.push\(/);
  assert.match(shoot, /renderCamStrip\(\)/);
});

test('로그인 이동 뒤에도 요청을 기억하고 실제로 열린 뒤 한 번만 지운다', () => {
  const fn = photos.match(/function openCamIfAsked\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(fn, /sessionStorage\.getItem\('pu_open_camera'\)/);
  assert.match(fn, /openCam\(\)\.then/);
  assert.match(fn, /if \(opened\)[\s\S]*sessionStorage\.removeItem\('pu_open_camera'\)/);
});

test('저장이 끝난 뒤 포털로 돌아간다', () => {
  assert.match(photos, /from === 'portal' \? 'enter\.html'/);
  const upload = photos.match(/async function camUpload\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(upload, /if \(camReturnTo\) \{ camDiscard\(\); camGoBack\(\); \}/);
});
