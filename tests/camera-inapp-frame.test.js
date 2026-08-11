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

/* ── 꺽쇠는 찾았을 때만 뜬다 ──
   2026-08-11 다시 겨눔: 하루 전에는 「못 찾는 동안에도 점선을 띄운다」를 못 박고
   있었다. 그러면 회의사진·현장사진을 찍을 때도 늘 떠 있어 시야를 가린다
   (대표 지시 2026-08-11: "명함이나 종이 등이 나타날 때 꺽쇠 표시하고
   **평소에는 나오면 안 된다**"). 못 찾는 동안 무엇을 하라는 안내는 글줄이 맡는다. */
test('★ 꺽쇠는 명함·종이를 찾았을 때만 뜬다', () => {
  const m = html.match(/function applyFrameUI\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'applyFrameUI 를 찾지 못했습니다.');
  assert.ok(/display = show \? "block" : "none"/.test(m[0]),
    '틀을 켜 뒀다는 이유만으로 뜨면 평소에도 화면을 가립니다.');
  assert.ok(/const show = showFrame\(\);/.test(m[0]),
    '그리는 판단이 자르는 판단(showFrame)과 달라지면 엉뚱한 데가 잘립니다.');
});

test('★ 자르기는 여전히 명함·종이를 찾았을 때만이다', () => {
  assert.ok(/function showFrame\(\) \{ return frameOn\(\) && camCardSeen; \}/.test(html),
    '못 찾았는데 자르면 명함이 아닌 사진까지 네모로 잘려 나갑니다.');
});

test('꺽쇠는 네 모서리만 그리고 둘레를 덮지 않는다', () => {
  /* 잡히는 순간에만 뜨는 표시라, 뜰 때마다 화면이 컴컴해지면 눈이 놀란다 */
  const base = html.match(/#camFrame\{[^}]*\}/);
  assert.ok(base, '#camFrame 규칙이 없습니다.');
  assert.ok(!/box-shadow/.test(base[0]), '둘레를 덮으면 시야를 가립니다.');
  assert.ok(!/border:2px/.test(base[0]), '네모 테두리가 남아 있습니다 — 꺽쇠로 바꿨습니다.');
  ['tl', 'tr', 'bl', 'br'].forEach(function (k) {
    assert.ok(new RegExp('#camFrame i\\.' + k + '\\{').test(html), k + ' 모서리가 없습니다.');
  });
  assert.match(html, /id="camFrame"[^>]*><i class="tl">/,
    '모서리 조각이 마크업에 없으면 CSS 가 그릴 것이 없습니다.');
});

/* ── 꺽쇠가 **찾은 것을 감싼다** ──
   붙박이 틀은 명함 비율(1.6:1)인데 A4 는 1.41:1 이다. 자르기가 이 틀 자리를
   그대로 쓰므로(camShoot), 자리를 안 맞추면 종이 위아래가 통째로 날아간다. */
test('★ 꺽쇠를 찾은 네모에 맞춘다 — 안 맞추면 종이가 잘려 나간다', () => {
  const fn = html.match(/function fitFrameToRect\(\)[\s\S]*?\n\}/);
  assert.ok(fn, 'fitFrameToRect 를 찾지 못했습니다.');
  assert.ok(/camSeenRect/.test(fn[0]), '찾은 자리를 안 씁니다.');
  assert.ok(/Math\.max\(e\.width \/ v\.videoWidth, e\.height \/ v\.videoHeight\)/.test(fn[0]),
    '미리보기는 object-fit:cover 라 화면 자리와 원본 화소 자리가 다릅니다 — 같은 계산을 써야 합니다.');
  /* ⚠ 이름만 보면 FRAME_PAD = 1.00 으로 두어도 통과한다 — 값이 실제로
     1 보다 커야 넉넉히 잡는 것이다. */
  assert.ok(/FRAME_PAD/.test(fn[0]), '넉넉히 잡는 값을 안 씁니다.');
  const pad = Number((html.match(/const FRAME_PAD = ([\d.]+);/) || [])[1]);
  assert.ok(pad > 1, 'FRAME_PAD 가 ' + pad + ' 입니다 — 딱 맞게 자르면 테두리 가까운 글자가 깎입니다.');
  const watch = html.match(/function frameWatchTick\(\)[\s\S]*?\n\}/);
  assert.ok(/if \(want && ok\) fitFrameToRect\(\)/.test(watch[0]),
    '켜져 있는 동안 자리를 안 따라가면 종이를 움직일 때 꺽쇠가 뒤처집니다.');
  assert.ok(/#camFrame\.fit\{[^}]*transform:none/.test(html),
    '가운데 고정(transform)을 안 풀면 잡은 자리에서 위로 반 칸 밀립니다.');
});

test('종이도 잡힌다 — A4·레터 비율이 받는 범위 안에 있다', () => {
  /* 명함 1.8 · A4 1.41 · 레터 1.29 — 셋 다 들어와야 「종이 등」이 잡힌다 */
  const lo = Number((html.match(/CARD_MIN_RATIO = ([\d.]+)/) || [])[1]);
  const hi = Number((html.match(/CARD_MAX_RATIO = ([\d.]+)/) || [])[1]);
  assert.ok(lo && hi, '가로세로비 기준을 찾지 못했습니다.');
  [1.8, 1.414, 1.294].forEach(function (r) {
    assert.ok(r >= lo && r <= hi, '가로세로비 ' + r + ' 가 범위 밖입니다 — 그 종이는 안 잡힙니다.');
  });
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

test('★ 못 찾는 동안에는 글줄이 안내를 맡는다', () => {
  /* 2026-08-11 다시 겨눔 — 꺽쇠는 찾았을 때만 뜬다. 그러면 못 찾는 동안 화면에
     아무 표시가 없으므로, 무엇을 하라는 말이 **글줄에는 반드시** 있어야 한다. */
  const m = html.match(/function setCamTip\(\)[\s\S]*?\n\}/);
  assert.ok(/꺽쇠가 나타납니다/.test(m[0]),
    '아직 못 찾았는데 무엇을 하라는 건지 안 알려 줍니다 — 꺽쇠도 없어 화면이 텅 빕니다.');
  assert.ok(/찾았습니다/.test(m[0]),
    '찾았다는 말이 없으면 언제 찍어야 할지 알 수 없습니다.');
});
