/* ⚠ 더 이상 등록하지 않는다 — pu-sw.js 로 합쳐졌다.
   이 껍데기 워커가 같은 scope를 차지하면 기업정보함·사진첩 공유가 함께 죽었다. */
/* 푸른카메라 서비스워커 — 홈 화면 설치(PWA)용 최소 셸 */
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => self.clients.claim());
/* 네트워크 우선: 항상 최신 앱을 받도록(오프라인 캐시는 두지 않음) */
self.addEventListener('fetch', () => {});
