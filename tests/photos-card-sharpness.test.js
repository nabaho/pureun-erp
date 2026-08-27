/* 명함 글자 선명도 (대표 물음 2026-08-27: 「직접 찍는데 계속 안 좋다」)

   ── 재어 본 것 ──
   사진첩 595장 가운데 «우리 카메라로 찍힌 표시»가 있는 것은 **2장**뿐이었고,
   명함으로 읽힌 43장 중 **35장이 짧은 변 700px 미만**(대부분 100~250dpi)이었다.
   명함은 90×50mm — 짧은 변 700px 이 약 355dpi 로 잔글씨가 읽히는 문턱이다.

   ── 찾아낸 것 셋 ──
   ① 「조금 더 가까이」 경고가 **한 번도 뜬 적이 없다.** `cropped` 일 때만 봤는데,
      꺽쇠로 먼저 잘라 놓으면 뒤이은 테두리 찾기가 「화면 전체 = 못 찾음」으로 물려
      cropped 가 늘 false 였다(운영 데이터 43장 중 0장).
   ② 찍은 그림이 **두 번 구워졌다**(자를 때 0.92 · 담을 때 0.92). 획 가장자리에
      링잉이 겹쳐 잔글씨가 뭉갠다.
   ③ 사진이 **어디서 들어왔는지 아무 자취가 없었다.** 그래서 「앱이 줄인 것인지
      원본이 작았던 것인지」를 사흘 동안 가릴 수 없었다. */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* ── ① 「조금 더 가까이」 ── */

test('★ 경고를 «어떻게 잘렸는지»에 매지 않는다 — 그것이 한 번도 안 뜬 까닭이다', () => {
  const fn = cutFn(APP, 'async function camShoot(');
  const at = fn.indexOf('CARD_MIN_SHORT');
  assert.ok(at > 0, '★ 명함 크기 경고가 없어졌습니다');
  const line = fn.slice(fn.lastIndexOf('if', at), at + 40);
  assert.ok(line.indexOf('cropped') < 0,
    '★ 아직 cropped 일 때만 봅니다 — 꺽쇠로 자르면 그 뒤 테두리 찾기가 늘 실패해\n' +
    '  이 경고는 영영 안 뜹니다(운영 데이터 명함 43장 중 cropped 0장): ' + line.replace(/\s+/g, ' '));
});

test('★ 담기는 그림의 «짧은 변»으로 판정한다', () => {
  const fn = cutFn(APP, 'async function camShoot(');
  assert.match(fn, /Math\.min\(outW, outH\)/, '담기는 크기를 안 봅니다');
  assert.match(fn, /outW = cut\.width; outH = cut\.height;/,
    '테두리로 잘렸을 때 그 크기를 안 따라갑니다 — 옛 크기로 판정하게 됩니다');
  assert.match(fn, /let outW = cw, outH = ch;/,
    '안 잘렸을 때(꺽쇠만) 크기가 없습니다');
});

test('★ 명함 모드일 때만 본다 — 회의사진에 「더 가까이」는 헛말이다', () => {
  const fn = cutFn(APP, 'async function camShoot(');
  const at = fn.indexOf('Math.min(outW, outH)');
  const before = fn.slice(Math.max(0, at - 300), at);
  assert.match(before, /if \(frameOn\(\)\)/, '★ 갈래를 안 가리고 경고합니다');
});

test('문턱은 명함 90×50mm 를 읽을 수 있는 크기다', () => {
  const m = APP.match(/const CARD_MIN_SHORT = (\d+);/);
  assert.ok(m, '문턱이 없습니다');
  const px = Number(m[1]);
  const dpi = px / (50 / 25.4);
  assert.ok(dpi >= 300, '짧은 변 ' + px + 'px = ' + Math.round(dpi) + 'dpi — 잔글씨가 안 읽힙니다');
});

/* ── ② 두 번 굽지 않는다 ── */

test('★ 중간 그림은 «거의 손실 없이» 굽는다 — 두 번 구우면 획이 뭉갠다', () => {
  const m = APP.match(/const CAM_MID_Q = ([\d.]+);/);
  assert.ok(m, '★ 중간 굽기 품질이 따로 없습니다 — 담을 때와 같은 값으로 두 번 굽습니다');
  const mid = Number(m[1]);
  assert.ok(mid >= 0.96, '중간 굽기가 ' + mid + ' 입니다 — 담을 때와 겹쳐 링잉이 남습니다');
  assert.ok(mid < 1, '★ 무손실(1.0)은 폰에서 중간 파일이 몇십 MB 가 되어 메모리가 튑니다');
});

