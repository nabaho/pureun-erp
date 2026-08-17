'use strict';
/* 답을 아는 물음은 하지 않는다 — 창고 403·404 도배 (대표 화면 2026-08-17)

   ■ 무엇이 문제였나

   사진첩을 열면 콘솔이 창고(Storage) 403·404 로 도배됐다.
   ①창고 규칙은 「자기 사진만」이라 **남의 사진을 물으면 반드시 403** 인데,
     관리자가 「전체 근로자」로 열 때마다 남의 옛 사진마다 창고를 두드렸다.
   ②창고에 없는 것으로 «이미 아는» 사진(meta.loc ≠ 'storage')까지 두드려
     404 를 받고서야 옛 자리로 물러났다.
   사진은 결국 보였다 — 헛걸음 뒤에 물러나는 길이 있어서다. 그래서 아무 검사도
   안 깨졌고, 콘솔만 빨갛게 됐다. **헛걸음 자체를 없앤다.**

   ■ 왜 실제로 돌려 보나
   「창고를 안 부른다」는 글자로 확인이 안 된다 — 부르는 줄은 그대로 있고
   조건만 앞에 붙는다. 가짜 창고를 끼워 **몇 번 두드렸는지** 센다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');

function loadStore() {
  const src = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
  const ctx = {
    console, Promise, JSON, Math, Date, String, Number, Array, Object, Error, Boolean,
    setTimeout, clearTimeout
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.fetch = function () { return Promise.reject(new Error('네트워크 없음')); };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.PuPhotoStore;
}

/* 두드린 횟수를 세는 가짜 창고 · 옛 자리에 값이 있는 가짜 실시간DB */
function world(legacyVal) {
  const probes = [];
  const storage = {
    ref: function (p) {
      probes.push(p);
      return { getDownloadURL: function () { return Promise.reject(new Error('403')); } };
    }
  };
  const db = {
    ref: function (p) {
      return {
        once: function () {
          /* thumbs/blobs 옛 자리만 값을 준다 — meta(thumbUrl 등)는 비어 있다 */
          const hit = /\/(thumbs|blobs)\//.test(p) ? (legacyVal || null) : null;
          return Promise.resolve({ val: function () { return hit; } });
        },
        update: function () { return Promise.resolve(); }
      };
    }
  };
  return { probes: probes, storage: storage, db: db };
}

test('남의 사진은 창고를 두드리지 않는다', async (t) => {
  await t.test('★ 미리보기 — 남의 것은 옛 자리로 곧장 간다', async () => {
    const w = world('data:image/jpeg;base64,LEG');
    const S = loadStore();
    S.init({ db: w.db, storage: w.storage, uid: 'me' });
    const out = await S.loadThumb('2026', 'p1', 'other');
    assert.equal(out, 'data:image/jpeg;base64,LEG', '옛 자리 사진이 안 보입니다: ' + out);
    assert.deepEqual(w.probes, [],
      '★ 남의 사진인데 창고를 두드렸습니다 — 규칙상 반드시 403 이라 콘솔만 도배됩니다.');
  });

  await t.test('★ 원본 — 남의 것도 마찬가지', async () => {
    const w = world('data:image/jpeg;base64,LEG');
    const S = loadStore();
    S.init({ db: w.db, storage: w.storage, uid: 'me' });
    const out = await S.loadFull('2026', 'p1', 'other');
    assert.equal(out, 'data:image/jpeg;base64,LEG');
    assert.deepEqual(w.probes, []);
  });

  await t.test('★ 주소 받기(thumbUrl)도 남의 것은 묻지 않는다', async () => {
    const w = world(null);
    const S = loadStore();
    S.init({ db: w.db, storage: w.storage, uid: 'me' });
    assert.equal(await S.thumbUrl('2026', 'p1', 'other'), null);
    assert.deepEqual(w.probes, [], '남의 사진 주소는 서버 「주소 채우기」가 정보에 적어 줍니다.');
  });

  await t.test('내 사진은 예전처럼 창고를 먼저 본다 — 옮긴 사진이 보여야 한다', async () => {
    const w = world(null);
    const S = loadStore();
    S.init({ db: w.db, storage: w.storage, uid: 'me' });
    await S.loadThumb('2026', 'p1');                    // owner 없음 = 내 것
    assert.equal(w.probes.length, 1, '내 사진인데 창고를 안 봅니다 — 옮긴 사진이 사라집니다.');
    w.probes.length = 0;
    await S.loadThumb('2026', 'p1', 'me');              // 내 uid 를 그대로 넘겨도 같다
    assert.equal(w.probes.length, 1);
  });
});

test('창고에 없는 것으로 아는 사진(loc 힌트)은 두드리지 않는다', async (t) => {
  await t.test('★ 내 옛 사진도 loc 을 알면 404 헛걸음이 없다', async () => {
    const w = world('data:image/jpeg;base64,LEG');
    const S = loadStore();
    S.init({ db: w.db, storage: w.storage, uid: 'me' });
    const out = await S.loadThumb('2026', 'p1', null, 'rtdb');
    assert.equal(out, 'data:image/jpeg;base64,LEG');
    assert.deepEqual(w.probes, [], '창고에 없다고 아는데 두드렸습니다 — 404 만 돌아옵니다.');
  });

  await t.test('loc 이 storage 면 당연히 창고를 본다', async () => {
    const w = world(null);
    const S = loadStore();
    S.init({ db: w.db, storage: w.storage, uid: 'me' });
    await S.loadThumb('2026', 'p1', null, 'storage');
    assert.equal(w.probes.length, 1);
  });

  await t.test('loc 을 모르면(안 넘기면) 예전 그대로 — 헛 요청 한 번이 사진 못 보는 것보다 낫다', async () => {
    const w = world(null);
    const S = loadStore();
    S.init({ db: w.db, storage: w.storage, uid: 'me' });
    await S.loadThumb('2026', 'p1');
    assert.equal(w.probes.length, 1);
  });
});

test('★ 화면이 loc 힌트를 실제로 넘긴다', () => {
  /* 저장 층만 고치고 화면이 안 넘기면 내 옛 사진의 404 헛걸음이 그대로 남는다 */
  const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
  assert.match(app, /PuPhotoStore\.loadThumb\(photoYearOf\(it\.id\), it\.id, thumbOwnerOf\(it\), it\.meta && it\.meta\.loc\)/,
    '한 장씩 받는 길이 loc 을 안 넘깁니다.');
});
