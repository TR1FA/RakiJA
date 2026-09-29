// Keš za rad bez interneta. Kod svake izmjene aplikacije povećaj verziju.
var CACHE = 'rakija-v1';
var ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Odmah iz keša (radi i bez signala), a u pozadini osvježi keš sa mreže.
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  var network = fetch(req).then(function (res) {
    if (res.ok) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () { return null; });
  e.waitUntil(network);
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (cached) {
    return cached || network.then(function (res) {
      return res || caches.match(req.mode === 'navigate' ? 'index.html' : req);
    });
  }).then(function (res) {
    return res || new Response('', { status: 504 });
  }));
});
