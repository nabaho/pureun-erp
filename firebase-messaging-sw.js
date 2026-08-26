/* 푸른 통합포털 웹푸시 서비스워커 — 브라우저를 닫아둬도 새 건의 알림을 받는다.
 *
 * ⚠ 이 워커는 반드시 좁은 scope(/pureunall/push/)로 등록한다.
 *   서비스워커는 한 scope에 하나만 살아남는다. 기본 scope(/pureunall/)로 등록하면
 *   기업정보함 공유 수신용 pu-cards-sw.js 를 밀어내 [공유→푸른기업정보함]이 죽는다.
 *   등록은 enter.html 의 pushEnable() 이 scope를 지정해 처리한다.
 *
 * 서버(functions/index.js notifySuggestion)는 data 전용 메시지를 보낸다.
 * notification 필드를 함께 보내면 브라우저가 자체 알림을 띄워 알림이 두 번 뜬다.
 */
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDkZz5QlKSoqMOYByp5YGeMNLNDrIghliA',
  projectId: 'pureun-erp',
  messagingSenderId: '936817166182',
  appId: '1:936817166182:web:9bd31f70d0afdf5fca2aa7'
});

var PORTAL_URL = '/pureunall/enter.html?sg=1';

firebase.messaging().onBackgroundMessage(function (payload) {
  var d = (payload && payload.data) || {};
  self.registration.showNotification(d.title || '푸른노무법인', {
    body: d.body || '',
    icon: '/pureunall/icon-192.png',
    badge: '/pureunall/icon-192.png',
    tag: d.tag || 'pu-suggestion',      // 같은 tag면 알림이 쌓이지 않고 최신 것으로 갈린다
    renotify: true,
    data: { url: d.url || PORTAL_URL }
  });
});

/* 알림을 누르면 이미 열려 있는 포털 탭으로 — 없으면 새로 연다 */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || PORTAL_URL;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf('/pureunall/enter.html') >= 0 && 'focus' in list[i]) return list[i].focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
