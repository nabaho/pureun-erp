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
  /* ⚠ 못 박는 것은 «한 줄에 넷» 이지 그것을 적는 «글자» 가 아니다.
     여기 repeat(4,1fr) 을 글자 그대로 박아 두었더니, 좁은 폰에서 타일이 화면 밖으로
     나가던 것을 repeat(4,minmax(0,1fr)) 로 고치자 «멀쩡한 개선» 때문에 깨졌다
     (2026-08-24). 1fr 은 글자보다 좁아지지 못한다는 것이 그 흠의 정체였다. */
  assert.match(enter, /grid-template-columns:repeat\(4,[^;}]*\)/, '한 줄 4개(대표 지시)');
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

/* ⚠⚠ 2026-09-05 다시 겨눔 — 이 검사가 «틀린 규칙»을 못박고 있었다.
   종전 제목: 「… 실제로 열린 뒤 한 번만 지운다」. 그런데 **그것이 바로 버그였다.**
   지우는 자리가 「카메라가 열린 뒤」뿐이면, PC 처럼 카메라가 없거나 권한을 안 준
   기기에서는 쪽지가 **영영 안 지워진다.** sessionStorage 는 그 탭이 사는 내내
   남으므로, 사진첩을 열 때마다 카메라를 또 켜고 camReturnTo 를 포털로 다시 무장한다 —
   그 뒤로는 사진첩에서 한 장 찍어 올리기만 해도 포털로 튕겼다(대표 보고 2026-09-05).

   지킬 것은 그대로다: **로그인 이동 뒤에도 요청을 기억한다.**
   바뀐 것은 버리는 때다: **읽는 그 자리에서** 버린다(tests/photos-camera-ticket). */
