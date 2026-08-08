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
  assert.ok(/searchParams\.delete\('cam'\)/.test(m[0]),
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
