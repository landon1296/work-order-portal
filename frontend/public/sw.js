// Service Worker for GLLS Work Orders App
const CACHE_NAME = 'glls-work-orders-v1.0.8';
const API_CACHE_NAME = 'glls-api-cache-v1.0.8';

// Files to cache immediately (app shell)
const urlsToCache = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/logo192.png',
  '/logo512.png'
];

// API endpoints to cache
const API_ENDPOINTS_TO_CACHE = [
  '/workorders',
  '/api/analytics/summary',
  '/api/alerts',
  '/api/masters'
];

// Install event - cache app shell
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Service Worker: Installation complete');
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Activation complete');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Only handle our app's URLs
  const isAppUrl = url.hostname.includes('localhost') || 
                   url.hostname.includes('gllsworkorder.onrender.com') ||
                   url.pathname.startsWith('/api/') ||
                   url.pathname.startsWith('/workorders');
  
  if (!isAppUrl) {
    return;
  }

  // Debug logging
  console.log('Service Worker: Intercepting request:', url.href);

  // Handle API requests
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/workorders')) {
    event.respondWith(handleApiRequest(request));
  }
  // Handle static assets
  else if (request.destination === 'script' || 
           request.destination === 'style' || 
           request.destination === 'image' ||
           request.destination === 'document') {
    event.respondWith(handleStaticRequest(request));
  }
  // Handle everything else
  else {
    event.respondWith(handleGenericRequest(request));
  }
});

// Listen for messages from the main thread to clear cache on WebSocket updates
self.addEventListener('message', (event) => {
  console.log('Service Worker: Received message:', event.data);
  if (event.data && event.data.type === 'CLEAR_API_CACHE') {
    console.log('Service Worker: Clearing API cache due to WebSocket update');
    // Clear both API cache and main cache
    Promise.all([
      caches.delete(API_CACHE_NAME),
      caches.delete(CACHE_NAME)
    ]).then(() => {
      console.log('Service Worker: All caches cleared successfully');
    }).catch(error => {
      console.error('Service Worker: Error clearing caches:', error);
    });
  }
});

