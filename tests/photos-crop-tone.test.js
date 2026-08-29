/* ✂️ 자르기 · ☀️ 밝기·대비 — 요금 0원 (대표 지시 2026-08-29 「네」)
   검토 문서: docs/사진편집-라이브러리-검토.md

   ■ 왜 이 둘인가
   지금 편집(칠해서 AI로 고치기)은 **한 번마다 요금**이 든다. 그런데 자주 필요한 것은
   자르기·밝기인데, 그건 **이 기기 안에서 끝나 0원**이다. 그래서 먼저 만들었다.

   ■ 이 검사가 지키는 것 넷
     ① **요금이 드는 것은 하나뿐**이라는 사실이 화면에 늘 보인다
     ② 자르개(cropperjs)는 **우리 사본을 먼저** 쓴다 — 관공서 방화벽이 cdnjs 를 막는다
     ③ ★ **라이브러리에 딸린 「저장」을 안 쓴다** — 결과만 받아 우리 저장 층으로 담는다.
        그걸 어기면 원본 보존·어디서 나왔는지·무엇을 했는지가 통째로 빠진다(검토 문서 ③)
     ④ 도구를 바꾸면 **앞 도구의 자취를 지운다** — 칠해 놓고 자르면 그 칠이 엉뚱한 데 얹힌다 */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* ── ① 요금이 드는 것은 하나뿐 ── */

test('★★ 도구 셋 가운데 «요금이 드는 것은 하나»라고 화면이 말한다', () => {
  const ctx = {};
  vm.createContext(ctx);
  /* ⚠ const 로 선언한 값은 칸(context) 밖으로 안 나온다 — 돌린 «결과»로 받는다.
     처음에 ctx.ED_MODES 로 읽다가 undefined 를 봤다. */
  const modes = vm.runInContext(APP.match(/const ED_MODES = \[[\s\S]*?\];/)[0] + '\nED_MODES;', ctx);
  /* ⚠ 도구는 늘어난다(2026-08-29 에 셋 → 넷). **수를 못 박지 않는다** —
     지켜야 하는 것은 「요금 드는 것이 하나뿐」이다. */
  assert.ok(modes.length >= 3, '★ 도구가 ' + modes.length + '개뿐입니다');
  const pay = modes.filter(function (m) { return m.pay; });
  assert.equal(pay.length, 1, '★★ 요금이 드는 갈래가 ' + pay.length + '개입니다');
  assert.equal(pay[0].k, 'ai', '★★ 요금이 드는 것은 AI 로 고치기 하나뿐이어야 합니다');
  /* 화면에 그 표가 실제로 나가야 한다 */
  const fn = cutFn(APP, 'function edPanelHtml(');
  assert.match(fn, /class="pay' \+ \(m\.pay \? ' y' : ''\) \+ '">' \+ \(m\.pay \? '요금' : '0원'\)/,
    '★★ 어느 것이 요금인지 화면에 안 적습니다 — 헛돈이 나갑니다');
  assert.match(fn, /요금이 들지 않습니다/, '★ 0원인 도구에서 그 사실을 안 말합니다');
});

test('★ 요금 얘기는 «요금이 든 때»에만 한다 — 0원인데 그 말을 하면 헷갈린다', () => {
  const fn = cutFn(APP, 'function edPanelHtml(');
  assert.match(fn, /e\.done\.how === 'ai'\s*\r?\n?\s*\? '<br>요금은 <b>이미 들었습니다/,
    '★ 자르기·밝기 뒤에도 「요금은 이미 들었습니다」가 뜹니다');
  assert.match(fn, /요금이 들지 않았습니다<\/b> — 버려도 그만입니다/);
});

/* ── ② 우리 사본을 먼저 ── */

