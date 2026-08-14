/* 푸른 통합 서비스워커 — 명함첩·사진첩 「공유 받기」 + PWA 설치 셸을 하나로 합침
   ═══════════════════════════════════════════════════════════════════════════
   ★ 왜 하나로 합쳤나
   서비스워커는 **한 scope에 하나만** 살아남는다. 예전에는 네 앱이 저마다
   자기 워커를 기본 scope(/pureunall/)에 등록했다 —
     pu-cards-sw.js · pu-photos-sw.js · work-sw.js · pu-camera-sw.js
   나중에 연 앱의 워커가 앞의 것을 밀어내므로, 예를 들어
     · 푸른사진첩을 열면  → 명함첩 [공유→푸른명함첩] 이 죽고
     · 업무관리나 푸른카메라를 열면 → 두 앱의 공유가 **모두** 죽었다
       (이 둘의 워커는 하는 일이 없는 설치용 껍데기라 공유 POST를 안 받는다)
   공유 대상 주소가 둘 다 /pureunall/ 아래라서 scope를 좁혀 나눌 수도 없다.
     · 명함첩  : POST /pureunall/pu-cards-share
     · 사진첩  : POST /pureunall/pu-photos.html
   그래서 **같은 파일 하나를 네 앱이 함께 등록**한다. 같은 주소·같은 scope면
   다시 등록해도 밀어내기가 일어나지 않는다.

   ※ 포털 웹푸시(firebase-messaging-sw.js)는 여기 끼우지 않는다. 그쪽은
     /pureunall/push/ 로 scope를 좁혀 등록하므로 애초에 서로 부딪히지 않는다.

   ⚠ 이 워커는 **아무것도 캐시하지 않는다.**
   캐시를 두면 pu-version.js 의 「새 버전 자동 적용」과 싸워 옛 화면이 남는다.
   그래서 공유 POST 말고는 손도 대지 않고 흘려보낸다 —
   respondWith 를 부르지 않으면 브라우저가 평소대로 처리한다.

   ⚠ 애플(아이폰)은 웹앱을 공유 목록에 올리는 것을 막아 두었다. 공유는 안드로이드 전용이다. */

self.addEventListener('install', function () {
  /* 기다리지 않고 바로 새 일꾼으로 바꾼다 — 옛 일꾼이 남아 공유를 놓치면
     쓰는 사람 눈에는 "가끔 안 된다"로 보인다. */
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});

var CARDS_SHARE = '/pu-cards-share';    // 명함첩 manifest 의 share_target.action
var PHOTOS_SHARE = '/pu-photos.html';   // 사진첩 manifest 의 share_target.action
var PAYDATA_SHARE = '/pu-paydata.html'; // 급여데이터함 manifest 의 share_target.action

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'POST') return;          // GET 등은 건드리지 않는다(캐시 없음)
  var url;
  try { url = new URL(e.request.url); } catch (_) { return; }
  var p = url.pathname;
  if (p.slice(-CARDS_SHARE.length) === CARDS_SHARE) { e.respondWith(takeCards(e.request)); return; }
  if (p.slice(-PHOTOS_SHARE.length) === PHOTOS_SHARE) { e.respondWith(takePhotos(e.request, url)); return; }
  if (p.slice(-PAYDATA_SHARE.length) === PAYDATA_SHARE) { e.respondWith(takePaydata(e.request, url)); return; }
});

/* 303 — 받은 POST 를 GET 으로 바꿔 돌려보낸다(새로고침해도 다시 안 보낸다) */
function redirect(to) {
  return Response.redirect(new URL(to, self.location).href, 303);
}

/* ══════════ 명함첩: 공유받은 이미지를 Cache 에 잠깐 둔다 ══════════
   pu-cards.html 이 ?shared=1 로 돌아와 'pucards-share' 캐시에서 꺼내 쓴다.
   키 이름(shared-files · shared-N)은 읽는 쪽과 짝이라 바꾸면 안 된다. */
function takeCards(req) {
  return (async function () {
    try {
      var form = await req.formData();
      var files = form.getAll('images').filter(function (f) { return f && f.size; });
      var cache = await caches.open('pucards-share');
      await cache.put('shared-files', new Response(JSON.stringify({ n: files.length })));
      for (var i = 0; i < files.length; i++) {
        await cache.put('shared-' + i, new Response(files[i], {
          headers: { 'Content-Type': files[i].type || 'image/jpeg' }
        }));
      }
    } catch (err) {
      if (self.console) console.warn('[명함첩 공유 받기]', err);
    }
    return redirect('./pu-cards.html?shared=1');
  })();
}

