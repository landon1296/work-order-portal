// Debug utility for testing service worker cache
export const debugCache = {
  // Check what's in the cache
  async checkCache() {
    try {
      const cacheNames = await caches.keys();
      console.log('Available caches:', cacheNames);
      
      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        console.log(`Cache "${cacheName}" contains:`, keys.map(k => k.url));
      }
    } catch (error) {
      console.error('Error checking cache:', error);
    }
  },

  // Clear all caches
  async clearAllCaches() {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
      console.log('All caches cleared');
    } catch (error) {
      console.error('Error clearing caches:', error);
    }
  },

  // Test offline functionality
  async testOffline() {
    console.log('Testing offline functionality...');
    
    // Check service worker status
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      console.log('Service Worker ready:', registration);
    }
    
    // Check cache contents
    await this.checkCache();
    
    // Test API calls
    const testUrls = [
      '/workorders',
      '/api/analytics/summary',
      '/api/alerts',
      '/api/notifications'
    ];
    
    for (const url of testUrls) {
      try {
        const response = await fetch(url);
        console.log(`Fetch ${url}:`, response.status, response.headers.get('x-served-from'));
      } catch (error) {
        console.log(`Fetch ${url} failed:`, error.message);
      }
    }
  }
};

// Make it available globally for debugging
if (typeof window !== 'undefined') {
  window.debugCache = debugCache;
}
