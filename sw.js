// 誤品照合 オフライン用サービスワーカー（v6）
// ・オンラインのとき：ページは常に最新版をGitHubから取得（取得できたら端末にも保存）
// ・オフラインのとき：端末に保存してある版で起動
// v3の変更：カメラ読取ライブラリの保存に失敗しても、ページ本体は必ず保存する
//           （v2は1つでも失敗すると何も保存されず、オフラインで開けなかった）
const CACHE = 'gohin-v6';
const CORE = ['./', './index.html'];
const LIB = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 前の版で保存していたカメラ読取ライブラリがあれば引き継ぐ
    for (const k of await caches.keys()) {
      if (k === CACHE) continue;
      const old = await (await caches.open(k)).match(LIB);
      if (old) { await cache.put(LIB, old); break; }
    }
    await cache.addAll(CORE);
    try {
      const res = await fetch(LIB, { mode: 'cors' });
      if (res && res.ok) await cache.put(LIB, res);
    } catch (_) { /* 次にオンラインで開いたときに保存する */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('gohin-v') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 一定時間で諦めるfetch（電波が弱いときに待たされないように）
function fetchTimeout(req, ms){
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req, { cache: 'no-store' }).then(r => { clearTimeout(t); resolve(r); }, e => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // ページ本体（index.html）はネット優先
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetchTimeout(req, 4000);
        if (res && res.ok) { cache.put('./index.html', res.clone()); return res; }
        throw new Error('bad response');
      } catch (_) {
        return (await cache.match('./index.html')) || (await cache.match('./')) ||
               new Response('オフラインです。一度オンラインで開いてください。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  // それ以外（カメラ読取ライブラリなど）は保存版優先、裏で更新
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
    const net = fetch(req)
      .then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; })
      .catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || new Response('', { status: 504 });
  })());
});
