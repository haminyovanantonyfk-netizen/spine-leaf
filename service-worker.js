/* SpineLeaf service worker — offline-first. All app files and OCR models
   are cached on this device; the app makes no network calls with your data. */
const CACHE = 'spineleaf-v1';
const ASSETS = [
  './', 'index.html', 'styles.css', 'app.js', 'db.js', 'imaging.js', 'ocr.js', 'reader.js',
  'manifest.webmanifest', 'icon.svg',
  'vendor/regenerator-runtime.js', 'vendor/pdf-lib.min.js', 'vendor/fontkit.umd.min.js',
  'vendor/tesseract.min.js', 'vendor/worker.min.js',
  'vendor/tesseract-core/tesseract-core-simd-lstm.js', 'vendor/tesseract-core/tesseract-core-simd-lstm.wasm',
  'vendor/tesseract-core/tesseract-core-lstm.js', 'vendor/tesseract-core/tesseract-core-lstm.wasm',
  'vendor/tessdata/eng.traineddata.gz', 'vendor/tessdata/mal.traineddata.gz',
  'vendor/fonts/NotoSansMalayalam-Regular.ttf',
  'vendor/pdf.min.mjs', 'vendor/pdf.worker.min.mjs'
];
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(ASSETS.map(async a => { try { await cache.add(a); } catch (err) { /* tolerate misses */ } }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(e.request);
      if (res.ok && new URL(e.request.url).origin === location.origin) cache.put(e.request, res.clone());
      return res;
    } catch (err) {
      if (e.request.mode === 'navigate') return cache.match('index.html');
      throw err;
    }
  })());
});
