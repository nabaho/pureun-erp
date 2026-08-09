/* 카메라 하나로 — 1단계 (대표 지시 2026-08-08)
   "카메라는 하나로 하고 알아서 자동으로 위치로 보내는 기능을 만드는 게 좋겠다"

   촬영 코드가 두 벌이었고 **가는 곳도 달랐다**:
     옛 푸른카메라 → 명함첩 직행 (자동 분류를 안 탐)
     사진첩 카메라 → 사진첩에 담고 자동 배송
   같은 명함인데 어느 카메라로 찍었느냐로 결과가 갈렸다.
   이제 촬영 코드는 사진첩 하나뿐이고, pu-camera.html 은 문패만 남아 넘긴다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const cam = fs.readFileSync(path.join(R, 'pu-camera.html'), 'utf8');
const photos = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(R, 'pu-camera-manifest.json'), 'utf8'));

/* ── 촬영 코드가 하나만 남았는가 ── */
test('★ 푸른카메라에 촬영 코드가 남아 있지 않다', () => {
  /* 두 벌이면 한쪽만 고치는 사고가 난다 — 실제로 주석에 "푸른카메라에서
     검증된 순서를 그대로 가져왔다"고 적혀 있었다(복사본이라는 뜻). */
  for (const s of ['getUserMedia', 'ImageCapture', '<video', 'canvas']) {
    assert.ok(!cam.includes(s), '문패에 촬영 코드가 남아 있습니다: ' + s);
  }
  assert.ok(cam.length < 4000, '문패가 ' + cam.length + '자입니다 — 넘기기만 해야 합니다.');
});

test('사진첩에는 촬영 코드가 그대로 있다', () => {
  assert.ok(/getUserMedia/.test(photos) && /id="camOv"/.test(photos),
    '유일한 카메라가 사라지면 안 됩니다.');
});

/* ── 넘기기 ── */
test('★ 문패는 사진첩 카메라로 곧바로 넘긴다', () => {
  assert.ok(/location\.replace\(/.test(cam),
    'replace 가 아니면 뒤로 가기가 빈 문패로 돌아옵니다.');
  assert.ok(/pu-photos\.html\?cam=1/.test(cam));
});

test('★ 원래 붙어 있던 값을 잃지 않는다 (로그인 흐름)', () => {
  /* 포털이 ?sso=1 을 붙여 보낼 수 있다 — 떼어 버리면 로그인이 끊긴다 */
  const m = cam.match(/\(function \(\) \{[\s\S]*?\}\)\(\);/);
  assert.ok(m, '넘기는 코드를 찾지 못했습니다.');
  const ctx = { location: { search: '?sso=1', replace(u) { ctx.went = u; } } };
  vm.createContext(ctx);
  vm.runInContext(m[0], ctx);
  assert.equal(ctx.went, 'pu-photos.html?cam=1&sso=1');
});

test('붙은 값이 없으면 깔끔하게 넘긴다', () => {
  const m = cam.match(/\(function \(\) \{[\s\S]*?\}\)\(\);/);
  const ctx = { location: { search: '', replace(u) { ctx.went = u; } } };
  vm.createContext(ctx);
  vm.runInContext(m[0], ctx);
  assert.equal(ctx.went, 'pu-photos.html?cam=1');
});

test('스크립트가 막혀도 갈 길이 있다', () => {
  assert.ok(/<a href="pu-photos\.html\?cam=1"/.test(cam),
    '스크립트가 막힌 브라우저에서 빈 화면에 갇히면 안 됩니다.');
});

/* ── 아이콘이 안 깨지는가 (가장 중요) ── */
test('★ 폰에 설치한 아이콘이 그대로 열린다', () => {
  assert.ok(fs.existsSync(path.join(R, 'pu-camera.html')),
    '파일을 지우면 설치한 분의 아이콘이 깨집니다.');
  assert.ok(/<link rel="manifest" href="pu-camera-manifest\.json">/.test(cam),
    '설명 파일을 떼면 앱이 아니라 웹페이지로 열립니다.');
  assert.equal(manifest.start_url, './pu-camera.html',
    '시작 주소를 바꾸면 설치된 앱이 옛 주소를 잃습니다.');
  assert.equal(manifest.name, '푸른카메라', '이름이 바뀌면 홈 화면에서 못 찾습니다.');
});

/* ── 사진첩이 표시를 알아듣는가 ── */
test('★ ?cam=1 이면 곧바로 카메라를 켠다', () => {
  const m = photos.match(/function openCamIfAsked\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'openCamIfAsked 가 없습니다.');
  assert.ok(/get\('cam'\) === '1'/.test(m[0]));
  assert.ok(/openCam/.test(m[0]));
});

test('★ 표시를 한 번 쓰고 지운다', () => {
  const m = photos.match(/function openCamIfAsked\(\)[\s\S]*?\n\}/);
  /* ⚠ 2026-08-09 다시 겨눔 — 지우는 표시가 셋(cam·mode·from)이 되면서 한 줄씩
     적지 않고 묶어 지운다. 못 박을 것은 **표시를 지운다**는 것이지 적는 모양이 아니다. */
  assert.ok(/searchParams\.delete\(/.test(m[0]) && /'cam'/.test(m[0]),
    '안 지우면 카메라를 닫고 새로고침할 때마다 다시 켜져 사진첩을 볼 수 없습니다.');
});

test('로그인이 끝난 뒤에 켠다', () => {
  const m = photos.match(/PuPhotoStore\.signIn\([\s\S]{0,1400}?openCamIfAsked\(\);/);
  assert.ok(m, '계정을 모르는 채 카메라를 켜면 찍어도 담을 곳이 없습니다.');
});

test('표시가 없으면 아무 일도 없다', () => {
  const m = photos.match(/function openCamIfAsked\(\)[\s\S]*?\n\}/);
  assert.ok(/if \(!want\) return;/.test(m[0]), '평소에 사진첩을 열 때 카메라가 켜지면 안 됩니다.');
});

test('주소를 못 읽어도 터지지 않는다', () => {
  const m = photos.match(/function openCamIfAsked\(\)[\s\S]*?\n\}/);
  assert.ok(/catch \(_\) \{ return; \}/.test(m[0]));
});

