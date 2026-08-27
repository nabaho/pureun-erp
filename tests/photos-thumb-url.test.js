'use strict';
/* 미리보기를 **주소 그대로** 쓴다 — 대표 보고 2026-08-15 (느리다 · 비용)

   창고로 옮긴 뒤 미리보기 받는 길이 이랬다:
     주소받기 → 파일 내려받기 → data: 로 바꾸기   (사진 한 장에 두 번 오간다)
   그리고 data: 는 주소가 아니라 **내용**이라 브라우저가 캐시할 열쇠가 없다 —
   사진첩을 열 때마다 302장을 처음부터 다시 받았다.

   이제:
     ① 적어 둔 주소가 있으면 그대로 (오가는 횟수 0)
     ② 없으면 주소만 받아 그리고, 그 주소를 적어 둔다 (다음부터 ①)
   내려받기는 브라우저가 하고, 주소라서 캐시에 남는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');

function fnOf(src, name) {
  const m = src.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 를 찾지 못했습니다');
  return m[0];
}

/* 저장 층 함수는 두 칸 들여쓰기라 위 fnOf 가 `\n}` 를 못 만나고 **다음 함수들까지
   통째로 삼킨다.** 그러면 「이 함수 안에 getDownloadURL 이 있나」 같은 검사가
   옆 함수의 글자를 보고 통과한다 — 실제로 그래서 뮤테이션 하나를 놓쳤다.
   그래서 다음 함수가 시작하는 자리에서 자른다. */
function storeFnOf(name) {
  const at = store.indexOf('function ' + name + '(');
  assert.ok(at > 0, name + ' 를 찾지 못했습니다');
  const next = store.indexOf('\n  function ', at + 1);
  return store.slice(at, next > at ? next : at + 1200);
}

/* ── ① 저장 층: 주소만 받는 길이 따로 있다 ── */
test('★ 미리보기 주소만 받는 길이 있다 — 파일까지 내려받지 않는다', () => {
  const fn = storeFnOf('thumbUrl');
  assert.match(fn, /getDownloadURL\(\)/, '주소를 안 받습니다');
  assert.ok(!/fetch/.test(fn),
    '파일까지 내려받고 있습니다 — 오가는 횟수가 두 배가 되고 캐시도 안 됩니다');
  assert.ok(!/FileReader|readAsDataURL/.test(fn),
    'data: 로 바꾸고 있습니다 — 그러면 브라우저가 캐시를 못 합니다');
});

