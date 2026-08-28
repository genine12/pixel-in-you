// PIXEL IN YOU — 서비스워커
// 앱 셸: 캐시 우선 + 백그라운드 갱신 / Supabase API: 네트워크 전용
const VERSION = 'piy-v11';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/main.js',
  './js/config.js',
  './js/db.js',
  './js/game.js',
  './js/sprites.js',
  './js/store.js',
  './js/ui.js',
  './js/screens/auth.js',
  './js/screens/play.js',
  './js/screens/meta.js',
  './js/screens/story.js',
  './js/screens/tutorial.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Supabase API/스토리지는 항상 네트워크 (인증/서명 URL 캐시 금지)
  if (url.hostname.endsWith('.supabase.co')) return;

  // 폰트/CDN: stale-while-revalidate
  const isCDN = url.hostname.includes('fonts.googleapis.com')
    || url.hostname.includes('fonts.gstatic.com')
    || url.hostname.includes('cdn.jsdelivr.net');

  if (isCDN || url.origin === location.origin) {
    e.respondWith(
      caches.open(VERSION).then(async cache => {
        const cached = await cache.match(e.request);
        const fetching = fetch(e.request).then(res => {
          if (res && res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fetching;
      })
    );
  }
});
