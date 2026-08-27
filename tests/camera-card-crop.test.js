/* 명함 테두리 찾아 반듯하게 자르기 (계획서 4단계)
   ══════════════════════════════════════════════
   ⚠ 계획서에 적은 대로 **실패해도 되는 기능**이다. 잘못 잘라 글자를 날리느니
      안 자르는 게 낫다. 그래서 이 검사는 「잘 자른다」보다
      **「아니다 싶으면 물러선다」**를 훨씬 많이 본다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

function boot() {
  const consts = html.match(/const EDGE_W = 160;[\s\S]*?const CARD_MAX_RATIO = [\d.]+;/);
  assert.ok(consts, '테두리 찾기 상수를 찾지 못했습니다.');
  const ctx = { Math, Array, Uint8Array, Infinity, console };
  vm.createContext(ctx);
  vm.runInContext(consts[0].replace(/^const /gm, 'var '), ctx);
  ['otsuThreshold', 'maskCorners', 'dist', 'cardRectFrom'].forEach(function (n) {
    const m = html.match(new RegExp('function ' + n + '\\([\\s\\S]*?\\n\\}'));
    assert.ok(m, n + ' 를 찾지 못했습니다.');
    vm.runInContext(m[0], ctx);
  });
  return ctx;
}

/* 가짜 장면 만들기 — 어두운 바닥(40) 위에 밝은 네모(220) */
function scene(w, h, rect) {
  const g = new Uint8Array(w * h).fill(40);
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (x >= 0 && x < w && y >= 0 && y < h) g[y * w + x] = 220;
    }
  }
  return g;
}

/* ── 찾는 경우 ── */
test('★ 바닥 위에 놓인 명함을 찾는다', () => {
  const c = boot();
  const w = 160, h = 120;
  const g = scene(w, h, { x: 20, y: 30, w: 108, h: 60 });   // 가로세로 1.8 = 명함
  const r = c.cardRectFrom(c.maskCorners(g, w, h, c.otsuThreshold(g)), w, h);
  assert.ok(r.ok, '못 찾았습니다: ' + r.why);
  assert.ok(Math.abs(r.cx - 73.5) < 3, '가운데가 어긋납니다: ' + r.cx);
  assert.ok(Math.abs(r.w - 107) < 4 && Math.abs(r.h - 59) < 4, '크기가 어긋납니다.');
  assert.ok(Math.abs(r.angle) < 0.05, '똑바로 놓인 것을 기울었다고 봅니다.');
});

test('★ 오츠 기준값이 바닥과 명함을 정확히 가른다', () => {
  /* 기준값 숫자 자체는 의미가 없다(같은 값이 여럿 최적일 수 있다).
     **그 값으로 걸렀을 때 명함만 남는가**가 지켜야 할 것이다. */
  const c = boot();
  const w = 160, h = 120;
  const g = scene(w, h, { x: 20, y: 30, w: 108, h: 60 });
  const th = c.otsuThreshold(g);
  const m = c.maskCorners(g, w, h, th);
  assert.equal(m.n, 108 * 60, '걸러 낸 넓이가 명함과 다릅니다 (기준값 ' + th + ')');
});

test('조명이 어두워도 스스로 기준을 잡는다', () => {
  /* 고정값(예: 128)을 쓰면 여기서 통째로 어긋난다 */
  const c = boot();
  const w = 160, h = 120;
  const g = new Uint8Array(w * h).fill(12);          // 아주 어두운 바닥
  for (let y = 30; y < 90; y++) for (let x = 20; x < 128; x++) g[y * w + x] = 70;  // 어둑한 명함
  const r = c.cardRectFrom(c.maskCorners(g, w, h, c.otsuThreshold(g)), w, h);
  assert.ok(r.ok, '어두운 곳에서 못 찾았습니다: ' + r.why);
});

/* ── 물러서는 경우 (이쪽이 훨씬 중요하다) ── */
test('★ 너무 작으면 물러선다', () => {
  const c = boot();
  const w = 160, h = 120;
  const g = scene(w, h, { x: 70, y: 55, w: 18, h: 10 });   // 화면의 1% 남짓
  const r = c.cardRectFrom(c.maskCorners(g, w, h, c.otsuThreshold(g)), w, h);
  assert.equal(r.ok, false, '작은 얼룩을 명함으로 보면 엉뚱한 곳을 자릅니다.');
});

test('★ 화면을 거의 다 덮으면 물러선다', () => {
  const c = boot();
  const w = 160, h = 120;
  const g = scene(w, h, { x: 0, y: 0, w: 160, h: 120 });
  const r = c.cardRectFrom(c.maskCorners(g, w, h, c.otsuThreshold(g)), w, h);
  assert.equal(r.ok, false, '못 찾은 것인데 「다 찾았다」로 보면 안 됩니다.');
});