test('★★ 자르개는 «우리 사본»을 먼저 쓴다 — 관공서 방화벽이 cdnjs 를 막는다', () => {
  assert.match(APP, /const CROP_LIB_HERE = 'vendor\/cropper\.min\.js';/);
  assert.match(APP, /const CROP_CSS_HERE = 'vendor\/cropper\.min\.css';/);
  const fn = cutFn(APP, 'async function loadCropLib(');
  assert.ok(fn.indexOf('CROP_LIB_HERE') < fn.indexOf('CROP_LIB_CDN'),
    '★★ 바깥(cdnjs)을 먼저 봅니다 — 막히면 자르기가 통째로 멎습니다');
  assert.match(fn, /CROP_LIB_CDN/, '★ 물러설 곳이 없으면 우리 사본이 깨졌을 때 끝입니다');
  assert.match(fn, /if \(window\.Cropper\) return window\.Cropper;/,
    '★ 이미 받아 놓고 또 받습니다');
  /* 사본이 저장소에 실제로 있어야 한다 */
  const js = path.join(R, 'vendor', 'cropper.min.js');
  assert.ok(fs.existsSync(js), '★★ vendor/cropper.min.js 가 없습니다 — 우리 사본 길이 헛말입니다');
  assert.ok(fs.existsSync(path.join(R, 'vendor', 'cropper.min.css')), '★ 꾸밈 사본이 없습니다');
  const kb = fs.statSync(js).size / 1024;
  assert.ok(kb < 80, '★ 자르개가 ' + Math.round(kb) + 'KB 입니다 — 통짜 편집기를 넣은 것 아닙니까');
  /* 허가 표시가 파일 안에 남아 있어야 한다 */
  assert.match(fs.readFileSync(js, 'utf8').slice(0, 400), /MIT license/,
    '★ 남의 코드에서 허가 표시를 지우면 안 됩니다');
});

test('★ «쓸 때만» 받는다 — 사진첩은 처음 열 때 이미 무겁다', () => {
  /* 머리말(<head>)에 박아 두면 안 쓰는 사람도 매번 받는다 */
  const head = APP.slice(0, APP.indexOf('</head>'));
  assert.ok(head.indexOf('cropper') < 0,
    '★ 자르개를 머리말에 박아 두었습니다 — 안 쓰는 사람도 매번 받습니다');
  assert.match(cutFn(APP, 'async function edCropStart('), /await loadCropLib\(\)/,
    '★ 자르기로 들어갈 때 받아야 합니다');
});

/* ── ③ 라이브러리의 「저장」을 안 쓴다 ── */

