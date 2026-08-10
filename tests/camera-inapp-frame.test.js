/* 앱 안 브라우저 · 명함이 보일 때만 틀 — 대표 지시 2026-08-10
   "명함을 찍으려하면 네모 박스가 나오고 명함이 아닌경우 네모박스가 안나오게"
   "여전히 화질은 많이 안좋다. 근본적 문제 해결이 필요하다"

   ★ 화질의 뿌리는 **브라우저**였다.
   대표님 화면 아래가 네이버 앱 안 브라우저였다(크롬이 아니다). 앱 안 브라우저는
   고해상도 촬영(ImageCapture)도 초점 지정(focusMode)도 대개 막혀 있어서,
   해상도를 올리고 초점을 먼저 잡게 만든 것이 **전부 무시되고 있었다.**
   미리보기부터 흐렸던 것이 그 증거다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

/* ── 앱 안 브라우저 가려내기 ── */
function inApp(ua) {
  const src = html.match(/function inAppBrowser\(\)[\s\S]*?\n\}/)[0];
  const ctx = { navigator: { userAgent: ua } };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return vm.runInContext('inAppBrowser()', ctx);
}

test('★ 네이버·카카오톡 앱 안 브라우저를 가려낸다', () => {
  assert.equal(inApp('Mozilla/5.0 (Linux; Android 14) NAVER(inapp; search; 1234)'), true, '네이버');
  assert.equal(inApp('Mozilla/5.0 (Linux; Android 14) KAKAOTALK 10.0.0'), true, '카카오톡');
  assert.equal(inApp('Mozilla/5.0 (iPhone) Instagram 300.0'), true, '인스타');
});

test('보통 브라우저는 안 걸린다 (멀쩡한 카메라를 막으면 안 된다)', () => {
  assert.equal(inApp('Mozilla/5.0 (Linux; Android 14) Chrome/126 Mobile Safari/537.36'), false, '크롬');
  assert.equal(inApp('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Safari/605.1'), false, '사파리');
  assert.equal(inApp('Mozilla/5.0 (Windows NT 10.0) Chrome/126 Safari/537.36'), false, 'PC 크롬');
});

test('★ 앱 안 브라우저면 화면 안 카메라를 열지 않고 폰 카메라로 보낸다', () => {
  const m = html.match(/async function openCam\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'openCam 을 찾지 못했습니다.');
  const at = m[0].indexOf('inAppBrowser()');
  const gum = m[0].indexOf('getUserMedia');
  assert.ok(at > 0, '앱 안 브라우저인지 안 봅니다.');
  assert.ok(at < gum, '열고 나서 판단하면 이미 흐린 미리보기가 떠 있습니다.');
  assert.ok(/camInput'\)\.click\(\)/.test(m[0].slice(at, gum)), '폰 카메라로 안 보냅니다.');
});

test('왜 다른 화면이 뜨는지 말해 준다', () => {
  const m = html.match(/async function openCam\(\)[\s\S]*?\n\}/);
  const at = m[0].indexOf('inAppBrowser()');
  assert.ok(/toast\(/.test(m[0].slice(at, at + 300)),
    '아무 말 없이 다른 화면이 뜨면 고장으로 보입니다.');
});

/* ── 점선은 안내, 실선은 자르기 ──
   2026-08-10 다시 겨눔: 예전에는 「명함을 찾았을 때만 그린다」를 못 박고 있었다.
   그러면 못 찾는 동안 화면에 아무 표시가 없어 어디에 어느 크기로 대야 할지 알 수
   없다 — 너무 가까이 대어 명함이 화면 밖으로 넘치고, 넘쳤으니 또 못 찾는 되돌이가
   된다(대표 지시 2026-08-10 "명함을 비출때 점선표시등이 나왔으면").
   지켜야 할 것은 「명함이 아닌데 잘리지 않는다」이지 「안 그린다」가 아니다. */
test('★ 점선 안내는 틀을 켜 두면 늘 보인다', () => {
  const m = html.match(/function applyFrameUI\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'applyFrameUI 를 찾지 못했습니다.');
  assert.ok(/display = on \? "block" : "none"/.test(m[0]),
    '못 찾는 동안 표시가 없으면 어디에 맞출지 알 수 없습니다.');
  assert.ok(/showFrame\(\) \? "" : "hint"/.test(m[0]),
    '찾았을 때와 못 찾았을 때가 같아 보이면 언제 찍어야 할지 알 수 없습니다.');
});

test('★ 자르기는 여전히 명함을 찾았을 때만이다', () => {
  assert.ok(/function showFrame\(\) \{ return frameOn\(\) && camCardSeen; \}/.test(html),
    '점선만 보고 자르면 명함이 아닌 사진까지 네모로 잘려 나갑니다.');
});

test('점선은 둘레를 어둡게 덮지 않는다', () => {
  /* 회의사진을 찍을 때 시야가 가려지면 안 된다 — 자를 때만 덮는다 */
  const css = html.match(/#camFrame\.hint\{[^}]*\}/);
  assert.ok(css, '점선 모습이 따로 없습니다.');
  assert.ok(/dashed/.test(css[0]), '점선이 아니면 안내인지 확정인지 구분이 안 됩니다.');
  assert.ok(/box-shadow:none/.test(css[0]), '안내일 뿐인데 둘레를 덮으면 시야를 가립니다.');
});

test('★ 그리는 것과 자르는 것이 같은 판단을 쓴다', () => {
  /* 화면에 없는 틀로 잘라내면 엉뚱한 데가 잘린다 — 되돌릴 수 없다 */
  assert.ok(/function cropPref\(\) \{ return showFrame\(\); \}/.test(html), '자르기가 어긋납니다.');
  const shoot = html.match(/async function camShoot\([^)]*\)[\s\S]*?(?=\nfunction renderCamStrip)/);
  assert.ok(/if \(showFrame\(\)\)/.test(shoot[0]), '잘라 담기가 어긋납니다.');
});

test('★ 깜빡이지 않는다 — 나타날 때와 사라질 때 기준이 다르다', () => {
  const m = html.match(/function frameWatchTick\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'frameWatchTick 을 찾지 못했습니다.');
  assert.ok(/SEEN_ON/.test(m[0]) && /SEEN_OFF/.test(m[0]),
    '한 번 보였다 안 보였다에 바로 따라가면 손이 흔들릴 때마다 틀이 껌뻑입니다.');
  const on = Number((html.match(/SEEN_ON = (\d+)/) || [])[1]);
  const off = Number((html.match(/SEEN_OFF = (\d+)/) || [])[1]);
  assert.ok(off > on, '사라지는 쪽이 더 무뎌야 합니다 — 잠깐 못 찾았다고 틀이 사라지면 못 씁니다.');
});

test('카메라를 끄면 보던 것도 멈춘다', () => {
  const m = html.match(/function camStop\(\)[\s\S]*?\n\}/);
  assert.ok(/stopFrameWatch\(\)/.test(m[0]), '꺼진 카메라를 계속 보면 배터리를 먹습니다.');
});

test('점선일 때와 실선일 때 다른 말을 한다', () => {
  /* 할 일이 다르다 — 점선은 「맞추세요」, 실선은 「이 안만 담깁니다」. */
  const m = html.match(/function setCamTip\(\)[\s\S]*?\n\}/);
  assert.ok(/점선 안에 명함을 맞추세요/.test(m[0]),
    '아직 못 찾았는데 무엇을 하라는 건지 안 알려 줍니다.');
  assert.ok(/명함을 찾았습니다/.test(m[0]),
    '찾았다는 말이 없으면 언제 찍어야 할지 알 수 없습니다.');
});
