'use strict';
/* 사진을 클립보드에 담기 — 대표 보고 2026-08-23 「작동이 안된다」

   격자에서 밖으로 끌기를 만들어 드렸는데 클로드코드에서 안 된다고 하셨다. 갈라
   확인해 주신 결과: **탐색기는 되는데 클로드코드만 안 된다.** 버그가 아니다 —
   브라우저가 밖으로 내미는 것은 파일이 아니라 「이 주소에서 받아 파일로 만들어라」는
   «약속»이고, 탐색기·한글·워드는 그것을 받을 줄 알지만 터미널 계열(클로드코드)은
   이미 디스크에 있는 파일의 «경로»만 받는다. 우리가 고칠 수 있는 것이 아니다.

   그래서 한 걸음에 옮기는 다른 길을 낸다: **붙여넣기.** 클로드코드는 붙여넣은
   그림을 받는다.

   지켜야 하는 것:
   ① PNG 로 담는다 — 크롬은 image/jpeg 클립보드 쓰기를 막는다.
   ② 미리보기가 아니라 **원본**을 담는다(서류는 글자를 읽어야 한다).
   ③ 그림은 **한 장만** 담긴다 — 여러 장을 고른 채 누르면 그 사실을 말해 준다.
   ④ 「내려받기」 길을 없애지 않는다 — 여러 장은 그쪽이 맞다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

function fnOf(name) {
  const i = app.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했습니다');
  let d = 0;
  for (let k = app.indexOf('{', i); k < app.length; k++) {
    if (app[k] === '{') d++;
    else if (app[k] === '}') { d--; if (!d) return app.slice(i, k + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했습니다');
}

/* 실제로 돌린다 — 「clipboard 라는 낱말이 있나」로는 무엇이 담기는지 못 잡는다. */
function run(o) {
  o = o || {};
  const log = [];
  const written = [];
  const ctx = {
    selected: new Set(o.selected || ['p1']),
    toast: function (m) { log.push('toast:' + m); },
    alert: function (m) { log.push('alert:' + m); },
    console: { warn: function () {} },
    safeSrc: function (v) { return o.noFull ? '' : v; },
    photoYearOf: function () { return '2026'; },
    photoOwner: function () { return 'U1'; },
    PuPhotoStore: { loadFull: function (y, id) {
      log.push('loadFull:' + id);
      return o.loadFails ? Promise.reject(new Error('본문 없음'))
        : Promise.resolve('data:image/jpeg;base64,AAA');
    } },
    /* 캔버스·이미지 대신 가짜 — PNG 로 바꾸는 «자리»가 있는지 본다 */
    document: { createElement: function () {
      return { width: 0, height: 0,
        getContext: function () { return { drawImage: function () {} }; },
        toBlob: function (cb, type) { log.push('toBlob:' + type); cb({ type: type, size: 9 }); } };
    } },
    Image: function () {
      const self = this;
      Object.defineProperty(this, 'src', { set: function (v) {
        self.naturalWidth = 100; self.naturalHeight = 80;
        setTimeout(function () { o.imgFails ? self.onerror() : self.onload(); }, 0);
      } });
    },
    navigator: o.noClipboard ? {} : { clipboard: { write: function (items) {
      written.push(items); return Promise.resolve();
    } } },
    ClipboardItem: function (map) { this.map = map; Object.assign(this, map); },
    Promise, Set, Array, Object, String, Number, setTimeout, Error
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fnOf('pngBlobOf') + '\n' + fnOf('copyPhotoImage') + '\n' +
    fnOf('copySelectedImage'), ctx);
  return { ctx, log, written };
}
const settle = function () { return new Promise(function (r) { setTimeout(r, 20); }); };

/* ══════ ① 담긴다 ══════ */

test('★ 원본을 PNG 로 바꿔 클립보드에 담는다 — jpeg 는 크롬이 막는다', async () => {
  const { ctx, log, written } = run();
  ctx.copyPhotoImage('p1');
  await settle();
  assert.ok(log.indexOf('loadFull:p1') >= 0, '★ 미리보기가 아니라 원본을 담아야 합니다');
  assert.ok(log.indexOf('toBlob:image/png') >= 0, '★ PNG 가 아니면 클립보드가 거부합니다');
  assert.equal(written.length, 1, '★ 클립보드에 안 담았습니다');
  assert.ok(written[0][0].map['image/png'], '★ image/png 칸으로 담아야 합니다');
});

test('★ 담은 뒤 무엇을 하라고 말해 준다 — Ctrl+V 를 모르면 담아도 못 쓴다', async () => {
  const { ctx, log } = run();
  ctx.copyPhotoImage('p1');
  await settle();
  assert.ok(log.some(function (l) { return /^toast:.*Ctrl\+V/.test(l); }),
    '★ 붙여넣기 하라는 말이 없습니다: ' + log.join(' | '));
  assert.ok(log.some(function (l) { return /클로드코드/.test(l); }),
    '어디에 붙일 수 있는지 안 알려 줍니다');
});

/* ══════ ② 한 장만 담긴다는 것을 말한다 ══════ */

