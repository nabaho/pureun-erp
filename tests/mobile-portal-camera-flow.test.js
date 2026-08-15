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

test('폰 아래 단추 자리는 한 곳(--fab-edge/--fab-bottom)에서만 정한다', () => {
  /* 예전에는 enter.html·pu-backup.js·pu-version.js 가 각자 좌표를 써서 겹쳤다.
     이제 모두 이 두 값에서 파생시킨다 — 백업·복구처럼 밖에 두는 것도 마찬가지다. */
  assert.match(enter, /--fab-edge:\s*\d+px;\s*--fab-bottom:\s*\d+px/);
  assert.match(enter, /#camFab\{[^}]*right:var\(--fab-edge\);bottom:var\(--fab-bottom\)/);
  assert.match(enter, /#fabBar\{[^}]*left:var\(--fab-edge\);bottom:var\(--fab-bottom\)/);
  // 화면에 제 좌표로 떠 있는 것은 카메라와 아래 바 둘뿐이어야 한다
  const fixed = [...enter.matchAll(/^#([\w-]+)\{[^}]*position:fixed/gm)].map((m) => m[1]);
  const bottomFixed = fixed.filter((id) => ['camFab', 'fabBar', 'moreDock', 'cfgFab'].includes(id));
  assert.deepEqual(new Set(bottomFixed), new Set(['camFab', 'fabBar', 'moreDock', 'cfgFab']),
    '아래 단추는 카메라·바·⋯패널만 제 좌표를 가진다(설정은 PC 전용 좌표)');
});

test('자주 안 쓰는 설정·최신만 ⋯ 안으로 넣는다', () => {
  // 백업·복구는 자주 써서 밖에 둔다(대표 지시 2026-08-15)
  assert.match(enter, /DOCK_IDS = \['cfgFab', 'pu-version-fab'\]/);
});

test('아래 왼쪽 단추는 모두 한 줄 바에 모은다', () => {
  /* 조건부로만 나타나는 단추 둘을 처음에 놓쳤다 —
       pu-health.js  장애 알림  left:12px  bottom:12px  → ⋯ 와 같은 자리
       pu-resilience.js 연결 경고 right:12px bottom:12px → 카메라와 같은 자리
     평소엔 안 보이다가 정작 문제가 생겼을 때 겹쳐서, 제일 봐야 할 알림이 가렸다.
     #fabBar 안에 넣으면 좌표를 잃고 옆으로 이어 붙으므로 몇 개가 늘어도 안 겹친다. */
  assert.match(enter, /BAR_IDS = \['pu-backup-admin-button', 'pu-health-admin-badge', 'pu-resilience-badge'\]/);
  assert.match(enter, /#fabBar\{[^}]*left:var\(--fab-edge\);bottom:var\(--fab-bottom\)/);
  // 바 안에서는 각자 좌표를 잃어야 한다
  assert.match(enter, /#fabBar > \*\{position:static!important/);
  // 오른쪽 카메라 자리는 비워 둔다 — 안 그러면 바가 카메라 밑으로 파고든다
  assert.match(enter, /#fabBar\{[^}]*max-width:calc\(100vw[^}]*\)/);
});

test('폰에서는 한 화면에 다 넣는다 — 바로가기는 헤더 안, 겹치는 제목은 숨김', () => {
  /* 폰 브라우저는 위아래 바를 빼면 쓸 수 있는 높이가 760px 안팎이다.
     타일 4줄을 그 안에 넣으려면 위쪽에서 줄을 벌어야 한다:
       · 「업무 시스템」 제목 줄(.sec)은 아래 「업무지원·직접업무」와 겹치는 안내라 숨긴다
       · 「로그인 후 바로가기」는 헤더 카드 안으로 옮긴다(moveHomeBar) */
  /* @media(max-width:520px) 블록이 파일에 여러 개라 첫 블록만 보면 놓친다 — 전체에서 찾는다.
     두 선택자 모두 폰용 블록에만 쓰이므로 이걸로 충분하다. */
  assert.match(enter, /\.sec\{display:none;\}/);
  assert.match(enter, /\.pbar #homeBar\{/);
  assert.match(enter, /function moveHomeBar\(toHeader\)/);
  assert.match(enter, /moveHomeBar\(phone\.matches\)/, 'PC로 넓히면 제자리로 돌아가야 합니다');
  assert.match(enter, /grid-template-columns:repeat\(4,1fr\)/, '한 줄 4개(대표 지시)');
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

/* 대표 보고 2026-08-15: "카메라에서 뒤로 가기를 잠깐 누르면 깨진 듯한 화면이 아주 짧게 스친다"
   원인 — 카메라에는 뒤로 가기 처리가 아예 없었다(「크게 보기」에는 있었다).
   그래서 뒤로 가기가 카메라를 닫는 게 아니라 **페이지를 통째로** 빠져나갔고,
   그 순간 카메라 영상이 아직 살아 있는 채로 화면이 넘어가면서 한순간 깨져 보였다. */
test('카메라는 폰 뒤로 가기로 닫힌다 — 페이지를 빠져나가지 않는다', () => {
  assert.match(photos, /function camHistPush\(\)/);
  assert.match(photos, /history\.pushState\(\{ puCam: 1 \}/);
  // 카메라를 여는 자리마다 역사 칸을 쌓아야 뒤로 가기가 먹힌다
  const pushes = photos.match(/if \(!camPushed\) camHistPush\(\);/g) || [];
  assert.ok(pushes.length >= 3, '카메라를 여는 모든 자리에서 쌓아야 합니다 (지금 ' + pushes.length + '곳)');
  // popstate 에서 닫고, 사용자가 [취소]하면 칸을 다시 쌓는다
  assert.match(photos, /if \(closeCam\(\) === false\) camHistPush\(\)/);
});

test('페이지를 떠날 때 카메라 영상을 먼저 끈다', () => {
  // 스트림이 살아 있는 채로 화면이 넘어가면 깨진 화면이 스친다
  assert.match(photos, /addEventListener\('pagehide', function \(\) \{[\s\S]{0,220}camStop\(\)/);
});

test('찍어 둔 장이 있을 때 [취소]하면 카메라가 닫히지 않는다', () => {
  // closeCam 이 false 를 돌려줘야 popstate 쪽에서 역사 칸을 다시 쌓아 준다
  assert.match(photos, /if \(camShots\.length && !confirm\([^)]*\)\) return false;/);
});
