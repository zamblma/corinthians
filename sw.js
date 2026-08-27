importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'notify') {
    self.registration.showNotification(event.data.title, {
      body: event.data.body,
      icon: 'logocorinthians.svg',
      badge: 'logocorinthians.svg',
      vibrate: [200, 100, 200],
      tag: event.data.tag || 'cor-match',
    });
  }
});
