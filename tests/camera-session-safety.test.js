const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

function block(start, end) {
  const at = html.indexOf(start);
  assert.ok(at >= 0, start + ' 블록을 찾지 못했습니다.');
  const to = html.indexOf(end, at);
  assert.ok(to > at, end + ' 경계를 찾지 못했습니다.');
  return html.slice(at, to);
}

test('문서 틀은 검출 전에는 숨고, 검출 후에만 보이며, 소실 뒤 다시 숨는다', () => {
  const apply = block('function applyFrameUI()', 'function showFrame()');
  const watch = block('function frameWatchTick()', 'function fitFrameToRect()');
  assert.match(apply, /f\.style\.display = showFrame\(\) \? "block" : "none"/);
  assert.match(watch, /camCardSeen = want;[\s\S]*applyFrameUI\(\)/);

  const thresholds = html.match(/const SEEN_ON = (\d+), SEEN_OFF = (\d+)/);
  assert.ok(thresholds);
  const seenOn = Number(thresholds[1]), seenOff = Number(thresholds[2]);
  let seen = false, hit = 0, miss = 0;
  function tick(found) {
    if (found) { hit++; miss = 0; } else { miss++; hit = 0; }
    seen = seen ? !(miss >= seenOff) : (hit >= seenOn);
    return seen;
  }
  assert.equal(tick(false), false, '검출 전 틀이 보이면 안 됩니다.');
  for (let i = 0; i < seenOn - 1; i++) assert.equal(tick(true), false);
  assert.equal(tick(true), true, '연속 검출 후 틀이 보여야 합니다.');
  for (let i = 0; i < seenOff - 1; i++) assert.equal(tick(false), true);
  assert.equal(tick(false), false, '연속 소실 후 틀이 다시 숨겨져야 합니다.');
});

test('느린 사진 성능 조회는 닫힌 세션이나 새 세션의 옵션을 덮지 않는다', () => {
  const load = block('async function loadPhotoBest()', 'const EDGE_W');
  assert.match(load, /const sessionToken = arguments\.length/);
  assert.match(load, /const capture = arguments\.length > 1/);
  assert.match(load, /await capture\.getPhotoCapabilities\(\)/);
  assert.match(load, /if \(sessionToken !== camSessionToken \|\| camCap !== capture\) return;/);
  const stop = block('function camStop()', 'function closeCam()');
  assert.match(stop, /camSessionToken\+\+/);
  assert.match(stop, /camPhotoOpts = null/);
});

test('카메라 트랙 종료는 스트림과 미리보기를 정리한 뒤 실패로 전환한다', () => {
  const ended = block('function handleCamTrackEnded', 'async function camTapFocus');
  assert.match(ended, /camTrack !== track/);
  assert.ok(ended.indexOf('camStop()') < ended.indexOf('camFail()'));
  const stop = block('function camStop()', 'function closeCam()');
  assert.match(stop, /camStream\.getTracks\(\)\.forEach/);
  assert.match(stop, /preview\.srcObject = null/);
});

test('닫기 중이던 카메라 열기와 촬영은 토큰으로 무효화된다', () => {
  const open = block('async function openCam()', 'function camFail()');
  assert.match(open, /const sessionToken = \+\+camSessionToken/);
  assert.match(open, /if \(sessionToken !== camSessionToken\)/);
  assert.match(open, /openingStream\.getTracks\(\)\.forEach/);
  assert.match(open, /catch \(e\)[\s\S]*camStop\(\)[\s\S]*camFail\(\)/);

  const shoot = block('async function camShoot(opts)', 'function renderCamStrip');
  assert.match(shoot, /const shotToken = \+\+camShotToken/);
  assert.ok((shoot.match(/camShotIsCurrent\(/g) || []).length >= 4);
  const best = block('async function captureBestSource(v)', 'async function camShoot(opts)');
  assert.match(best, /const shotTrack = camTrack, capture = camCap/);
  assert.match(best, /capture\.takePhoto\(photoOpts\)/);
  assert.match(best, /camShotIsCurrent\(sessionToken, shotToken, shotTrack\)/);
});

test('화면 이탈과 정지는 자동 감시·손전등·준비 상태를 완전히 정리한다', () => {
  assert.match(html, /addEventListener\('pagehide', function \(\) \{ camStop\(\); \}\)/);
  const stop = block('function camStop()', 'function closeCam()');
  assert.match(stop, /stopAutoWatch\(\)/);
  assert.match(stop, /stopFrameWatch\(\)/);
  assert.match(stop, /autoArmed = true; autoCoolUntil = 0; autoRestUp\(\)/);
  assert.match(stop, /camBusy = false/);
  assert.match(stop, /camOpening = false/);
  assert.match(stop, /off && off\.catch/);
});

test('첫 화면은 이전 촬영 장수와 문서 검출 상태를 비운 뒤 권한을 요청한다', () => {
  const open = block('async function openCam()', 'function camFail()');
  const reset = open.indexOf('camCardSeen = false');
  const shots = open.indexOf('camShots = []');
  const render = open.indexOf('renderCamStrip()');
  const permission = open.indexOf('await navigator.mediaDevices.getUserMedia');
  assert.ok(reset > 0 && shots > reset && render > shots && permission > render);
});
