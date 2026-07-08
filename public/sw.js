// PaigeAgent Push Notification Service Worker
// Handles incoming web push events and notification clicks.
// IMPORTANT: This SW does NOT cache any app assets — Vite/CDN handles freshness.
// Bumping SW_VERSION forces old workers to be replaced + clears any stray caches.

const SW_VERSION = 'paige-sw-v4';

self.addEventListener('install', (event) => {
  // Activate this SW immediately, replacing any older version
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Defensive: nuke any caches a previous SW version may have created.
      // (Older builds had Workbox precaching that caused stale-build issues.)
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (_e) {
        // ignore
      }
      await self.clients.claim();
    })()
  );
});

// Never intercept fetches — let the browser/CDN serve fresh assets every time.
// (No fetch listener on purpose.)

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'PaigeAgent', body: event.data.text() };
  }

  const title = payload.title || 'PaigeAgent';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    data: {
      url: payload.url || '/app',
      category: payload.category,
      ...(payload.data || {}),
    },
    tag: payload.tag,
    requireInteraction: payload.requireInteraction || false,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/app';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Allow the app to ask the SW to update immediately
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
