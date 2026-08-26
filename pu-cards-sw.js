/* ⚠ 더 이상 등록하지 않는다 — pu-sw.js 로 합쳐졌다.
   앱마다 워커를 따로 등록하면 같은 scope에서 서로 밀어내 공유 받기가 죽는다.
   이 파일은 예전에 등록해 둔 브라우저가 조용히 갈아타도록 남겨 둔 것이다. */
/* 푸른기업정보함 서비스워커 — 카톡·갤러리 [공유→푸른기업정보함] 수신 처리 */
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => self.clients.claim());
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/pu-cards-share')) {
    e.respondWith((async () => {
      try {
        const form = await e.request.formData();
        const files = form.getAll('images').filter(f => f && f.size);
        const cache = await caches.open('pucards-share');
        await cache.put('shared-files', new Response(JSON.stringify({ n: files.length })));
        for (let i = 0; i < files.length; i++)
          await cache.put('shared-' + i, new Response(files[i], { headers: { 'Content-Type': files[i].type || 'image/jpeg' } }));
      } catch (err) {}
      return Response.redirect('./pu-cards.html?shared=1', 303);
    })());
  }
});
