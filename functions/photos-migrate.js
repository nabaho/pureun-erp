'use strict';
/* 사진첩 서버 쪽 사진 이사 — 총괄 관리자가 다른 직원 사진을 창고로 옮긴다.
   (설계서: docs/superpowers/specs/2026-08-13-사진첩-서버이사도구-design.md)

   firebase-admin 에 의존하지 않는 순수 함수다 — db·bucket 을 인자로 받는다
   (js/pu-photo-store.js 의 deps 주입과 같은 이유: 가짜 객체로 검사할 수 있게).
   실제 Admin SDK 연결은 functions/index.js 가 감싼다.

   클라이언트 쪽(js/pu-photo-store.js 의 migrateToStorage)과 지키는 것이 같다 —
   올리기 → 되읽어 확인하기 → 그제야 실시간DB 본문 지우기. 확인 전엔 절대
   실시간DB 를 건드리지 않는다. 다만 서버는 창고 규칙을 Admin SDK 로 우회하므로
   여러 사람 자리에 한꺼번에 쓸 수 있다는 점이 클라이언트 쪽과 다르다. */

var BUCKET_ROOT = 'pu_photos'; // js/pu-photo-store.js 의 BUCKET_ROOT 와 반드시 같아야 한다

function photoPath(uid, year, id, kind) {
  return BUCKET_ROOT + '/u/' + uid + '/' + kind + '/' + year + '/' + id + '.jpg';
}

function migrateOne(db, bucket, uid, year, id, out) {
  return db.readItem(uid, year, id).then(function (item) {
    if (!item || !item.full) { out.skipped++; return; }
    var fullPath = photoPath(uid, year, id, 'blobs');
    var thumbPath = photoPath(uid, year, id, 'thumbs');
    return bucket.upload(fullPath, item.full)
      .then(function () { return item.thumb ? bucket.upload(thumbPath, item.thumb) : null; })
      // 올리고 나서 실제로 되읽어 확인한다 — 안 하고 지우면, 못 올라간 사진을 잃는다.
      .then(function () { return bucket.exists(fullPath); })
      .then(function (exists) {
        if (!exists) throw new Error('올린 사진을 다시 확인하지 못했습니다');
        return db.writeMigrated(uid, year, id);
      })
      .then(function () { out.moved++; });
  }).catch(function (e) {
    console.warn('[사진 이사:서버]', uid, year, id, e && e.message);
    out.failed++;
  });
}

function migrateYear(db, bucket, uid, year, quotaLeft, out) {
  return db.listYear(uid, year).then(function (items) {
    var ids = Object.keys(items || {});
    return ids.reduce(function (chain, id) {
      return chain.then(function () {
        if (!quotaLeft()) { out.done = false; return; }
        var meta = items[id];
        if (meta && meta.loc === 'storage') { out.skipped++; return; }
        return migrateOne(db, bucket, uid, year, id, out);
      });
    }, Promise.resolve());
  });
}

function migrateOwner(db, bucket, uid, quotaLeft, out) {
  return db.listYears(uid).then(function (years) {
    return years.reduce(function (chain, year) {
      return chain.then(function () {
        if (!quotaLeft()) { out.done = false; return; }
        return migrateYear(db, bucket, uid, year, quotaLeft, out);
      });
    }, Promise.resolve());
  }).catch(function (e) {
    // 이 사람만 실패 — 나머지 사람은 계속 옮긴다.
    console.warn('[사진 이사:서버]', uid, e && e.message);
  });
}

function migrateBatch(db, bucket, limit) {
  var cap = (Number(limit) > 0) ? Number(limit) : 30;
  var out = { moved: 0, skipped: 0, failed: 0, done: true };
  function quotaLeft() { return out.moved < cap; }
  return db.listOwners().then(function (uids) {
    return uids.reduce(function (chain, uid) {
      return chain.then(function () {
        if (!quotaLeft()) { out.done = false; return; }
        return migrateOwner(db, bucket, uid, quotaLeft, out);
      });
    }, Promise.resolve());
  }).then(function () { return out; });
}

module.exports = {
  migrateBatch: migrateBatch,
  photoPath: photoPath,
  BUCKET_ROOT: BUCKET_ROOT
};
