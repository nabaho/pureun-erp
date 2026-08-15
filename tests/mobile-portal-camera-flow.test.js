const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const enter = fs.readFileSync(path.join(R, 'enter.html'), 'utf8');
const photos = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* ⚠ 2026-08-15 뒤집었다 — 예전에는 건의 단추를 화면 오른쪽 아래(bottom:78px)에 띄우고
   「카메라(18px)와 겹치지 않는다」를 여기서 못 박았다. 그런데 같은 오른쪽 줄에
   pu-version.js 의 「최신」(bottom:96px)이 끼어들어 18px 차이로 물렸고, 일부 삼성·네이버
   브라우저는 fixed 좌표를 무시하고 단추를 헤더 자리로 되돌려 화면 위에서 잘랐다.
   그래서 폰에서는 아예 띄우지 않고 헤더 카드 안(로그아웃 옆)에 둔다 —
   띄우지 않으면 카메라와 겹칠 수도, 브라우저마다 달라질 수도 없다. */
test('모바일 건의 단추는 헤더 안에 있어 카메라와 겹치지 않는다', () => {
  const mobile = enter.match(/@media\(max-width:520px\)\{[\s\S]*?#sgFab\{[^}]*\}/);
  assert.ok(mobile, '폰용 #sgFab 규칙을 찾지 못했습니다');
  assert.doesNotMatch(mobile[0], /#sgFab\{[^}]*position:fixed/,
    '폰에서 건의 단추를 다시 띄우면 카메라·최신 단추와 겹칩니다');
  assert.match(enter, /#sgFab\{position:relative;display:inline-flex;/);
  /* 자리는 반드시 `.pbar #sgFab` 로 적어야 한다 — PC용 `.pbar #sgFab{order:4}` 가
     `#sgFab{order:0}` 보다 우선순위가 높아, 그냥 적으면 로그아웃 옆이 아니라
     헤더 맨 아래 줄로 밀린다(실제로 한 번 그렇게 났다). */
  assert.match(enter, /\.pbar #sgFab\{order:0;/,
    '`.pbar #sgFab` 로 적지 않으면 PC용 order:4 에 져서 아래 줄로 밀립니다');
});

test('폰에서 밖에 나오는 단추는 카메라와 ⋯ 둘뿐이다', () => {
  // 설정·백업·복구·최신은 ⋯ 안으로 데려온다(dockAdopt). 좌표는 한 곳(--fab-edge/--fab-bottom)에서 정한다.
  assert.match(enter, /--fab-edge:\s*\d+px;\s*--fab-bottom:\s*\d+px/);
  assert.match(enter, /#camFab\{[^}]*right:var\(--fab-edge\);bottom:var\(--fab-bottom\)/);
  assert.match(enter, /#moreFab\{[^}]*left:var\(--fab-edge\);bottom:var\(--fab-bottom\)/);
  assert.match(enter, /DOCK_IDS = \['cfgFab', 'pu-backup-admin-button', 'pu-version-fab'\]/);
});

test('타일 마지막 줄이 아래 단추에 깔리지 않는다', () => {
  const mobile = enter.match(/@media\(max-width:520px\)\{[\s\S]*?\.portal\{padding-bottom:(\d+)px;\}/);
  assert.ok(mobile, '폰에서 .portal 아래 여백을 찾지 못했습니다');
  assert.ok(Number(mobile[1]) >= 60, '아래 여백이 단추 높이보다 커야 합니다');
});

test('포털 카메라는 일반사진 모드로 고정해 진입한다', () => {
  const fn = enter.match(/function wireCamFab\(\)\{[\s\S]*?\n  \}/)[0];
  assert.match(fn, /mode=photo&quick=1&from=portal/);
  assert.match(fn, /pu-photos\.html\?cam=1/);
  assert.doesNotMatch(fn, /pu-camera\.html|capture|input\.click/);
});

test('포털 촬영은 확인창 없이 계속 누적된다', () => {
  const shoot = photos.match(/async function camShoot\(opts\) \{[\s\S]*?(?=\nfunction renderCamStrip)/)[0];
  assert.doesNotMatch(shoot, /setCamWarn|alert\([^)]*흐리|다시 찍기|그대로 쓰기/);
  assert.match(shoot, /camShots\.push\(/);
  assert.match(shoot, /renderCamStrip\(\)/);
});

test('아이폰 기본 카메라 사진은 페이지 이동 전에 고화질 JPEG로 확정한다', () => {
  assert.match(enter, /function portalCameraJpeg\(file\)/);
  assert.match(enter, /maxEdge = 4096/);
  assert.match(enter, /canvas\.toBlob\([\s\S]*?'image\/jpeg',\s*0\.95\)/);
  assert.match(enter, /savePortalCameraFile\(file\)[\s\S]*?portalCameraJpeg\(file\)/);
  assert.match(enter, /blob:photo\.blob/);
});

test('로그인 이동 뒤에도 요청을 기억하고 실제로 열린 뒤 한 번만 지운다', () => {
  const fn = photos.match(/function openCamIfAsked\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(fn, /sessionStorage\.getItem\('pu_open_camera'\)/);
  assert.match(fn, /openCam\(\)\.then/);
  assert.ok((fn.match(/clearCameraIntent\(\)/g) || []).length >= 2,
    '성공과 최종 실패에서 모두 촬영 요청을 지워야 다음 실행 때 권한창이 되살아나지 않습니다.');
});

test('저장이 끝난 뒤 포털로 돌아간다', () => {
  assert.match(photos, /from === 'portal' \? 'enter\.html'/);
  const upload = photos.match(/async function camUpload\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(upload, /if \(camReturnTo\) \{ camDiscard\(\); camGoBack\(\); \}/);
});
