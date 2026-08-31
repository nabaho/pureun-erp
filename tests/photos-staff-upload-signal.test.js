'use strict';
/* 📶 직원에게도 «올렸다는 신호»가 가야 한다 (직원 민원 2026-08-31)

   "사진첩에 사진이 안 올라간다고 계속 직원들이 민원이다."

   ■ 두 고침이 겹쳐 구멍이 났다
   ① 올림 신호(watchUploadIndex)는 **총괄관리자만** 받고 있었다.
   ② 그 빈자리는 「창을 다시 볼 때마다 목록을 통째로 다시 읽는 길」이 메우고 있었다.
   그런데 ②를 요금 때문에 없애자(2026-08-31), 직원에게는 **새로고침 길이 하나도
   안 남았다.** 폰에서 올린 사진이 PC 화면에 영영 안 나타나고 —
   그것이 「사진이 안 올라간다」로 보였다.

   ■ 고친 규칙
   · 직원은 **제 자리**(owners/{내 uid})만 본다 — 작은 칸 하나라 값이 사실상 0이다.
   · 관리자는 「전체 근로자」를 보므로 **모두의 자리**를 본다.
   · 붙지 못해도 조용히 넘어간다 — 그때는 새로고침이 남는다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* 진짜 함수를 돌린다 — 「글자가 있나」로는 문지기를 뒤집어도 안 걸린다 */
function watchCtx(isAdmin) {
  const seen = { paths: [], on: 0, off: 0 };
  const ctx = {
    DB_ROOT: 'puphotos',
    ownerPath: function (uid) { return 'puphotos/owners/' + uid; },
    deps: {
      isAdmin: isAdmin, uid: 'ME',
      db: { ref: function (p) {
        seen.paths.push(p);
        return {
          on: function (ev, h) { seen.on++; seen.handler = h; },
          off: function () { seen.off++; }
        };
      } }
    },
    _seen: seen
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(store, 'function watchUploadIndex('), ctx);
  return ctx;
}

test('★★ 직원도 신호를 받는다 — 안 받으면 폰에서 올린 사진이 영영 안 보인다', () => {
  const c = watchCtx(false);
  let fired = 0;
  const stop = c.watchUploadIndex(function () { fired++; });
  assert.equal(c._seen.on, 1,
    '★★ 직원에게 신호를 안 붙이면, 창 재읽기를 없앤 뒤 새로고침 길이 하나도 없습니다\n' +
    '  (직원 민원 2026-08-31 「사진이 안 올라간다」의 정체입니다)');
  /* 첫 값은 구독 직후의 현재값이라 넘기고, 그 다음부터 알린다 */
  c._seen.handler(); assert.equal(fired, 0, '★ 붙자마자 한 번 읽으면 헛걸음입니다');
  c._seen.handler(); assert.equal(fired, 1, '★★ 바뀌었는데 안 알립니다');
  stop();
  assert.equal(c._seen.off, 1, '★ 떼지 않으면 화면을 옮겨도 계속 듣습니다');
});

test('★★ 직원은 «제 자리»만 본다 — 남의 올림까지 볼 까닭이 없다', () => {
  const c = watchCtx(false);
  c.watchUploadIndex(function () {});
  assert.deepEqual(c._seen.paths, ['puphotos/owners/ME'],
    '★★ 직원이 모두의 자리를 보면 남이 올릴 때마다 헛되이 목록을 다시 읽습니다');
});

test('★ 관리자는 «모두의 자리»를 본다 — 전체 근로자 화면을 보기 때문이다', () => {
  const c = watchCtx(true);
  c.watchUploadIndex(function () {});
  assert.deepEqual(c._seen.paths, ['puphotos/owners'],
    '★ 관리자가 제 자리만 보면 남이 올린 사진이 전체 화면에 안 들어옵니다');
});

test('★ 부를 것을 안 주거나 DB 가 없으면 «조용히» 아무 일도 안 한다', () => {
  const c = watchCtx(false);
  assert.doesNotThrow(function () { c.watchUploadIndex(); });
  assert.equal(c._seen.on, 0);
  c.deps.db = null;
  assert.doesNotThrow(function () { c.watchUploadIndex(function () {}); });
  assert.equal(c._seen.on, 0);
});

test('★★ 화면이 그 신호를 «모두에게» 건다 — 관리자만 걸면 고친 뜻이 없다', () => {
  const fn = cutFn(app, 'function startUploadWatch(');
  assert.match(fn, /watchUploadIndex\(scheduleRemotePhotoRefresh\)/);
  assert.ok(!/isAdmin/.test(fn),
    '★★ 화면 쪽에서 다시 관리자만 거르면 직원은 또 못 받습니다');
});