test('★ 굽는 자리마다 그 값을 쓴다 — 한 곳만 고치면 그 길만 좋아진다', () => {
  const bakes = APP.match(/toBlob\(res, 'image\/jpeg', ([^)]+)\)/g) || [];
  assert.ok(bakes.length >= 3, '굽는 자리를 ' + bakes.length + '군데만 찾았습니다');
  const old = bakes.filter(function (b) { return /0\.9\d/.test(b); });
  assert.deepEqual(old, [],
    '★ 아직 옛 값으로 굽는 자리가 있습니다: ' + old.join(' / '));
});

test('담을 때의 품질은 저장 층이 정한다 — 화면이 따로 정하지 않는다', () => {
  const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
  assert.match(store, /function uploadSpec/, '저장 층에 크기 기준이 없습니다');
  assert.match(APP, /PuPhotoStore\.uploadSpec\(/, '화면이 저장 층 기준을 안 씁니다');
});

/* ── ③ 어디서·얼마로 들어왔나 ── */

function loadCameFrom() {
  const ctx = { Number, String, Math, esc: function (s) { return String(s); } };
  vm.createContext(ctx);
  vm.runInContext(APP.match(/const VIA_LABEL = \{[\s\S]*?\};/)[0] + '\n' +
                  cutFn(APP, 'function cameFromLine('), ctx);
  return ctx.cameFromLine;
}

test('★ 어디서 왔는지·원본이 얼마였는지 적는다', () => {
  const f = loadCameFrom();
  const s = f({ via: 'file', srcW: 360, srcH: 200, w: 360, h: 200 });
  assert.match(s, /파일에서 고름/, '어디서 왔는지를 안 적습니다');
  assert.match(s, /360×200/, '원본 크기를 안 적습니다');
  assert.match(s, /앱이 줄인 것이 아닙니다/,
    '★ 이 한 줄이 「직접 찍는데 왜 흐린가」를 끝냅니다 — 작게 들어온 것을 말해야 합니다');
});

test('★ 앱이 줄인 것이면 «줄였다고 우기지» 않는다', () => {
  const f = loadCameFrom();
  const s = f({ via: 'cam', srcW: 4032, srcH: 3024, w: 2000, h: 1500 });
  assert.match(s, /푸른사진첩 카메라로 찍음/);
  assert.match(s, /4032×3024/);
  assert.ok(s.indexOf('앱이 줄인 것이 아닙니다') < 0,
    '★ 실제로 앱이 줄였는데 「안 줄였다」고 적습니다');
});

test('옛 사진에는 아무 말도 안 한다 — 모르는 것을 지어내지 않는다', () => {
  const f = loadCameFrom();
  assert.equal(f({ w: 360, h: 200 }), '');
  assert.equal(f(null), '');
});

test('★ 들어오는 길마다 이름표를 단다 — 하나라도 빠지면 그 길만 모른다', () => {
  /* 공유·파일·붙여넣기·끌어놓기·카메라·포털카메라 — 여섯 갈래가 다 있어야 한다. */
  /* ⚠ 주석에 적힌 「addFiles(새 항목을 만드는 길)」 같은 «말»을 세지 않는다 —
     처음에 그것까지 세어 헛울렸다. 실제로 부르는 곳은 둘째 인자가 true/false 다. */
  const calls = APP.match(/addFiles\([^;\n]*?,\s*(?:true|false)[^;\n]*?\)/g) || [];
  const real = calls.filter(function (c) { return c.indexOf('fileList') < 0; });
  assert.ok(real.length >= 6, '올리는 길을 ' + real.length + '군데만 찾았습니다');
  const noVia = real.filter(function (c) { return c.indexOf('via:') < 0; });
  assert.deepEqual(noVia, [],
    '★ 어디서 온 것인지 안 적는 길이 남았습니다:\n' + noVia.join('\n'));
  /* 이름표마다 사람이 읽을 말이 있어야 한다 */
  const labels = APP.match(/const VIA_LABEL = \{[\s\S]*?\};/)[0];
  ['cam', 'portalcam', 'file', 'share', 'paste', 'drop'].forEach(function (k) {
    assert.ok(labels.indexOf(k + ':') > 0, k + ' 에 사람이 읽을 말이 없습니다');
  });
});

test('★ 담을 때 그 자취를 실제로 적는다', () => {
  const fn = cutFn(APP, 'async function addFiles(');
  assert.match(fn, /via: \(opts && opts\.via\)/, '★ 들어온 길을 안 남깁니다');
  assert.match(fn, /srcW: full\.srcW/, '★ 원본 크기를 안 남깁니다');
  assert.match(APP, /srcW: iw, srcH: ih/, '줄이는 곳이 원본 크기를 안 돌려줍니다');
});

test('★ 「작습니다」 안내가 그 자취를 보여 준다', () => {
  const fn = cutFn(APP, 'function smallBox(');
  assert.match(fn, /cameFromLine\(m\)/,
    '★ 적어 놓고 안 보여 주면 적은 뜻이 없습니다');
  assert.match(APP, /\.smallwarn \.camefrom\{/, '꾸밈이 없습니다');
});
