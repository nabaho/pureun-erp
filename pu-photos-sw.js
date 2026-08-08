/* ⚠ 더 이상 등록하지 않는다 — pu-sw.js 로 합쳐졌다.
   앱마다 워커를 따로 등록하면 같은 scope에서 서로 밀어내 공유 받기가 죽는다.
   이 파일은 예전에 등록해 둔 브라우저가 조용히 갈아타도록 남겨 둔 것이다. */
/* 푸른사진첩 — 「공유 받기」 전용 일꾼 (서비스워커)
   ═══════════════════════════════════════════════════════════════════
   카톡·갤러리에서 사진을 공유하면 안드로이드가 이 앱에 **POST** 로 보낸다.
   보통 웹페이지는 POST 를 받을 수 없어서(서버가 없다) 이 일꾼이 가로채
   사진을 IndexedDB 에 잠깐 두고, 화면을 `?share=1` 로 돌려보낸다.
   그러면 pu-photos.html 이 그것을 꺼내 확인 화면을 띄운다.

   ⚠ 이 일꾼은 **아무것도 캐시하지 않는다.**
   캐시를 두면 pu-version.js 의 「새 버전 자동 적용」과 싸워 옛 화면이 남는다
   (업무관리 서비스워커도 같은 이유로 캐시를 두지 않는다).
   그래서 fetch 에서 **공유 POST 말고는 손도 대지 않고 그냥 흘려보낸다** —
   respondWith 를 부르지 않으면 브라우저가 평소대로 처리한다.

   ⚠ 애플(아이폰)은 웹앱을 공유 목록에 올리는 것을 막아 두었다. 안드로이드 전용이다. */

var SHARE_PATH = '/pu-photos.html';   // 이 길로 오는 POST 만 공유로 본다
var IDB_NAME = 'pu-photos-share';
var IDB_STORE = 'inbox';
var IDB_VER = 1;

self.addEventListener('install', function () {
  /* 기다리지 않고 바로 새 일꾼으로 바꾼다 — 옛 일꾼이 남아 공유를 놓치면
     대표님 눈에는 "가끔 안 된다"로 보인다. */
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (e) {
  /* 공유 POST 가 아니면 **건드리지 않는다**(캐시도, 가로채기도 없다) */
  if (e.request.method !== 'POST') return;
  var url;
  try { url = new URL(e.request.url); } catch (_) { return; }
  if (url.pathname.slice(-SHARE_PATH.length) !== SHARE_PATH) return;
  e.respondWith(takeShare(e.request, url));
});

/* ── 잠깐 두는 곳 ── */
function openIdb() {
  return new Promise(function (res, rej) {
    var r = indexedDB.open(IDB_NAME, IDB_VER);
    r.onupgradeneeded = function () {
      var d = r.result;
      if (!d.objectStoreNames.contains(IDB_STORE)) {
        d.createObjectStore(IDB_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    r.onsuccess = function () { res(r.result); };
    r.onerror = function () { rej(r.error); };
  });
}

function keep(files) {
  return openIdb().then(function (db) {
    return new Promise(function (res, rej) {
      var tx = db.transaction(IDB_STORE, 'readwrite');
      var st = tx.objectStore(IDB_STORE);
      var at = Date.now();
      files.forEach(function (f, i) {
        /* Blob 그대로 담는다 — base64 로 바꾸면 용량이 1.33배가 되고 느리다 */
        st.add({ blob: f, name: f.name || ('공유사진_' + (i + 1)), type: f.type || '', at: at });
      });
      tx.oncomplete = function () { db.close(); res(files.length); };
      tx.onerror = function () { db.close(); rej(tx.error); };
    });
  });
}

function takeShare(req, url) {
  var back = url.origin + url.pathname;
  return req.formData().then(function (fd) {
    /* manifest 의 params.files[0].name 과 같은 이름이어야 한다 */
    var files = fd.getAll('photos').filter(function (f) {
      return f && typeof f === 'object' && f.size > 0;
    });
    if (!files.length) return 0;
    return keep(files);
  }).then(function (n) {
    /* 한 장도 못 받았으면 그 사실을 화면에 알린다 — 조용히 넘기면
       "공유했는데 아무 일도 없다"가 되고, 사람은 올라간 줄 안다. */
    return redirect(back + (n ? '?share=1' : '?share=none'));
  }).catch(function (err) {
    if (self.console) console.warn('[공유 받기]', err);
    return redirect(back + '?share=err');
  });
}

function redirect(to) {
  /* 303 — 받은 POST 를 GET 으로 바꿔 돌려보낸다(새로고침해도 다시 안 보낸다) */
  return Response.redirect(to, 303);
}