test('★ 여러 장을 고른 채 누르면 첫 장만 담긴다고 말한다', async () => {
  const { ctx, log } = run({ selected: ['p1', 'p2', 'p3'] });
  ctx.copySelectedImage();
  await settle();
  assert.ok(log.some(function (l) { return /3장 중 첫 장만/.test(l); }),
    '★ 조용히 한 장만 담으면 나머지도 담긴 줄 알고 되풀이해 붙여넣습니다');
  assert.ok(log.some(function (l) { return /내려받기/.test(l); }),
    '★ 여러 장을 옮기는 길을 안 알려 줍니다');
  assert.ok(log.indexOf('loadFull:p1') >= 0, '고른 것의 첫 장을 담아야 합니다');
});

test('한 장만 골랐으면 그런 말을 안 한다 — 쓸데없는 말은 안 읽힌다', async () => {
  const { ctx, log } = run({ selected: ['p1'] });
  ctx.copySelectedImage();
  await settle();
  assert.ok(!log.some(function (l) { return /첫 장만/.test(l); }));
});

test('고른 것이 없으면 아무 일도 안 한다', async () => {
  const { ctx, log } = run({ selected: [] });
  ctx.copySelectedImage();
  await settle();
  assert.equal(log.length, 0, '고른 것이 없는데 무엇을 담았습니다: ' + log.join(' | '));
});

/* ══════ ③ 안 될 때는 내려받기로 보낸다 ══════ */

test('★ 클립보드를 못 쓰는 브라우저면 「내려받기」를 가리킨다', async () => {
  const { ctx, log } = run({ noClipboard: true });
  ctx.copyPhotoImage('p1');
  await settle();
  /* ⚠ 안내가 두 줄이다 — `.` 는 줄바꿈에 안 걸린다(여기서 한 번 헛돌았다). */
  assert.ok(log.some(function (l) { return /^alert:/.test(l) && /내려받기/.test(l); }),
    '★ 안 된다고만 하면 무엇을 해야 할지 모릅니다: ' + log.join(' | '));
  assert.ok(log.indexOf('loadFull:p1') < 0, '못 담을 것을 알면서 원본을 내려받았습니다(돈)');
});

test('★ 원본을 못 읽으면 그렇게 말하고 내려받기를 가리킨다', async () => {
  const { ctx, log } = run({ noFull: true });
  ctx.copyPhotoImage('p1');
  await settle();
  assert.ok(log.some(function (l) { return /^alert:/.test(l) && /내려받기/.test(l); }),
    '조용히 실패하면 복사된 줄 알고 붙여넣습니다: ' + log.join(' | '));
});

test('사진을 열지 못해도 화면이 죽지 않는다', async () => {
  const { ctx, log } = run({ imgFails: true });
  ctx.copyPhotoImage('p1');
  await settle();
  assert.ok(log.some(function (l) { return /^alert:/.test(l); }));
});

/* ══════ ④ 배선 ══════ */

test('★ 단추가 두 곳에 있다 — 격자(고른 것)와 크게 보기', () => {
  assert.match(app, /id="cpBtn" onclick="copySelectedImage\(\)"/, '격자 도구줄에 단추가 없습니다');
  assert.match(app, /onclick="copyPhotoImage\(viewerId\)"/, '크게 보기에 단추가 없습니다');
});

test('★ 고른 것이 있을 때 단추가 보인다 — 만들고 안 보여 주면 없는 것과 같다', () => {
  const i = app.indexOf("['dlBtn', 'cpBtn'");
  assert.ok(i > 0, '★ cpBtn 을 보이게 하는 목록에 안 넣었습니다');
});

test('★ 숫자를 붙이지 않는다 — 「3장 복사」라고 쓰면 다 담기는 줄 안다', () => {
  assert.match(app, /\$\('cpBtn'\)\.textContent = n > 1 \? '📋 첫 장 복사' : '📋 복사';/,
    '★ 담기는 것은 한 장인데 여러 장처럼 적으면 안 됩니다');
});

test('여러 장 내려받기 길은 그대로 남아 있다 — 그쪽이 여러 장의 정답이다', () => {
  assert.match(app, /id="dlBtn" onclick="downloadSelected\(\)"/);
  assert.match(fnOf('downloadSelected'), /loadZipLib/, 'zip 으로 묶어 받는 길이 사라졌습니다');
});

test('★ 왜 클로드코드에서 끌기가 안 되는지 코드에 적어 둔다 — 다음에 또 고치려 든다', () => {
  const i = app.indexOf('function copyPhotoImage(');
  const head = app.slice(Math.max(0, i - 1800), i);
  assert.match(head, /클로드코드/, '까닭이 적혀 있지 않습니다');
  assert.match(head, /약속|promise/, '「파일이 아니라 약속」이라는 핵심이 빠졌습니다');
  assert.match(head, /탐색기/, '어디서는 되는지 안 적으면 통째로 안 되는 줄 압니다');
  /* ⚠ 「클로드코드」라는 낱말은 이 대목에 여러 번 나온다 — 그것만 보면 «핵심 한
     문장»을 지워도 통과한다(되돌림 시험에서 살아남아 이렇게 조였다).
     받는 쪽이 «경로»만 받는다는 것이 이 문제의 전부이므로 그것을 못박는다. */
  assert.match(head, /터미널/, '어느 부류가 못 받는지 안 적혀 있습니다');
  assert.match(head, /경로/, '★ 「경로만 받는다」가 빠지면 왜 안 되는지 알 수 없습니다');
});
