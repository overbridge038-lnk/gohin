// 誤品照合 オフライン用サービスワーカー
// アプリ本体とカメラ読取ライブラリを端末に保存し、ネットがなくても起動できるようにする。
// ネットにつながっているときは裏で最新版を取りに行き、次回起動時に反映する。
const CACHE = 'gohin-v1';
const FILES = [
  './',
  './index.html',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const hit = await cache.match(e.request, { ignoreSearch: true });
      const net = fetch(e.request)
        .then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(e.request, res.clone()); return res; })
        .catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }        // 保存版をすぐ表示、裏で更新
      const res = await net;
      if (res) return res;
      return (await cache.match('./index.html')) || new Response('オフラインです', { status: 503 });
    })
  );
});
