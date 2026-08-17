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

/* ── 주소(내려받기 토큰) 채우기 (2026-08-17, 대표 보고 「사진이 안 뜬다·너무 늦다」) ──
   창고 규칙은 실시간DB(uid_roles)를 못 읽어 「자기 사진만」으로 잠겨 있다. 그래서
   관리자·공유받은 사람이 창고에 주소를 직접 청하면 403 으로 거부된다 — 대표
   화면에서 다른 직원의 회의사진 46장이 전부 회색 칸이었고, 콘솔에 403 이
   832건 쌓여 있었다. 크게 보기에서는 남의 사진이 「원본이 없습니다」로 둔갑한다.

   주소(토큰이 붙은 내려받기 URL)는 규칙과 무관하게 열린다. 그래서 주소를 사진
   **정보(실시간DB)** 에 적어 두면, 정보를 읽을 수 있는 사람(주인·관리자·공유)이
   곧 사진도 볼 수 있다 — 실시간DB 시절과 똑같은 접근 범위다.
   이 통과는 **이미 옮겨진(loc=storage) 사진에 주소가 빠져 있으면** 만들어 적는다. */
function tokenizeOne(db, bucket, uid, year, id, out) {
  /* 주소를 못 만드는 창고(옛 감싸개 등)면 조용히 건너뛴다 — 이사 자체를
     실패로 만들면 안 된다. 사진은 이미 안전하고, 주소는 다음에 채우면 된다. */
  if (!bucket || typeof bucket.downloadUrl !== 'function' || typeof db.writeUrls !== 'function') {
    out.skipped++;
    return Promise.resolve();
  }
  return Promise.all([
    bucket.downloadUrl(photoPath(uid, year, id, 'blobs')),
    bucket.downloadUrl(photoPath(uid, year, id, 'thumbs'))
  ]).then(function (urls) {
    if (!urls[0] && !urls[1]) { out.skipped++; return; }   // 창고에 파일 자체가 없다
    return db.writeUrls(uid, year, id, { fullUrl: urls[0] || null, thumbUrl: urls[1] || null })
      .then(function () { out.linked++; });
  }).catch(function (e) {
    console.warn('[주소 채우기:서버]', uid, year, id, e && e.message);
    out.failed++;
  });
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
      .then(function () { out.moved++; })
      /* 방금 옮긴 사진도 주소를 바로 적는다 — 다음 통과를 기다릴 이유가 없다.
         ⚠ 주소 채우기 실패가 이사 성공을 뒤집으면 안 된다(사진은 이미 안전하다). */
      .then(function () {
        return tokenizeOne(db, bucket, uid, year, id, { linked: 0, skipped: 0, failed: 0 });
      });
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
        if (meta && meta.loc === 'storage') {
          /* 이미 옮겨졌다 — 주소만 확인한다. 둘 다 있으면 손대지 않는다(멱등). */
          if (meta.fullUrl && meta.thumbUrl) { out.skipped++; return; }
          return tokenizeOne(db, bucket, uid, year, id, out);
        }
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
  var out = { moved: 0, linked: 0, skipped: 0, failed: 0, done: true };
  /* 주소 채우기(linked)도 한도에 넣는다 — 한 번에 수백 장의 토큰을 만들면
     함수 시간제한(300초)에 걸린다. 여러 번 누르면 이어서 한다(멱등). */
  function quotaLeft() { return (out.moved + out.linked) < cap; }
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
