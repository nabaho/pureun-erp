/* 팩스·스캐너가 보내는 TIF 열기 (대표 지시 2026-08-29)

   "노무계약서.tif 못읽는데 이런것도 개선안되나 해결할 수 없나?"

   ■ 무엇이 문제였나
   브라우저는 tif 를 **아예 못 연다**(크롬·사파리 둘 다). 그런데 팩스로 오는
   근로계약서·노동청 서류가 바로 이 형식이다. 게다가 화면이 내놓던 안내가
   「아이폰 → 설정 → 카메라 → 높은 호환성」이었다 — 그건 아이폰 사진(HEIC)
   이야기라 **팩스 파일에는 아무 소용이 없다.** 시킨 대로 해 보고 또 막힌다.
   ⚠ **엉뚱한 안내는 안내가 없는 것보다 나쁘다.**

   ■ 이 검사가 지키는 것 넷
     ① tif 를 이 기기 안에서 풀어 담는다 — 요금 0원, 밖으로 안 나간다
     ② **쪽으로 펼친다** — 팩스는 한 파일에 여러 쪽이 흔하다. PDF 와 «같은 모양»으로
        돌려주어 「한 문서로 / 쪽마다 따로」 묻는 길을 그대로 탄다
     ③ 도구는 **우리 사본 먼저**, 바깥은 물러설 곳, 그리고 **쓸 때만** 받는다
     ④ 못 열 때는 **그 파일에 맞는** 까닭을 말한다

   실제 팩스 파일로 브라우저에서 확인: 1656×2271 한 쪽 · 807ms · <img> 로 열린다.
   손수 만든 3쪽짜리로도 확인: 60×40 / 50×70 / 30×30 으로 갈린다. */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
/* 주석에 적어 둔 말이 검사를 통과시키면 안 된다 */
const CODE = APP.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

function load(names, over) {
  const ctx = Object.assign({ console: { warn: function () {} }, window: {},
    Math: Math, String: String, Number: Number, Promise: Promise, Error: Error }, over || {});
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  names.forEach(function (n) { vm.runInContext(cutFn(APP, n), ctx); });
  return ctx;
}

/* ── ① tif 를 알아본다 ── */

test('★★ tif 를 «이름으로도» 알아본다 — 폰·팩스 프로그램은 형식 칸을 자주 비운다', () => {
  const c = load(['function isTif(']);
  /* 실제 대표 파일이 type="" 로 왔다 — 형식 칸만 보면 못 알아본다 */
  assert.equal(c.isTif({ name: '노무계약서.tif', type: '' }), true,
    '★★ 형식 칸이 빈 팩스 파일을 못 알아봅니다');
  assert.equal(c.isTif({ name: 'x.TIFF', type: '' }), true, '★ 대문자·tiff 를 놓칩니다');
  assert.equal(c.isTif({ name: '이름없음', type: 'image/tiff' }), true, '★ 형식으로도 봐야 합니다');
  assert.equal(c.isTif({ name: 'a.jpg', type: 'image/jpeg' }), false, '★★ 사진까지 tif 로 봅니다');
  assert.equal(c.isTif({ name: 'a.pdf', type: 'application/pdf' }), false, '★★ PDF 를 가로챕니다');
  assert.equal(c.isTif(null), false);
});