test('★ 명함 모양이 아니면 물러선다 (정사각형·너무 길쭉함)', () => {
  const c = boot();
  const w = 160, h = 120;
  const sq = scene(w, h, { x: 40, y: 25, w: 70, h: 70 });        // 1.0
  assert.equal(c.cardRectFrom(c.maskCorners(sq, w, h, c.otsuThreshold(sq)), w, h).ok, false);
  const bar = scene(w, h, { x: 5, y: 50, w: 150, h: 22 });       // 6.8
  assert.equal(c.cardRectFrom(c.maskCorners(bar, w, h, c.otsuThreshold(bar)), w, h).ok, false);
});

test('★ 가운데가 빈 것은 명함이 아니다 (액자·책 테두리)', () => {
  /* ⚠ 이 그림은 **넓이·모양 검사는 통과**하도록 일부러 크게 잡았다.
     그래야 「속이 찼나」를 보는 검사만 따로 시험된다(다른 검사가 가려 주면
     그 줄을 지워도 안 잡힌다 — 실제로 처음에 그랬다). */
  const c = boot();
  const w = 160, h = 120;
  const g = new Uint8Array(w * h).fill(40);
  const x0 = 15, y0 = 24, x1 = 145, y1 = 96, t = 15;   // 130×72 테두리, 두께 15
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const edge = (x - x0 < t) || (x1 - x < t) || (y - y0 < t) || (y1 - y < t);
      if (edge) g[y * w + x] = 220;
    }
  }
  const m = c.maskCorners(g, w, h, c.otsuThreshold(g));
  assert.ok(m.n / (w * h) > 0.18, '이 그림은 넓이 검사를 통과해야 합니다.');
  const r = c.cardRectFrom(m, w, h);
  assert.equal(r.ok, false, '가운데가 빈 것을 명함으로 보면 엉뚱한 곳을 자릅니다: ' + JSON.stringify(r));
  assert.ok(/네모가 아닙니다/.test(r.why || ''), '「속이 안 찼다」로 물러서야 합니다: ' + r.why);
});

test('덩어리를 아예 못 찾으면 물러선다', () => {
  const c = boot();
  const r = c.cardRectFrom({ n: 0, tl: null, tr: null, br: null, bl: null }, 160, 120);
  assert.equal(r.ok, false);
  assert.ok(r.why, '왜 물러섰는지 남겨야 원인을 짚을 수 있습니다.');
});

/* ── 기울기 ── */
test('★ 비뚤게 놓인 명함의 기울기를 잰다', () => {
  const c = boot();
  const w = 160, h = 120;
  /* 15도쯤 기울인 네모를 직접 그린다 */
  const g = new Uint8Array(w * h).fill(40);
  const cx = 80, cy = 60, hw = 52, hh = 29, a = 15 * Math.PI / 180;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy;
      const u = dx * Math.cos(-a) - dy * Math.sin(-a);
      const v = dx * Math.sin(-a) + dy * Math.cos(-a);
      if (Math.abs(u) <= hw && Math.abs(v) <= hh) g[y * w + x] = 220;
    }
  }
  const r = c.cardRectFrom(c.maskCorners(g, w, h, c.otsuThreshold(g)), w, h);
  assert.ok(r.ok, '기울어진 명함을 못 찾았습니다: ' + r.why);
  const deg = r.angle * 180 / Math.PI;
  assert.ok(Math.abs(deg - 15) < 6, '기울기가 ' + deg.toFixed(1) + '도로 나옵니다(15도여야).');
});

/* ── 안전장치 (코드에 실제로 있는가) ── */
test('★ 못 찾으면 자르지 않는다', () => {
  const m = html.match(/const r = findCardRect\(c, cw, ch\);[\s\S]{0,420}/);
  assert.ok(m, '자르는 자리를 찾지 못했습니다.');
  assert.ok(/if \(r\.ok\)/.test(m[0]), '못 찾았는데 자르면 글자를 날립니다.');
});

test('★ 원본을 덮어쓰지 않는다', () => {
  const m = html.match(/let useBlob = blob, raw = null, cropped = false[\s\S]{0,900}/);
  assert.ok(m, '원본 보관 코드를 찾지 못했습니다.');
  assert.ok(/raw = blob/.test(m[0]), '자르기 전 원본을 들고 있어야 다시 시도할 수 있습니다.');
  assert.ok(/raw: raw, cropped: cropped/.test(html), '찍은 것에 원본이 함께 담겨야 합니다.');
});

test('★ 잘라낸 것이 터무니없이 작으면 원본을 쓴다', () => {
  const m = html.match(/let useBlob = blob, raw = null, cropped = false[\s\S]{0,900}/);
  assert.ok(/cb\.size > blob\.size \* 0\.15/.test(m[0]),
    '잘못 찾아 손톱만 하게 잘린 것을 그대로 쓰면 사진을 잃습니다.');
});

