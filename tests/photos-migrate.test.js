'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateBatch, photoPath } = require('../functions/photos-migrate.js');

/* 가짜 db — 사람마다 items(정보)·blobs(본문)·thumbs(미리보기)를 트리로 들고,
   호출 순서를 calls 배열에 남긴다(뮤테이션 검사 때 순서를 본다). */
function fakeDb(tree) {
  const calls = [];
  return {
    calls,
    listOwners() {
      calls.push(['listOwners']);
      return Promise.resolve(Object.keys(tree));
    },
    listYears(uid) {
      calls.push(['listYears', uid]);
      const items = (tree[uid] && tree[uid].items) || {};
      return Promise.resolve(Object.keys(items));
    },
    listYear(uid, year) {
      calls.push(['listYear', uid, year]);
      const items = (tree[uid] && tree[uid].items && tree[uid].items[year]) || {};
      return Promise.resolve(items);
    },
    readItem(uid, year, id) {
      calls.push(['readItem', uid, year, id]);
      const blobs = (tree[uid] && tree[uid].blobs && tree[uid].blobs[year]) || {};
      const thumbs = (tree[uid] && tree[uid].thumbs && tree[uid].thumbs[year]) || {};
      const full = blobs[id];
      if (full === undefined) return Promise.resolve(null);
      return Promise.resolve({ full: full, thumb: thumbs[id] || '' });
    },
    writeMigrated(uid, year, id) {
      calls.push(['writeMigrated', uid, year, id]);
      tree[uid].items[year][id] = { loc: 'storage' };
      if (tree[uid].blobs && tree[uid].blobs[year]) delete tree[uid].blobs[year][id];
      if (tree[uid].thumbs && tree[uid].thumbs[year]) delete tree[uid].thumbs[year][id];
      return Promise.resolve();
    }
  };
}

/* 가짜 bucket — 올린 경로만 기억한다. exists()는 upload() 된 경로만 참이다
   (실제 창고가 "안 올렸으면 없다"인 것과 같다 — js/pu-photo-store.js 검사에서
   이 부분을 fakeStorage({}) 로 늘 성공 처리했다가 순서 검사가 깨진 적이 있다,
   PR #192 참고. 여기서는 처음부터 올린 것만 존재하게 만든다). */
function fakeBucket(behavior) {
  behavior = behavior || {};
  const uploaded = {};
  const calls = [];
  return {
    calls,
    upload(path, dataUrl) {
      calls.push(['upload', path, dataUrl]);
      if (behavior.uploadFail === path) return Promise.reject(new Error('올리기 실패'));
      uploaded[path] = true;
      return Promise.resolve();
    },
    exists(path) {
      calls.push(['exists', path]);
      if (behavior.existsFail === path) return Promise.resolve(false);
      return Promise.resolve(!!uploaded[path]);
    }
  };
}

test('photoPath — 사람 자리 아래 blobs/thumbs, 확장자는 .jpg', () => {
  assert.equal(photoPath('U1', '2026', 'p1', 'blobs'), 'pu_photos/u/U1/blobs/2026/p1.jpg');
  assert.equal(photoPath('U1', '2026', 'p1', 'thumbs'), 'pu_photos/u/U1/thumbs/2026/p1.jpg');
});

test('★ 한 장을 옮긴다 — 올리고 확인하고 실시간DB 본문을 지운다', async () => {
  const db = fakeDb({ U1: {
    items: { 2026: { p1: { takenAt: 1 } } },
    blobs: { 2026: { p1: 'data:full' } },
    thumbs: { 2026: { p1: 'data:thumb' } }
  } });
  const bucket = fakeBucket();
  const r = await migrateBatch(db, bucket, 30);
  assert.equal(r.moved, 1);
  assert.equal(r.failed, 0);
  assert.equal(r.done, true);
  assert.ok(bucket.calls.some(c => c[0] === 'upload' && c[1] === 'pu_photos/u/U1/blobs/2026/p1.jpg'));
  assert.equal(db.calls.some(c => c[0] === 'writeMigrated'), true);
});

test('★ 순서는 반드시 올리기 → 확인 → 지우기다', async () => {
  const db = fakeDb({ U1: {
    items: { 2026: { p1: { takenAt: 1 } } },
    blobs: { 2026: { p1: 'data:full' } },
    thumbs: { 2026: { p1: 'data:thumb' } }
  } });
  const bucket = fakeBucket();
  await migrateBatch(db, bucket, 30);
  const upAt = bucket.calls.findIndex(c => c[0] === 'upload');
  const existsAt = bucket.calls.findIndex(c => c[0] === 'exists');
  const writeAt = db.calls.findIndex(c => c[0] === 'writeMigrated');
  assert.ok(upAt >= 0 && existsAt >= 0 && writeAt >= 0);
  assert.ok(upAt < existsAt, '확인하기 전에 이미 올렸어야 합니다');
  assert.ok(existsAt < writeAt, '확인하기 전에 실시간DB에서 먼저 지우면 안 됩니다');
});

