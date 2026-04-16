const VERSION = 'v10-llega-luca';
const SHELL_CACHE = 'llega-luca-shell-' + VERSION;
const DATA_CACHE = 'llega-luca-data-' + VERSION;
const PHOTO_CACHE = 'llega-luca-photos-' + VERSION;
const SHELL = [
  './',
  './index.html',
  './parental-leave.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];
const SUPABASE_HOST = 'voirsxfjdayhhvwviaqt.supabase.co';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  const keep = new Set([SHELL_CACHE, DATA_CACHE, PHOTO_CACHE]);
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => !keep.has(k)).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

function isSupabaseRest(url) {
  return url.host === SUPABASE_HOST && url.pathname.startsWith('/rest/v1/');
}
function isSupabasePhoto(url) {
  return url.host === SUPABASE_HOST && url.pathname.startsWith('/storage/v1/object/public/birth-photos/');
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Supabase REST: network-first, fall back to cache (so feed works offline)
  if (isSupabaseRest(url)) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const copy = fresh.clone();
          caches.open(DATA_CACHE).then(c => c.put(req, copy));
        }
        return fresh;
      } catch (_) {
        const cached = await caches.match(req, { cacheName: DATA_CACHE });
        if (cached) return cached;
        throw _;
      }
    })());
    return;
  }

  // Supabase photos: cache-first (immutable URLs), network fallback
  if (isSupabasePhoto(url)) {
    e.respondWith((async () => {
      const cached = await caches.match(req, { cacheName: PHOTO_CACHE });
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const copy = fresh.clone();
          caches.open(PHOTO_CACHE).then(c => c.put(req, copy));
        }
        return fresh;
      } catch (_) { throw _; }
    })());
    return;
  }

  // Same-origin shell: cache-first with background refresh
  if (url.origin === self.location.origin) {
    if (url.pathname.includes('/Documents/')) return; // always fresh
    e.respondWith(
      caches.match(req).then(cached => {
        const network = fetch(req).then(res => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then(c => c.put(req, copy));
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }
});

// Notification click: focus or open the page
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.includes(self.registration.scope)) { c.focus(); return; }
    }
    self.clients.openWindow(self.registration.scope);
  })());
});

// Push handler scaffold (requires VAPID + edge function to actually deliver)
self.addEventListener('push', e => {
  let data = { title: '¡Llegó Luca!', body: 'Acaba de nacer.' };
  try { if (e.data) data = Object.assign(data, e.data.json()); } catch(_) {}
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: 'luca-born'
  }));
});
