try {
  importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
} catch (e) {
  // Offline or blocked CDN: keep local PWA Service Worker active
}

const CACHE_NAME = 'corinthians-tracker-v3';
const SHELL_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './logocorinthians.svg',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML/JSON/JS/CSS so data is always fresh, fallback to cache offline
  event.respondWith(
    fetch(req)
      .then(resp => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'notify') {
    event.waitUntil(
      self.registration.showNotification(event.data.title, {
        body: event.data.body,
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        vibrate: [250, 100, 300],
        tag: event.data.tag || 'cor-match',
        renotify: true,
        data: { url: event.data.url || './' },
      })
    );
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('periodicsync', event => {
  if (event.tag === 'corinthians-live-check') {
    event.waitUntil(
      fetch('./matches.json?' + Date.now())
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (!data || !Array.isArray(data.corinthiansMatches)) return;
          const live = data.corinthiansMatches.find(m => m.status === 'live');
          if (live) {
            return self.registration.showNotification('⚽ Corinthians AO VIVO!', {
              body: `${live.homeTeam} ${live.homeGoals ?? 0} x ${live.awayGoals ?? 0} ${live.awayTeam} (${live.championship})`,
              icon: 'icon-192.png',
              badge: 'icon-192.png',
              tag: `live-${live.date}-${live.opponent}`,
              renotify: false,
              data: { url: './' },
            });
          }
        })
        .catch(() => {})
    );
  }
});