/* ══════ 2단계: 명함첩 카메라까지 없애 정말 하나로 (대표 지시 2026-08-09) ══════
   1단계에서 옛 푸른카메라를 문패로 만들었지만, **명함첩(pu-cards.html) 안에
   똑같은 촬영 코드가 한 벌 더 남아 있었다.** 그것이 사진첩을 안 거쳐 자동 분류·
   업체관리 보내기를 못 탔다 — 1단계에서 없앤 문제가 이름만 바꿔 남아 있던 셈. */
const cards = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8');
const docFile = fs.readFileSync(path.join(R, 'js', 'pu-doc-file.js'), 'utf8');

test('★ 명함첩에는 촬영 코드가 없다', () => {
  /* 왜 없앴는지는 주석으로 남겨 뒀다 — 그래서 낱말이 아니라 **실제로 부르는가**를 본다.
     (주석까지 금지하면 다음 사람이 이유를 못 읽는다) */
  assert.ok(!/navigator\.mediaDevices/.test(cards),
    '명함첩이 또 자기 카메라를 갖고 있습니다 — 한쪽만 고치는 사고가 납니다.');
  assert.ok(!/camShot\s*\(|camAskBack\s*\(|<video/.test(cards),
    '촬영 화면 조각이 남아 있습니다.');
});

test('★ 명함첩 ＋ 는 사진첩 카메라를 명함 모드로 부른다', () => {
  const m = cards.match(/function openCamera\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'openCamera 가 없습니다 — ＋ 단추가 아무 일도 안 합니다.');
  assert.ok(/pu-photos\.html\?cam=1/.test(m[0]), '사진첩 카메라로 넘기지 않습니다.');
  assert.ok(/mode=card/.test(m[0]), '명함 모드로 열지 않으면 명함틀이 꺼진 채 열립니다.');
  assert.ok(/from=cards/.test(m[0]), '돌아올 곳을 안 적으면 명함첩으로 못 돌아옵니다.');
});

test('명함 모드에서는 명함틀이 늘 켜져 있다', () => {
  const m = photos.match(/function frameOn\(\)[\s\S]*?\n/);
  assert.ok(/camCardMode/.test(m[0]),
    '명함을 찍으러 왔는데 틀이 꺼져 있으면 배경만 크게 담깁니다.');
});

test('★ 앞면을 찍으면 뒷면을 묻는다 (대표 선택 가)', () => {
  assert.ok(/function camAskBack\(/.test(photos), '뒷면을 묻는 길이 없습니다.');
  const m = photos.match(/async function camShoot\(\)[\s\S]*?(?=\nfunction renderCamStrip)/);
  assert.ok(/camCardMode && camCardStage === 'front'/.test(m[0]),
    '명함 모드에서 앞면을 찍은 뒤에만 물어야 합니다.');
  /* 사진첩에서 그냥 열었을 때는 묻지 않는다 — 연속 촬영이 끊긴다 */
  assert.ok(/camCardMode/.test(m[0]), '사진첩 연속 촬영에서도 물으면 흐름이 끊깁니다.');
});

test('★ 뒷면은 앞면에 얹혀 간다 — 명함이 두 장 생기지 않는다', () => {
  const m = photos.match(/function sendCards\([\s\S]*?\n\}/);
  /* ⚠ 낱말만 보면 안 된다 — 아래 「뒷면 찾기」에도 meta.cardBack 이 나온다.
     **뒷면이면 그 자리에서 돌아서는가**를 봐야 한다. */
  assert.ok(/cardBack\)\s*return/.test(m[0]),
    '뒷면도 혼자 명함첩에 가면 앞뒤를 찍을 때마다 명함이 두 장씩 생깁니다.');
  assert.ok(/full2/.test(m[0]) && /thumb2/.test(m[0]),
    '뒷면을 함께 보내지 않으면 앞면만 남습니다.');
});

test('★ 등록 층이 뒷면을 명함첩이 보는 자리에 넣는다', () => {
  assert.ok(/photos\/' \+ id \+ '_b'/.test(docFile),
    '명함첩 편집기·상세보기는 뒷면을 {id}_b 자리에서 찾습니다.');
  assert.ok(/thumb2:/.test(docFile), '목록에 뒷면 미리보기가 안 잡힙니다.');
});

test('★ 다 올리면 명함첩으로 돌아간다', () => {
  const m = photos.match(/async function camUpload\(\)[\s\S]*?\n\}/);
  assert.ok(/camReturnTo/.test(m[0]) && /camGoBack\(\)/.test(m[0]),
    '온 곳으로 안 돌아가면 명함첩에서 찍었는데 사진첩에 남겨집니다.');
});

test('사진첩에서 그냥 열면 돌아갈 곳이 없다', () => {
  const m = photos.match(/function openCamIfAsked\(\)[\s\S]*?\n\}/);
  assert.ok(/from === 'cards'/.test(m[0]),
    '명함첩에서 온 것만 돌려보내야 합니다 — 아니면 사진첩 촬영도 튕겨 나갑니다.');
});