test('로그인 이동 뒤에도 요청을 기억한다 — 다만 «읽는 자리에서» 버린다', () => {
  const fn = photos.match(/function openCamIfAsked\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(fn, /takeCameraIntent\(\)/,
    '★ 쪽지를 집어 드는 길이 없으면 로그인 이동 뒤에 촬영 요청이 사라집니다');
  assert.match(fn, /openCam\(\)\.then/);
  const take = photos.match(/function takeCameraIntent\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(take, /clearCameraIntent\(\);/,
    '★★★ 읽고도 안 버리면 그 탭이 사는 내내 남아 사진첩이 계속 튕깁니다');
  assert.ok(take.indexOf('clearCameraIntent') < take.indexOf('JSON.parse'),
    '★★★ 뜯어보기 «전»에 버려야 합니다 — 깨진 쪽지에서 멈추면 그것이 영영 남습니다');
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

/* 대표 화면 2026-08-15: 명함 촬영 중인데 「장애 알림 2건」·「새 버전 있음」·「즐겨찾기」가
   셔터 줄과 명함 미리보기 위로 올라와 있었다. 이 딱지들은 z-index 가 21억이고
   카메라 덮개는 60 이라 언제나 딱지가 이긴다. */
test('카메라를 열면 떠다니는 딱지를 감춘다', () => {
  assert.match(photos, /body\.cam-open #pu-health-admin-badge/);
  assert.match(photos, /body\.cam-open #pu-version-fab/);
  assert.match(photos, /body\.cam-open \[data-pu-appbar-btn\]/);
  /* 덮개의 display 를 세우는 자리가 여러 군데라 부르는 쪽마다 표시를 붙이면 한 곳은 빠진다.
     덮개 자체를 지켜봐야 어느 길로 열리든 따라간다. */
  assert.match(photos, /new MutationObserver\(sync\)\.observe\(ov, \{ attributes: true/);
  assert.match(photos, /classList\.toggle\('cam-open'/);
  /* camOv 의 z-index 를 같이 올리는 것으로 때우지 않는다 —
     같은 파일 안의 검토 화면·크게 보기와 겹침 순서가 얽힌다. */
  assert.match(photos, /#camOv\{[^}]*z-index:60/);
});

/* 대표 보고 2026-08-15: "갤럭시26 폰이다 화질 검토해서 카메라 수정"
   요즘 갤럭시는 뒷면 카메라가 서넛(주카메라·초광각·망원)인데, 그동안은
   `facingMode:'environment'` 만 주고 브라우저가 고르는 대로 썼다. 초광각이 잡히면
   화각이 넓어 명함이 작게 찍히고, 최소 초점거리가 멀어 가까이 대면 초점이 안 잡힌다.
   ⚠ 어느 렌즈가 실제로 잡히는지는 그 폰에서만 알 수 있다 —
     그래서 자동 고르기 + 사람이 바꾸기 + 기기가 내놓은 값 보여주기를 함께 넣었다. */
test('뒷면 렌즈를 골라 연다 — 초광각·망원은 뒤로 민다', () => {
  assert.match(photos, /function lensScore\(label\)/);
  // 안드로이드 관례: camera2 0 이 주카메라 (1 은 앞면, 2 이상이 보조)
  assert.match(photos, /camera2\?\\s\+\(\\d\+\)/);
  assert.match(photos, /ultra\|wide\|광각\|0\\\.5/);
  assert.match(photos, /depth\|macro\|mono\|접사\|심도/);
  // 앞면은 뒷면 목록에 들어오면 안 된다
  assert.match(photos, /function isBackLabel\(label\)/);
  assert.match(photos, /front\|facing front\|전면\|셀피/);
});

test('사람이 고른 렌즈는 자동 고르기가 되돌리지 않는다', () => {
  /* 내 점수가 틀렸을 때 사용자의 선택을 매번 되돌리면 고칠 길이 없어진다 */
  assert.match(photos, /if \(!chosen && best && camDevId && best\.deviceId !== camDevId\)/);
  assert.match(photos, /localStorage\.setItem\(CAM_LENS_LS, next\.deviceId\)/);
});

test('기억해 둔 렌즈가 사라져도 카메라는 열린다', () => {
  /* 다른 기기·다른 브라우저에서 고른 값이 남아 있을 수 있다.
     한 번 조용히 잊고 브라우저에 맡기지 않으면 이 폰에서 카메라가 영영 안 열린다. */
  assert.match(photos, /localStorage\.removeItem\(CAM_LENS_LS\)/);
  assert.match(photos, /catch \(e0\) \{[\s\S]{0,600}camWantDevId = '';/);
});

test('기기가 내놓은 값을 그대로 보여 주는 화면이 있다', () => {
  // 「화질이 안 좋다」에 추측으로 답하지 않으려고 만든 것
  assert.match(photos, /function camShowDiag\(\)/);
  assert.match(photos, /id="camDiag"/);
  assert.match(photos, /이 기기 최대/);
  assert.match(photos, /당겨찍기/);
});

/* 대표 지시 2026-08-15: "자동으로 못 하나 니가"
   이름만 보고 고르는 것은 추측이다 — 기기마다 라벨이 다르고 아예 비는 브라우저도 있다.
   그래서 처음 한 번은 **직접 열어 보고 재서** 고른다. 가짜 카메라로 확인한 값:
     · 이름 점수가 꼴찌(camera2 7)여도 최대 크기가 제일 큰 렌즈를 골랐다
     · 처음 2.8초 · 두 번째부터 0.4초(재지 않고 바로 연다) */
test('렌즈는 처음 한 번 재서 자동으로 고른다', () => {
  assert.match(photos, /async function autoPickLens\(sessionToken\)/);
  assert.match(photos, /async function probeLens\(deviceId, settleMs\)/);
  /* 고르는 기준의 차례가 핵심이다 — 최대 크기가 먼저다.
     앞에 무엇이 놓여 있든 흔들리지 않는 값이라 제일 믿을 만하다. */
  assert.match(photos, /\(b\.maxEdge - a\.maxEdge\) \|\| \(b\.sharp - a\.sharp\) \|\| \(b\.hint - a\.hint\)/);
  // 결과를 기억해 다음부터는 바로 연다 (매번 재면 「눌러도 안 켜진다」가 된다)
  assert.match(photos, /localStorage\.setItem\(CAM_LENS_AUTO_LS, 'done'\)/);
});

test('권한을 받기 전에는 재지 않는다 — 셀피 카메라를 고를 수 있다', () => {
  /* 권한 전 enumerateDevices 는 이름을 비워 준다. 이름이 없으면 앞뒤를 못 가려
     앞면 카메라까지 재게 되고, 자칫 그것을 고를 수도 있다.
     그때는 null 을 돌려주고 **「했음」으로 적지 않는다** — 적으면 영영 다시 안 잰다. */
  assert.match(photos, /if \(named\.length !== cams\.length \|\| !cams\.length\) return null;/);
  assert.match(photos, /if \(picked !== null\) \{[\s\S]{0,200}CAM_LENS_AUTO_LS, 'done'/);
});

test('재는 동안 무슨 일이 있어도 장치를 놓아 준다', () => {
  // 놓지 않으면 카메라가 잡힌 채 남아 다음 열기가 실패한다
  assert.match(photos, /finally \{[\s\S]{0,200}stream\.getTracks\(\)\.forEach\(function \(t\) \{ try \{ t\.stop\(\)/);
});

test('자동이 잘못 골랐을 때 다시 고를 길이 있다', () => {
  assert.match(photos, /async function camRecalibrateLens\(\)/);
  assert.match(photos, /removeItem\(CAM_LENS_AUTO_LS\)/);
});
