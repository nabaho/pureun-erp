/* 푸른명함첩 서비스워커 — 카톡·갤러리 [공유→푸른명함첩] 수신 처리 */
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