test('판독(OCR)이 쓰는 길은 그대로 내용을 받는다', () => {
  /* 주소만으로는 글자를 읽을 수 없다 — 원본 길까지 「주소만」으로 바꾸면 판독이 죽는다.
     ⚠ 2026-08-27 — loadFull 은 「까닭까지 주는 길」(loadFullDetail)을 얇게 감싼 것이
       됐다. 창고를 보는 몸통은 그쪽에 있다. 이름이 아니라 «내용을 받는가»를 본다. */
  const fn = storeFnOf('loadFullDetail');
  assert.match(fn, /withStorage\(/, '원본 길이 창고를 안 봅니다');
  assert.match(storeFnOf('loadFull'), /loadFullDetail\(/,
    'loadFull 이 그 길을 안 거칩니다 — 길이 두 벌이 되면 한쪽만 고쳐집니다');
});

/* ── ② 화면: 적어 둔 주소를 먼저 쓴다 ── */
test('★ 적어 둔 주소가 있으면 아무 데도 안 물어본다', () => {
  const fn = fnOf(app, 'fillThumbs');
  assert.match(fn, /it\.meta && it\.meta\.thumbUrl/, '적어 둔 주소를 안 봅니다');
  const at = fn.indexOf('thumbUrl');
  const ask = fn.indexOf('fillThumbUrls');
  assert.ok(at > 0 && ask > at, '주소를 물어보는 것보다 먼저 적어 둔 것을 봐야 합니다');
});

test('★ 창고 사진은 옛 길(파일까지 내려받기)로 안 간다', () => {
  /* 옛 길로 흘러가면 고친 보람이 없다 — 같은 사진을 두 번 오가며 받는다 */
  const fn = fnOf(app, 'fillThumbs');
  assert.match(fn, /loc === 'storage'/, '창고 사진과 옛 사진을 안 가릅니다');
  const tail = fn.slice(fn.indexOf('fillThumbsOneByOne(left)') - 400);
  assert.match(tail, /!\(it\.meta && it\.meta\.loc === 'storage'\)/,
    '남은 것을 옛 길로 보낼 때 창고 사진을 안 빼고 있습니다');
});

test('★ 받은 주소를 적어 둔다 — 다음에 열 때 또 물어보지 않게', () => {
  const fn = fnOf(app, 'fillThumbUrls');
  assert.match(fn, /rememberThumbUrl\(/, '주소를 안 적어 둡니다 — 열 때마다 다시 물어봅니다');
  assert.match(fn, /paintThumb\(it\)[\s\S]{0,200}rememberThumbUrl/,
    '적어 두기를 기다렸다 그리면 화면이 늦어집니다 — 먼저 그리고 나서 적어야 합니다');
});

test('한꺼번에 다 부르지 않는다 — 폰이 버티지 못한다', () => {
  const fn = fnOf(app, 'fillThumbUrls');
  assert.match(fn, /Math\.min\(4, pending\.length\)/,
    '302장을 동시에 던지면 폰과 통신이 서로를 밀어냅니다');
});

/* ── ③ 아무 주소나 꽂지 않는다 ── */
const safeSrc = (function () {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(app.match(/const THUMB_HOST = [^\n]*\n/)[0] + fnOf(app, 'safeSrc'), ctx);
  return ctx.safeSrc;
})();

test('★ 창고 주소와 사진 데이터만 통과시킨다', () => {
  assert.ok(safeSrc('data:image/jpeg;base64,AAA'), '사진 데이터를 막고 있습니다');
  assert.ok(safeSrc('https://firebasestorage.googleapis.com/v0/b/x/o/y?alt=media'),
    '창고 주소를 막고 있습니다 — 미리보기가 안 나옵니다');
});

test('★ 남이 적어 넣은 주소는 안 꽂는다', () => {
  /* 사진 정보는 여러 사람이 함께 쓰는 자리다. 아무 https 나 받으면
     그 주소로 신호가 나가 「누가 무엇을 보고 있는지」가 새어 나간다. */
  ['https://evil.example.com/a.jpg',
   'https://firebasestorage.googleapis.com.evil.com/a.jpg',
   'javascript:alert(1)',
   'data:text/html,<script>x</script>',
   '//firebasestorage.googleapis.com/a.jpg'
  ].forEach(function (bad) {
    assert.equal(safeSrc(bad), null, '막아야 할 주소가 통과했습니다: ' + bad);
  });
  assert.equal(safeSrc(null), null);
  assert.equal(safeSrc(123), null);
});

/* ── ④ 적어 둔 주소가 죽었을 때 ── */
test('★ 적어 둔 주소가 못 쓰게 되면 한 번 다시 받아 그린다', () => {
  /* 안 그러면 오늘(2026-08-15) 겪은 것과 똑같이 **빈 칸만** 남는다 */
  const fn = fnOf(app, 'paintThumb');
  assert.match(fn, /img\.onerror/, '주소가 죽었을 때 되살릴 길이 없습니다');
  assert.match(fn, /forgetThumbUrl\(/, '죽은 주소를 안 지웁니다 — 다음에도 그대로 씁니다');
  assert.match(fn, /img\.onerror = null;/,
    '새로 받은 것도 실패하면 끝없이 되풀이합니다');
});

test('사진 데이터(data:)에는 그 되살리기를 안 건다', () => {
  /* 옛 사진은 주소가 아니라 내용이다 — 다시 받을 주소가 없다 */
  const fn = fnOf(app, 'paintThumb');
  assert.match(fn, /src\.indexOf\(THUMB_HOST\) === 0/,
    '옛 사진에도 주소 되살리기를 걸고 있습니다');
});