test('★★ 자르개에 딸린 «저장»을 안 쓴다 — 우리 저장 층으로만 담는다', () => {
  const fn = cutFn(APP, 'function edCropApply(');
  /* 결과만 받아 «고친 결과»(done)로 넘긴다 — 담는 것은 edKeep 하나뿐이다 */
  assert.match(fn, /getCroppedCanvas\(/, '★ 결과를 안 받아 옵니다');
  assert.match(fn, /photoEd\.done = \{/, '★★ 결과를 우리 걸음으로 안 넘깁니다');
  ['savePhoto', 'replaceImage', 'download', 'toBlob'].forEach(function (w) {
    assert.ok(fn.indexOf(w) < 0,
      '★★ 자르기가 «제멋대로» 담습니다(' + w + ') — 원본 보존·손댐 기록이 통째로 빠집니다');
  });
  /* 담는 길은 하나뿐이다 */
  const keep = cutFn(APP, 'async function edKeep(');
  assert.match(keep, /PuPhotoStore\.savePhoto\(/);
  assert.match(keep, /editedFrom: photoEd\.id/);
});

test('★★ 자르기·밝기도 «무엇을 했는지» 기록에 남는다', () => {
  const keep = cutFn(APP, 'async function edKeep(');
  assert.match(keep, /how: photoEd\.done\.how \|\| 'ai'/,
    '★★ 무엇으로 고쳤는지(자르기·밝기·AI)를 안 가립니다 — 셋 다 「ai」로 적힙니다');
  assert.match(cutFn(APP, 'function edCropApply('), /how: 'crop'/);
  assert.match(cutFn(APP, 'async function edToneApply('), /how: 'tone'/);
  /* 무엇을 했는지 말로도 남는다 */
  assert.match(cutFn(APP, 'function edCropApply('), /want: '잘라내기 ' \+/);
  assert.match(cutFn(APP, 'async function edToneApply('), /want: '밝기 ' \+ photoEd\.bri/);
});

/* ── 밝기·대비 ── */

function tone(over) {
  const el = {};
  const ctx = Object.assign({
    photoEd: { status: 'ready', id: 'p1', url: 'ORIG', mode: 'tone',
      strokes: [], brush: 1, erasing: false, done: null, bri: 100, con: 100 },
    $: function (id) { return el[id] || (el[id] = { style: {}, textContent: '' }); },
    Math: Math, Number: Number, String: String
  }, over || {});
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(cutFn(APP, 'function edFilterCss(') + '\n' + cutFn(APP, 'function setEdTone('), ctx);
  ctx._el = el;
  return ctx;
}

test('★★ 화면에 보이는 것과 담기는 것이 «같은 글»이다 — 한 곳에서 만든다', () => {
  const c = tone();
  c.setEdTone('bri', 130);
  c.setEdTone('con', 120);
  assert.equal(c.edFilterCss(), 'brightness(130%) contrast(120%)');
  assert.equal(c._el.edImg.style.filter, 'brightness(130%) contrast(120%)',
    '★★ 큰 사진에 바로 안 비칩니다');
  /* 담을 때도 같은 함수를 쓴다 — 두 벌이면 본 것과 담긴 것이 달라진다 */
  assert.match(cutFn(APP, 'async function edToneApply('), /const css = edFilterCss\(\);/,
    '★★ 담을 때 딴 글을 씁니다 — 본 것과 담긴 것이 달라집니다');
  assert.match(cutFn(APP, 'function renderViewerEdit('), /edFilterCss\(\)/,
    '★★ 미리보기가 딴 글을 씁니다');
});

test('★ 아무것도 안 바꿨으면 담지 않는다 — 원본을 헛되이 다시 굽는다', () => {
  const c = tone();
  assert.equal(c.edFilterCss(), '', '★ 100%인데도 손댄 것으로 봅니다');
  assert.match(cutFn(APP, 'async function edToneApply('), /if \(!css\) \{[\s\S]{0,120}return; \}/,
    '★ 안 바꿨는데도 새 사진을 만듭니다');
});

test('★ 너무 멀리 못 간다 — 50~150% 안에서만', () => {
  const c = tone();
  c.setEdTone('bri', 999);
  assert.equal(c.photoEd.bri, 150);
  c.setEdTone('bri', -50);
  assert.equal(c.photoEd.bri, 50);
  c.setEdTone('bri', 'ㄱ');
  assert.equal(c.photoEd.bri, 100, '★ 글자가 들어오면 100 으로 돌아가야 합니다');
});

test('★★ filter 를 못 쓰는 브라우저에서 «조용히 그냥 담지» 않는다', () => {
  /* 사람은 밝아진 줄 아는데 원본 그대로가 담긴다 — 가림 층에서 이미 겪은 병이다. */
  const fn = cutFn(APP, 'async function edToneApply(');
  assert.match(fn, /if \(String\(g\.filter\)\.indexOf\('brightness'\) < 0\)/,
    '★★ 이 브라우저가 filter 를 받아 주는지 안 봅니다');
  assert.match(fn, /지원하지 않습니다/);
  assert.ok(fn.indexOf('photoEd.done') > fn.indexOf('g.drawImage'),
    '★ 그리기 전에 결과로 넘깁니다');
});

/* ── ④ 도구를 바꾸면 앞 자취를 지운다 ── */

test('★★ 도구를 바꾸면 «앞 도구의 자취»를 지운다 — 안 지우면 엉뚱한 데가 고쳐진다', () => {
  const fn = cutFn(APP, 'function setEdMode(');
  assert.match(fn, /photoEd\.strokes = \[\];/,
    '★★ 칠해 놓고 자르기로 갔다 오면 그 칠이 «잘린 사진»에 얹혀 엉뚱한 자리를 가리킵니다');
  assert.match(fn, /photoEd\.bri = 100;/);
  assert.match(fn, /photoEd\.con = 100;/);
  assert.match(fn, /edCropStop\(\);/, '★★ 자르개를 안 걷으면 화면에 남습니다');
  assert.match(fn, /if \(!photoEd \|\| photoEd\.mode === m\) return;/, '★ 같은 것을 또 누르면 지웁니다');
});

test('★★ 편집기를 닫으면 자르개도 걷는다 — 안 걷으면 다음 사진에 남는다', () => {
  assert.match(cutFn(APP, 'function photoEdCancel('), /edCropStop\(\)/);
  assert.match(cutFn(APP, 'function renderViewerEdit('), /if \(mode !== 'crop'\) edCropStop\(\);/,
    '★★ 다른 도구로 갔는데 자르개가 남습니다');
  assert.match(cutFn(APP, 'function edCropStop('), /try \{ edCropper\.destroy\(\); \} catch/,
    '★ 걷다가 터지면 편집기가 통째로 멎습니다');
});

test('★★ 결과를 보고 계실 때는 도구를 안 얹는다 — 무엇이 고쳐졌는지 보시는 자리다', () => {
  const fn = cutFn(APP, 'function renderViewerEdit(');
  assert.match(fn, /const mode = photoEd\.done \? 'done' : photoEd\.mode;/,
    '★★ 결과 위에 자르개·붓이 얹힙니다');
});