test('★★ 올리는 길에서 tif 를 «쪽으로 펼친다» — 안 그러면 예전처럼 그대로 막힌다', () => {
  const fn = cutFn(APP, 'async function addFiles(');
  assert.match(fn, /if \(isTif\(f\)\) \{/, '★★ 올리는 길이 tif 를 안 봅니다');
  assert.match(fn, /pdf: await tifToPages\(f\)/,
    '★★ 펼친 쪽을 PDF 와 «같은 자리»에 안 넣습니다 — 묻고 담는 길을 새로 만들게 됩니다');
  /* PDF 보다 먼저 가려야 한다 — 나중이면 isPdf 가 아니라며 그냥 사진으로 넘어간다 */
  assert.ok(fn.indexOf('isTif(f)') < fn.indexOf('if (!isPdf(f))'),
    '★★ tif 를 PDF 뒤에서 가립니다 — 그 전에 그냥 사진으로 넘어가 버립니다');
  /* 못 열면 «안 담겼다»고 말한다 — 조용히 넘어가면 올라간 줄 아신다 */
  const at = fn.indexOf('[TIF 읽기]');
  assert.ok(at > 0, '★ 못 연 것을 기록에 안 남깁니다');
  assert.match(fn.slice(at, at + 400), /아직 담기지 않았습니다/,
    '★★ 못 담았다는 말을 안 합니다 — 증빙이 조용히 빕니다');
});

test('★★ 돌려주는 모양이 PDF 와 «같다» — 다르면 아래 길이 통째로 갈라진다', () => {
  const fn = cutFn(APP, 'async function tifToPages(');
  assert.match(fn, /pages\.push\(\{ blob: blob, page: i \+ 1, text: '' \}\)/,
    '★★ 쪽 모양이 PDF 와 다릅니다');
  assert.match(fn, /return \{ pages: pages, total: total, taken: pages\.length \}/,
    '★★ 「모두 몇 쪽·담은 것 몇 쪽」을 안 돌려줍니다 — 잘린 것을 말해 줄 수가 없습니다');
  /* 한 문서 쪽 상한을 PDF 와 같이 지킨다 */
  assert.match(fn, /Math\.min\(total, PDF_MAX_PAGES\)/, '★★ 쪽 상한이 없습니다');
  /* 빈 쪽에 걸려 통째로 멎지 않는다 */
  assert.match(fn, /if \(!w \|\| !h \|\| !rgba \|\| !rgba\.length\) continue;/,
    '★ 쪽 하나가 비면 나머지까지 잃습니다');
  assert.match(fn, /if \(!pages\.length\) throw/,
    '★ 한 쪽도 못 얻었는데 「담았다」고 넘어갑니다');
  /* ⚠ 팩스 원고는 한 쪽이 1600×2300 이다 — 안 놓아주면 쪽수만큼 쌓인다 */
  assert.match(fn, /cv\.width = cv\.height = 0/,
    '★★ 큰 판을 안 놓아줍니다 — 20쪽짜리에서 브라우저가 멎습니다');
});

test('★ 이름에서 확장자를 뗀다 — 안 떼면 「노무계약서.tif (1/2쪽)」이 된다', () => {
  const fn = cutFn(APP, 'async function addFiles(');
  const hits = fn.match(/replace\(\/\\\.\(pdf\|tiff\?\)\$\/i, ''\)/g) || [];
  assert.ok(hits.length >= 2,
    '★ 확장자를 떼는 자리가 ' + hits.length + '군데뿐입니다 — 묻는 창과 담는 자리 둘 다여야 합니다');
});

/* ── ② 도구를 어떻게 들이는가 ── */

test('★★ 우리 사본을 «먼저» 쓰고, 바깥은 물러설 곳이다', () => {
  assert.match(CODE, /const TIF_LIB_HERE = 'vendor\/utif\.js'/, '★★ 우리 사본을 안 씁니다');
  assert.ok(fs.existsSync(path.join(R, 'vendor', 'utif.js')),
    '★★ vendor/utif.js 가 없습니다 — 방화벽 안에서는 tif 가 통째로 안 열립니다');
  const fn = cutFn(APP, 'async function loadTifLib(');
  assert.ok(fn.indexOf('TIF_LIB_HERE') < fn.indexOf('TIF_LIB_CDN'),
    '★★ 바깥을 먼저 봅니다 — 관공서 방화벽이 그 주소를 흔히 막습니다');
  /* 남의 코드를 담았으면 허가문을 남긴다 */
  const lic = path.join(R, 'vendor', 'utif-LICENSE');
  assert.ok(fs.existsSync(lic), '★★ 허가문이 없습니다 — 남의 코드를 담으면서 이것을 빠뜨리면 안 됩니다');
  assert.match(fs.readFileSync(lic, 'utf8'), /MIT License/);
});

test('★★ pako 를 «먼저» 올린다 — UTIF 는 실릴 때 한 번 집어 두고 뒤는 안 본다', () => {
  const fn = cutFn(APP, 'async function loadTifLib(');
  assert.ok(fn.indexOf('TIF_ZIP_HERE') < fn.indexOf('TIF_LIB_HERE'),
    '★★ 압축 도구를 나중에 올립니다 — zip 으로 눌린 tif 에서 그대로 멎습니다');
  /* 압축 도구를 못 받아도 나머지는 열려야 한다 — 팩스 원고는 대개 zip 이 아니다 */
  assert.match(fn, /catch \(_2\) \{ \/\* 그냥 간다 \*\/ \}/,
    '★ 압축 도구 하나 때문에 tif 전부가 막힙니다');
  /* 우리가 이미 담아 둔 것을 쓴다 — 같은 것을 두 벌 담지 않는다 */
  assert.match(CODE, /const TIF_ZIP_HERE = 'vendor\/pako\.min\.js'/,
    '★ 이미 있는 사본을 안 쓰고 또 담았습니다');
  assert.ok(fs.existsSync(path.join(R, 'vendor', 'pako.min.js')));
});

test('★★ 「쓸 때만» 받는다 — tif 를 안 올리는 사람은 한 글자도 안 받는다', () => {
  const head = APP.slice(0, APP.indexOf('</head>'));
  ['utif', 'UTIF'].forEach(function (w) {
    assert.ok(!new RegExp('<(script|link)[^>]+(src|href)="[^"]*' + w).test(head),
      '★★ 머리말에 ' + w + ' 를 박았습니다 — 모두가 58KB 를 더 받습니다');
  });
  assert.match(cutFn(APP, 'async function loadTifLib('), /if \(window\.UTIF\) return window\.UTIF/,
    '★ 올릴 때마다 다시 받습니다');
});

/* ── ③ 못 열 때 무엇을 말하는가 ── */

test('★★ 못 여는 까닭을 «그 파일에 맞게» 말한다 — 엉뚱한 안내는 없느니만 못하다', () => {
  const c = load(['function cantOpenWhy(']);
  const heic = c.cantOpenWhy({ name: 'IMG_0001.HEIC', type: '' });
  assert.match(heic, /높은 호환성/, '★ 아이폰 사진에는 그 안내가 맞습니다 — 없어졌습니다');

  const tif = c.cantOpenWhy({ name: '노무계약서.tif', type: '' });
  assert.ok(!/높은 호환성|카메라/.test(tif),
    '★★ 팩스 파일에 아이폰 카메라 설정을 안내합니다 — 시킨 대로 해도 또 막힙니다:\n  ' + tif);
  /* ⚠ tif 는 이제 «우리가 여는» 형식이다. 여기까지 왔다는 것은 도구를 못 받았다는 뜻이지
     형식이 나빠서가 아니다. 「JPG 로 바꿔 오세요」라고 하면 **될 일을 안 된다고 돌려보낸다.** */
  assert.match(tif, /도구/, '★★ 못 연 진짜 까닭(도구를 못 받음)을 안 말합니다:\n  ' + tif);
  assert.ok(!/JPG·PNG로 바꾼 뒤/.test(tif),
    '★★ tif 는 이제 열리는데 「바꿔서 오라」고 돌려보냅니다 — 될 일을 안 된다고 합니다');

  const odd = c.cantOpenWhy({ name: '서류.bmp2', type: '' });
  assert.ok(!/높은 호환성|카메라/.test(odd), '★★ 무엇이 오든 아이폰 이야기를 합니다:\n  ' + odd);
  assert.match(odd, /\.bmp2/, '★ 어떤 형식이 걸렸는지 안 말해 주면 사람이 손쓸 수가 없습니다');
  assert.match(odd, /JPG·PNG로 바꾼 뒤/, '★★ 그럼 어떻게 하라는 것인지 안 말합니다');

  /* 예전의 «무엇이든 아이폰» 문구가 코드에 남아 있으면 안 된다 */
  assert.ok(CODE.indexOf('이 사진 형식은 아이폰 브라우저에서 열 수 없습니다') < 0,
    '★★ 옛 안내가 아직 살아 있습니다');
});

test('★★ 서류 칸은 tif 를 받고, 사진 칸은 «건드리지 않는다»', () => {
  const doc = (APP.match(/<input type="file" id="docInput"[^>]*>/) || [''])[0];
  const pic = (APP.match(/<input type="file" id="picInput"[^>]*>/) || [''])[0];
  assert.ok(doc && pic, '★ 파일 고르는 칸을 못 찾았습니다');
  /* 📄 서류 단추 — 팩스 tif 가 오는 자리다. image/* 만으로는 회색으로 죽는 기기가 있다 */
  assert.match(doc, /accept="[^"]*\.tiff?[,"]/, '★ 서류 칸이 tif 를 못 고릅니다: ' + doc);
  /* ⚠⚠ 사진 칸에는 **절대 넣지 않는다.** accept 에 확장자가 하나라도 섞이면
     안드로이드가 «갤러리»를 안 띄우고 파일 탐색기를 연다 — 폰에서 사진 올리는 길이
     통째로 나빠진다. tif 를 받자고 그것을 내주면 손해가 훨씬 크다. */
  assert.ok(!/\.tiff?/.test(pic),
    '★★ 사진 칸에 확장자를 넣었습니다 — 폰에서 갤러리가 안 열립니다: ' + pic);
  assert.match(pic, /accept="image\/\*"/);
});
