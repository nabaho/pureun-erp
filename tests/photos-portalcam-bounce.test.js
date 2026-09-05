'use strict';
/* 「사진등록·저장·합치기 하다가 갑자기 포털로 튕긴다」 (대표 보고 2026-09-03)

   ■ 무엇이었나 — 옛 포털 촬영이 «되살아나» 끝나는 순간 돌아가 버렸다
   포털 📷 로 들어온 사진은 _portalCapture 표를 달고 대기열에 들어가고, 다 올라가면
   포털로 돌아간다(설계). 그런데
     ① 대기열은 디스크(IndexedDB)에 통째로 남는다 — 그 표까지 함께.
     ② 주소의 ?portalcam= 은 읽고 나서 안 지웠다 — 다시 들어오면 토큰이 그대로 켜진다.
   그래서 사진첩에서 딴 일을 하는 동안 옛 포털 작업이 done 이 되는 순간 enter.html 로 나갔다.

   ⚠ 어제 고친 카메라 되돌아가기(camReturnTo)와 «같은 병»이다 — 「한 번 온 길」이
     세션 끝까지 따라다녔다. 이 검사는 그 병의 둘째 자리를 못박는다.

   실행: node --test tests/photos-portalcam-bounce.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stripComments } = require('./strip-comments');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const app = stripComments(raw);

/* 돌아가는 판정이 있는 대목 — onQueueChange 안 */
function returnBlock() {
  const i = app.indexOf('if (portalCameraToken && !portalCameraReturning) {');
  assert.ok(i > 0, '★ 포털로 돌아가는 판정을 못 찾았습니다');
  const seg = app.slice(i);
  return seg.slice(0, seg.indexOf('renderUp();'));
}

test('★★ 돌아갈 조건은 «이번 도착의 표»가 붙은 장만 본다 — 참/거짓으로 보면 옛 작업에 튕긴다', () => {
  const b = returnBlock();
  assert.match(b, /j\._portalCapture === PORTAL_CAM_RUN/,
    '★★ _portalCapture 가 참이기만 하면 되면, 디스크에서 되살아난 옛 포털 작업이\n' +
    '  done 이 되는 순간 — 사람이 등록·저장·합치기를 하는 중에 — 포털로 튕깁니다.');
  assert.ok(!/return j\._portalCapture;\s*\}/.test(b),
    '★★ 참/거짓으로 거르는 옛 줄이 남아 있습니다.');
});

test('★★ 표는 «페이지가 열릴 때마다» 새로 만든다 — 고정값이면 옛 작업과 같아진다', () => {
  const m = app.match(/const PORTAL_CAM_RUN = ([^;]+);/);
  assert.ok(m, '★ 이번 도착의 표가 없습니다');
  assert.match(m[1], /Date\.now\(\)/, '★ 시각이 안 들어가면 두 번 열어도 같은 표가 됩니다');
  assert.match(m[1], /Math\.random\(\)/, '★ 같은 밀리초에 두 번 열리면 같은 표가 됩니다');
});

test('★★ 담을 때 그 표를 단다 — 참/거짓을 달면 위 판정이 아무것도 못 고른다', () => {
  const fn = stripComments(cutFn(raw, 'async function takePortalCameraFile('));
  assert.match(fn, /portalCapture: PORTAL_CAM_RUN/,
    '★★ 담는 쪽이 true 를 달면, 고르는 쪽이 표를 봐도 하나도 안 잡혀\n' +
    '  포털 촬영이 영영 안 돌아갑니다(반대쪽 고장).');
  const enq = app.slice(app.indexOf('await queue.enqueue({'), app.indexOf('await queue.enqueue({') + 400);
  assert.match(enq, /_portalCapture: \(opts && opts\.portalCapture\) \|\| ''/,
    '★★ 대기열에 넣을 때 !! 로 참/거짓으로 바꾸면 표가 사라집니다.');
});

test('★★ 주소의 portalcam 은 «읽자마자 지운다» — 남겨 두면 뒤로가기가 이 길을 또 켠다', () => {
  const fn = stripComments(cutFn(raw, 'async function takePortalCameraFile('));
  assert.match(fn, /searchParams\.delete\('portalcam'\)/,
    '★★ 주소에 남으면 방문기록·뒤로가기·앱 복원으로 다시 들어올 때 토큰이 그대로 켜집니다.\n' +
    '  그때는 찍은 것도 없어 ⚠ 창만 뜨고 토큰만 남습니다.');
  assert.match(fn, /history\.replaceState/, '★ 지운 주소를 실제로 써 넣어야 합니다');
  /* 카메라 파라미터(cam·mode·from)를 지우는 것과 같은 방식이어야 한다 */
  assert.ok(fn.indexOf("searchParams.delete('portalcam')") < fn.indexOf('portalCameraToken = token'),
    '★ 토큰을 켜기 «전에» 주소를 지워야 합니다 — 켜고 나서 터지면 주소가 남습니다.');
});

test('★★ 이번 도착이 실패하면 토큰을 비운다 — 안 비우면 뒤에 무엇이든 켤 수 있다', () => {
  const fn = stripComments(cutFn(raw, 'async function takePortalCameraFile('));
  const clears = (fn.match(/portalCameraToken = ''/g) || []).length;
  assert.ok(clears >= 2,
    '★★ 찍은 것을 못 읽었을 때·찍은 것이 없을 때 둘 다 토큰을 비워야 합니다(지금 ' + clears + '곳).\n' +
    '  토큰이 남으면 디스크에서 되살아난 옛 작업이 done 이 되는 순간 튕깁니다.');
  /* 바깥 catch(부팅 사슬)도 비운다 — addFiles 자체가 터지는 길 */
  const i = app.indexOf("portalCameraStatus('사진을 저장하지 못했습니다', true)");
  assert.ok(i > 0, '부팅 사슬의 실패 갈래를 못 찾았습니다');
  assert.match(app.slice(i - 200, i), /portalCameraToken = ''/,
    '★ addFiles 가 터지는 길에서도 토큰을 비워야 합니다.');
});

test('★ 돌아가기로 «정했으면» 토큰을 비운다 — 다음 tick 이 또 켜지지 않게', () => {
  const b = returnBlock();
  const fail = b.slice(b.indexOf("'사진 저장 권한을 확인해 주세요'"), b.indexOf('} else if'));
  assert.match(fail, /portalCameraToken = ''/, '★ 실패로 끝났으면 토큰을 비웁니다');
  const ok = b.slice(b.indexOf('portalCameraReturning = true'));
  assert.match(ok.slice(0, 200), /portalCameraToken = ''/, '★ 돌아가기로 했으면 토큰을 비웁니다');
});

test('★ 돌아가는 길 자체는 남아 있다 — 없애면 포털 촬영이 영영 안 돌아온다', () => {
  const b = returnBlock();
  assert.match(b, /location\.replace\('enter\.html\?v=' \+ Date\.now\(\)\)/,
    '★ 포털 📷 로 찍은 사진은 다 올라간 뒤 «온 곳으로» 돌아가는 것이 맞습니다.');
});