test('확인이 실패하면 실시간DB 본문을 지우지 않는다', async () => {
  const db = fakeDb({ U1: {
    items: { 2026: { p1: { takenAt: 1 } } },
    blobs: { 2026: { p1: 'data:full' } },
    thumbs: { 2026: { p1: 'data:thumb' } }
  } });
  const bucket = fakeBucket({ existsFail: 'pu_photos/u/U1/blobs/2026/p1.jpg' });
  const r = await migrateBatch(db, bucket, 30);
  assert.equal(r.moved, 0);
  assert.equal(r.failed, 1);
  assert.equal(db.calls.some(c => c[0] === 'writeMigrated'), false);
});

test('이미 옮긴 사진(loc:storage)은 다시 건드리지 않는다', async () => {
  const db = fakeDb({ U1: {
    items: { 2026: { p1: { loc: 'storage' } } },
    blobs: { 2026: { p1: 'data:old' } },
    thumbs: { 2026: { p1: 'data:thumb' } }
  } });
  const bucket = fakeBucket();
  const r = await migrateBatch(db, bucket, 30);
  assert.equal(r.moved, 0);
  assert.equal(r.skipped, 1);
  assert.equal(bucket.calls.length, 0, '이미 옮긴 것을 다시 올리려 했습니다');
});

test('본문이 없는 사진은 실패가 아니라 건너뜀이다', async () => {
  const db = fakeDb({ U1: {
    items: { 2026: { p1: { takenAt: 1 } } },
    blobs: { 2026: {} },
    thumbs: { 2026: {} }
  } });
  const r = await migrateBatch(db, fakeBucket(), 30);
  assert.equal(r.skipped, 1);
  assert.equal(r.failed, 0);
});

test('★ limit 에 닿으면 멈추고 done:false — 나머지는 다음 호출로 미룬다', async () => {
  const db = fakeDb({ U1: {
    items: { 2026: { p1: { takenAt: 1 }, p2: { takenAt: 1 }, p3: { takenAt: 1 } } },
    blobs: { 2026: { p1: 'data:1', p2: 'data:2', p3: 'data:3' } },
    thumbs: { 2026: { p1: 't1', p2: 't2', p3: 't3' } }
  } });
  const r = await migrateBatch(db, fakeBucket(), 2);
  assert.equal(r.moved, 2);
  assert.equal(r.done, false, '★ 셋 중 둘만 옮겼으면 done 이 false 여야 다음 호출이 이어집니다');
});

test('더 옮길 것이 없으면 done:true', async () => {
  const db = fakeDb({ U1: { items: { 2026: {} }, blobs: { 2026: {} }, thumbs: { 2026: {} } } });
  const r = await migrateBatch(db, fakeBucket(), 30);
  assert.equal(r.done, true);
});

test('★ 한 장이 실패해도 나머지 사진·나머지 사람은 계속 옮긴다', async () => {
  const db = fakeDb({
    U1: { items: { 2026: { p1: { takenAt: 1 } } }, blobs: { 2026: { p1: 'data:1' } }, thumbs: { 2026: { p1: 't1' } } },
    U2: { items: { 2026: { p2: { takenAt: 1 } } }, blobs: { 2026: { p2: 'data:2' } }, thumbs: { 2026: { p2: 't2' } } }
  });
  const bucket = fakeBucket({ uploadFail: 'pu_photos/u/U1/blobs/2026/p1.jpg' });
  const r = await migrateBatch(db, bucket, 30);
  assert.equal(r.failed, 1, 'U1 의 실패가 안 잡혔습니다');
  assert.equal(r.moved, 1, '★ U1 이 실패했다고 U2 까지 안 옮겼습니다');
});

test('★ 한 사람의 연도 목록을 통째로 못 읽어도 다른 사람은 계속 옮긴다', async () => {
  const db = fakeDb({
    U1: { items: { 2026: { p1: { takenAt: 1 } } }, blobs: { 2026: { p1: 'data:1' } }, thumbs: { 2026: { p1: 't1' } } },
    U2: { items: { 2026: { p2: { takenAt: 1 } } }, blobs: { 2026: { p2: 'data:2' } }, thumbs: { 2026: { p2: 't2' } } }
  });
  const realListYears = db.listYears.bind(db);
  db.listYears = function (uid) {
    if (uid === 'U1') return Promise.reject(new Error('권한이 없습니다'));
    return realListYears(uid);
  };
  const r = await migrateBatch(db, fakeBucket(), 30);
  assert.equal(r.moved, 1, '★ U1 목록을 못 읽었다고 U2 까지 안 옮겼습니다');
});
