// Service worker to unregister itself
self.addEventListener('install', function(event) {
  console.log('Service worker installing...');
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('Service worker activating...');
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Unregister this service worker
      self.registration.unregister()
    ])
  );
});

self.addEventListener('fetch', function(event) {
  // Let all requests pass through to the network
  event.respondWith(fetch(event.request));
});