// Handle API requests with network-first strategy for real-time updates
async function handleApiRequest(request) {
  const url = new URL(request.url);
  // Remove timestamp parameter for consistent caching
  const cleanUrl = url.pathname + (url.search.replace(/[?&]_t=\d+/g, '') || '');
  const cacheKey = `${request.method}-${cleanUrl}`;
  
  const cache = await caches.open(API_CACHE_NAME);
  
  try {
    // Try network first for real-time updates
    console.log('Service Worker: Fetching from network:', cleanUrl);
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache the fresh response
      await cache.put(cacheKey, networkResponse.clone());
      console.log('Service Worker: Cached fresh response:', cleanUrl);
      return networkResponse;
    } else {
      throw new Error(`Network response not ok: ${networkResponse.status}`);
    }
  } catch (error) {
    console.log('Service Worker: Network failed, trying cache:', cleanUrl, error.message);
    
    // If network fails, try cache as fallback
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      console.log('Service Worker: Serving from cache (offline):', cleanUrl);
      return cachedResponse.clone();
    }
    
    // If no cache available, return a generic error response
    return new Response(JSON.stringify({ error: 'Network unavailable and no cached data' }), {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // No exact cache match, try to find similar cached response
  const basePath = url.pathname;
  const allCacheKeys = await cache.keys();
  const matchingCache = allCacheKeys.find(cacheRequest => {
    const cacheUrl = new URL(cacheRequest.url);
    return cacheUrl.pathname === basePath && cacheRequest.method === 'GET';
  });
  
  if (matchingCache) {
    const fallbackResponse = await cache.match(matchingCache);
    if (fallbackResponse) {
      console.log('Service Worker: Serving fallback cache for:', basePath);
      return fallbackResponse.clone();
    }
  }
  
  // No cache available, try network
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      const responseClone = networkResponse.clone();
      await cache.put(cacheKey, responseClone);
      console.log('Service Worker: Cached API response:', cleanUrl);
    }
    
    return networkResponse;
  } catch (error) {
    console.log('Service Worker: Network failed for:', cleanUrl, error.message);
    
    // No cache available, return appropriate offline response
    if (request.method === 'GET') {
      // Return empty data structure instead of error
      let emptyData = [];
      if (url.pathname.includes('/workorders')) {
        emptyData = [];
      } else if (url.pathname.includes('/analytics')) {
        emptyData = {
          totalOrders: 0,
          activeOrders: 0,
          completedOrders: 0,
          pendingOrders: 0,
          revenue: 0,
          avgCompletionTime: 0
        };
      } else if (url.pathname.includes('/alerts')) {
        emptyData = [];
      } else if (url.pathname.includes('/notifications')) {
        emptyData = [];
      } else if (url.pathname.includes('/troubleshoot')) {
        emptyData = [];
      } else if (url.pathname.includes('/scheduler')) {
        emptyData = [];
      } else if (url.pathname.includes('/calllogs')) {
        emptyData = [];
      }
      
      console.log('Service Worker: Returning offline data for:', cleanUrl);
      return new Response(
        JSON.stringify(emptyData),
        { 
          status: 200, 
          headers: { 
            'Content-Type': 'application/json',
            'X-Served-From': 'offline-cache'
          } 
        }
      );
    }
    
    // For non-GET requests, return error
    return new Response(
      JSON.stringify({ 
        error: 'Offline', 
        message: 'Cannot perform this action while offline' 
      }),
      { 
        status: 503, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
}

// Handle static assets (cache first strategy)
async function handleStaticRequest(request) {
  try {
    // Try cache first for static assets
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Not in cache, fetch from network
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const responseClone = networkResponse.clone();
      await cache.put(request, responseClone);
    }
    
    return networkResponse;
  } catch (error) {
    console.log('Service Worker: Failed to fetch static asset:', request.url);
    
    // Return a fallback or error page
    if (request.destination === 'document') {
      return caches.match('/');
    }
    
    return new Response('Offline', { status: 503 });
  }
}

// Handle generic requests
async function handleGenericRequest(request) {
  try {
    const networkResponse = await fetch(request);
    return networkResponse;
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Fallback to home page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/');
    }
    
    return new Response('Offline', { status: 503 });
  }
}

// Background sync for work order updates
self.addEventListener('sync', (event) => {
  if (event.tag === 'work-order-sync') {
    console.log('Service Worker: Background sync triggered');
    event.waitUntil(syncWorkOrders());
  }
});

// Sync work orders when connection is restored
async function syncWorkOrders() {
  try {
    // Get pending work orders from IndexedDB or localStorage
    const pendingUpdates = await getPendingUpdates();
    
    for (const update of pendingUpdates) {
      try {
        await fetch('/workorders', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update)
        });
        
        console.log('Service Worker: Synced work order:', update.work_order_no);
        await removePendingUpdate(update.id);
      } catch (error) {
        console.log('Service Worker: Failed to sync work order:', update.work_order_no);
      }
    }
  } catch (error) {
    console.log('Service Worker: Background sync failed:', error);
  }
}

// Helper functions for pending updates
async function getPendingUpdates() {
  // This would integrate with your existing data storage
  // For now, return empty array
  return [];
}

async function removePendingUpdate(id) {
  // Remove from pending updates storage
  console.log('Service Worker: Removed pending update:', id);
}

// Push notification handling
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/logo192.png',
      badge: '/logo192.png',
      data: data.data,
      actions: [
        {
          action: 'view',
          title: 'View Work Order',
          icon: '/logo192.png'
        },
        {
          action: 'dismiss',
          title: 'Dismiss'
        }
      ]
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/dashboard')
    );
  }
});

console.log('Service Worker: Loaded successfully');