test('★ 자르다 실패해도 사진은 남는다', () => {
  const m = html.match(/if \(cropPref\(\)\) \{[\s\S]{0,900}?\n    \}/);
  assert.ok(m && /catch \(e\)/.test(m[0]), '자르기가 터지면 촬영 자체가 실패합니다.');
});

/* ⚠ 2026-08-08 다시 겨눔 — 대표 지시로 **기본 켜짐**이 됐다:
   "명함 사진 찍을 때는 가운데 명함만 정리해서 될 수 있게, 주변 불필요한 배경은
   필요가 없다." 켜 두어도 사진을 잃지 않는 근거는 아래 두 줄이다 —
   못 찾으면 안 자르고, 자른 뒤에도 원본을 함께 들고 간다. */
test('일반사진은 원본 구도를 유지하고 문서만 안전하게 자른다', () => {
  assert.match(html, /function cropPref\(\)[^\n]*showFrame\(\)/);
  assert.match(html, /function frameOn\(\)[^\n]*camCaptureMode === 'document'/);
  const shoot = html.match(/if \(cropPref\(\)\) \{[\s\S]{0,900}?\n    \}/);
  assert.ok(shoot && /if \(r\.ok\)/.test(shoot[0]));
  assert.ok(/raw = blob/.test(shoot[0]));
});

test('명함·서류 모드에서만 점선 틀을 켠다', () => {
  assert.match(html, /function frameOn\(\)[^\n]*camCaptureMode === 'document'/);
  assert.match(html, /id="camModePhoto"[^>]*setCamCaptureMode\('photo'\)/);
  assert.match(html, /id="camModeDocument"[^>]*setCamCaptureMode\('document'\)/);
});

test('★ 카메라 사진은 서류 화질로 담는다', () => {
  /* 대표님 화면에 「저장본 1200×1600」으로 찍혔다 — 사진 화질(1600px)로 담고
     있었다는 뜻이다. 이 카메라는 명함 스캐너이므로 서류 화질(2560px)이어야 한다. */
  const m = html.match(/async function camUpload\(\)[\s\S]*?\n\}/);
  assert.ok(/addFiles\(files, true,/.test(m[0]),
    '사진 화질(false)로 담으면 명함 글자가 흐려집니다.');
});

test('★ 기기가 낼 수 있는 가장 큰 사진을 달라고 한다', () => {
  assert.ok(/const photoOpts = camPhotoBest\(\)/.test(html) && /capture\.takePhoto\(photoOpts\)/.test(html),
    '안 적으면 기기가 미리보기 크기 그대로 주는 경우가 있습니다.');
  const m = html.match(/async function loadPhotoBest\(\)[\s\S]*?\n\}/);
  assert.ok(m && /getPhotoCapabilities/.test(m[0]) && /imageWidth: w\.max/.test(m[0]));
  assert.ok(/catch \(_\) \{[\s\S]*sessionToken !== camSessionToken[\s\S]*camPhotoOpts = null;/.test(m[0]),
    '못 물어보는 기기에서는 기기 기본값으로 찍어야 합니다 — 여기서 터지면 카메라가 안 열립니다.');
});

test('★ 명함이 작게 찍히면 더 가까이 찍으라고 알린다', () => {
  assert.ok(/const CARD_MIN_SHORT = 700;/.test(html));
  /* ⚠ 2026-08-27 — 경고를 cropped 에 매던 것이 «한 번도 안 뜬» 까닭이었다.
     담기는 그림의 짧은 변으로 판정하게 바꿨다. 모양이 아니라 «알리는가»를 본다. */
  const m = html.match(/Math\.min\(outW, outH\)[\s\S]{0,220}/);
  assert.ok(m && /가까이/.test(m[0]),
    '작게 찍힌 줄 모르고 넘어가면 판독이 흐린 이유를 알 수 없습니다.');
});

test('자르는 중임을 화면이 말한다', () => {
  const m = html.match(/function setCamTip\(\)[\s\S]*?\n\}/);
  assert.ok(/명함만 잘라 담습니다/.test(m[0]),
    '왜 사진이 잘렸는지 모르면 고장으로 봅니다.');
});

test('작게 줄여서 찾는다 (발열·속도)', () => {
  assert.ok(/const EDGE_W = 160;/.test(html));
  assert.ok(/willReadFrequently: true/.test(html));
});

test('★ 원근(사다리꼴)까지는 안 편다고 적어 두었다', () => {
  assert.ok(/원근\(사다리꼴\)까지는 안 편다/.test(html),
    '무엇을 안 하는지 적어 두지 않으면 다음 사람이 되는 줄 압니다.');
});