/* ══════════ 사진첩: 공유받은 사진을 IndexedDB 에 잠깐 둔다 ══════════
   Blob 그대로 담는다 — base64 로 바꾸면 용량이 1.33배가 되고 느리다.
   pu-photos.html 이 ?share=1 로 돌아와 꺼내 확인 화면을 띄운다. */
var IDB_NAME = 'pu-photos-share', IDB_STORE = 'inbox', IDB_VER = 1;

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

function keepPhotos(files) {
  return openIdb().then(function (db) {
    return new Promise(function (res, rej) {
      var tx = db.transaction(IDB_STORE, 'readwrite');
      var st = tx.objectStore(IDB_STORE);
      var at = Date.now();
      files.forEach(function (f, i) {
        st.add({ blob: f, name: f.name || ('공유사진_' + (i + 1)), type: f.type || '', at: at });
      });
      tx.oncomplete = function () { db.close(); res(files.length); };
      tx.onerror = function () { db.close(); rej(tx.error); };
    });
  });
}

function takePhotos(req, url) {
  var back = url.origin + url.pathname;
  return req.formData().then(function (fd) {
    /* manifest 의 params.files[0].name 과 같은 이름이어야 한다 */
    var files = fd.getAll('photos').filter(function (f) {
      return f && typeof f === 'object' && f.size > 0;
    });
    if (!files.length) return 0;
    return keepPhotos(files);
  }).then(function (n) {
    /* 한 장도 못 받았으면 그 사실을 화면에 알린다 — 조용히 넘기면
       "공유했는데 아무 일도 없다"가 되고, 사람은 올라간 줄 안다. */
    return redirect(back + (n ? '?share=1' : '?share=none'));
  }).catch(function (err) {
    if (self.console) console.warn('[사진첩 공유 받기]', err);
    return redirect(back + '?share=err');
  });
}

/* ══════ 급여데이터함: 공유받은 자료를 IndexedDB 에 잠깐 둔다 ══════
   사진첩과 같은 방식이지만 자리(store)는 따로 둔다 — 한 IndexedDB를 같이
   쓰면 두 앱이 서로의 대기분을 집어가 버릴 수 있다. */
var PAYDATA_IDB_NAME = 'pu-paydata-share', PAYDATA_IDB_STORE = 'inbox', PAYDATA_IDB_VER = 1;

function openPaydataIdb() {
  return new Promise(function (res, rej) {
    var r = indexedDB.open(PAYDATA_IDB_NAME, PAYDATA_IDB_VER);
    r.onupgradeneeded = function () {
      var d = r.result;
      if (!d.objectStoreNames.contains(PAYDATA_IDB_STORE)) {
        d.createObjectStore(PAYDATA_IDB_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    r.onsuccess = function () { res(r.result); };
    r.onerror = function () { rej(r.error); };
  });
}

function keepPaydata(files) {
  return openPaydataIdb().then(function (db) {
    return new Promise(function (res, rej) {
      var tx = db.transaction(PAYDATA_IDB_STORE, 'readwrite');
      var st = tx.objectStore(PAYDATA_IDB_STORE);
      var at = Date.now();
      files.forEach(function (f, i) {
        st.add({ blob: f, name: f.name || ('공유자료_' + (i + 1)), type: f.type || '', at: at });
      });
      tx.oncomplete = function () { db.close(); res(files.length); };
      tx.onerror = function () { db.close(); rej(tx.error); };
    });
  });
}

function takePaydata(req, url) {
  var back = url.origin + url.pathname;
  return req.formData().then(function (fd) {
    var files = fd.getAll('photos').filter(function (f) {
      return f && typeof f === 'object' && f.size > 0;
    });
    if (!files.length) return 0;
    return keepPaydata(files);
  }).then(function (n) {
    return redirect(back + (n ? '?share=1' : '?share=none'));
  }).catch(function (err) {
    if (self.console) console.warn('[급여데이터함 공유 받기]', err);
    return redirect(back + '?share=err');
  });
}
