const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const enter = fs.readFileSync(path.join(root, 'enter.html'), 'utf8');
const photos = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');

function block(start, end) {
  const at = photos.indexOf(start);
  assert.ok(at >= 0, start + ' 블록을 찾지 못했습니다.');
  const to = photos.indexOf(end, at);
  assert.ok(to > at, end + ' 경계를 찾지 못했습니다.');
  return photos.slice(at, to);
}

test('포털 카메라는 사진첩 촬영화면으로 직접 가서 중간 문서 이동을 없앤다', () => {
  const fn = enter.match(/function wireCamFab\(\)\{[\s\S]*?\n  \}/)[0];
  assert.match(fn, /pu-photos\.html\?cam=1&mode=photo&quick=1&from=portal/);
  assert.doesNotMatch(fn, /pu-camera\.html/);
});

test('스트림을 받으면 고화질 준비보다 미리보기를 먼저 붙인다', () => {
  const fn = block('async function openCam()', 'function camFail()');
  const stream = fn.indexOf('preview.srcObject = camStream');
  const maxQuality = fn.indexOf('await camTrack.applyConstraints');
  const photoCaps = fn.indexOf('loadPhotoBest(');
  assert.ok(stream > 0 && stream < maxQuality && stream < photoCaps,
    '최대 해상도·사진 성능 조회를 기다리기 전에 미리보기가 보여야 합니다.');
});

test('권한 거부는 두 번째 권한 요청을 하지 않고 제약 오류만 한 번 물러난다', () => {
  const fn = block('async function openCam()', 'function camFail()');
  assert.match(fn, /e\.name === 'OverconstrainedError'/);
  assert.match(fn, /e\.name === 'NotAllowedError'/);
  const firstCatch = fn.slice(fn.indexOf('} catch (e0) {'), fn.indexOf('/* 스트림을 받은 즉시'));
  assert.match(firstCatch, /if \(!retryable\)[\s\S]*return false;/);
  /* 물러나는 getUserMedia 는 둘 — ① 기억해 둔 렌즈가 사라졌을 때 ② 제약 오류일 때.
     둘 다 **권한 거부에서는 돌면 안 된다.** 돌면 같은 권한창이 연달아 두 번 뜬다.
     ①은 렌즈가 사라졌을 때만 나는 오류로, ②는 retryable 로 각각 좁혀 두었다.
     (2026-08-15 렌즈 고르기를 넣으면서 ①이 모든 오류에서 돌던 것을 이 검사가 잡았다.) */
  assert.equal((firstCatch.match(/getUserMedia\(/g) || []).length, 2,
    'fallback 권한 요청은 렌즈 재시도와 제약 재시도 둘뿐이어야 합니다.');
  assert.match(firstCatch, /const lensGone = e0 && \(e0\.name === 'OverconstrainedError'/);
  assert.match(firstCatch, /if \(camWantDevId && lensGone\)/,
    '★ 권한 거부에서도 렌즈 재시도가 돌면 권한창이 두 번 뜹니다');
});

test('촬영 진입이면 사진 목록 초기화를 늦추고 카메라부터 연다', () => {
  const at = photos.indexOf('PuPhotoStore.signIn(u.uid');
  const fn = photos.slice(at, photos.indexOf('/* ══════ 카톡', at));
  const camera = fn.indexOf('openCamIfAsked()');
  const delayed = fn.indexOf('setTimeout(finishPhotoBoot, 900)');
  assert.ok(camera > 0 && delayed > camera);
  assert.match(fn, /const finishPhotoBoot = function \(\) \{[\s\S]*loadGrid\(\)/);
});

test('관리자는 첫 목록을 전체 근로자로 한 번만 시작한다', () => {
  const at = photos.indexOf('PuPhotoStore.signIn(u.uid');
  const fn = photos.slice(at, photos.indexOf('/* ══════ 카톡', at));
  const owner = fn.indexOf('gridOwner = ALL_OWNERS');
  const load = fn.indexOf('loadGrid()');
  assert.ok(owner > 0 && load > owner);
  assert.equal((fn.match(/^\s*loadGrid\(\);/gm) || []).length, 1,
    '부팅 경로에서 내 사진과 전체 사진을 두 번 읽으면 안 됩니다.');
});