/* ══════ 폰 화질 — 스틸과 미리보기 중 큰 쪽 (대표 보고 2026-08-09) ══════
   "여전히 폰에서는 화질이 너무 낮다". 안드로이드 기기 중에는 크게 달라고 해도
   **미리보기보다 작은 사진**을 주는 것이 있는데, 예전에는 그걸 그대로 썼다.
   1920 짜리 화면을 두고 640 짜리를 담으면 글씨가 뭉갠다. */
test('★ 스틸이 미리보기보다 작으면 미리보기를 쓴다', () => {
  const m = photos.match(/async function camShoot\(\)[\s\S]*?(?=\nfunction renderCamStrip)/);
  assert.ok(m, 'camShoot 를 찾지 못했습니다.');
  assert.ok(/Math\.max\(stw, sth\) >= Math\.max\(v\.videoWidth, v\.videoHeight\)/.test(m[0]),
    '기기가 준 사진이 작아도 그대로 쓰면 화면보다 못한 사진이 담깁니다.');
});

test('★ 어느 길로 찍혔는지 사진에 적어 둔다', () => {
  const m = photos.match(/async function camShoot\(\)[\s\S]*?(?=\nfunction renderCamStrip)/);
  assert.ok(/capWay: capWay/.test(m[0]), '찍힌 길을 안 남기면 화질을 따질 때 추측만 하게 됩니다.');
  assert.ok(/meta\.capWay = cp\.way/.test(photos), '사진 정보까지 실려야 나중에 볼 수 있습니다.');
});

test('★ 크게 보기에서 찍힌 길이 보인다', () => {
  assert.ok(/화면캡처/.test(photos) && /capWay/.test(photos),
    '화면에 안 보이면 대표님이 알려주실 수가 없습니다.');
});

test('스틸이 실패해도 사진은 담긴다', () => {
  const m = photos.match(/async function camShoot\(\)[\s\S]*?(?=\nfunction renderCamStrip)/);
  assert.ok(/catch \(e\) \{[\s\S]{0,120}capNote = '스틸 실패/.test(m[0]),
    '스틸이 안 되는 기기에서 촬영 자체가 막히면 안 됩니다.');
});
