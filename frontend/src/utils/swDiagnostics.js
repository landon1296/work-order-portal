// Service Worker Diagnostics for troubleshooting
export const swDiagnostics = {
  // Check service worker registration status
  async checkRegistration() {
    console.log('=== Service Worker Registration Check ===');
    
    if (!('serviceWorker' in navigator)) {
      console.log('❌ Service Worker not supported in this browser');
      return false;
    }
    
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      console.log('Service Worker registrations found:', registrations.length);
      
      if (registrations.length === 0) {
        console.log('❌ No service worker registrations found');
        return false;
      }
      
      registrations.forEach((reg, i) => {
        console.log(`Service Worker ${i + 1}:`, {
          scope: reg.scope,
          state: reg.active ? reg.active.state : 'no active worker',
          scriptURL: reg.active ? reg.active.scriptURL : 'no active worker'
        });
      });
      
      return true;
    } catch (error) {
      console.error('Error checking service worker registration:', error);
      return false;
    }
  },

  // Check cache contents
  async checkCache() {
    console.log('=== Cache Contents Check ===');
    
    if (!('caches' in window)) {
      console.log('❌ Cache API not supported');
      return;
    }
    
    try {
      const cacheNames = await caches.keys();
      console.log('Available caches:', cacheNames);
      
      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        console.log(`Cache "${cacheName}" contains ${keys.length} entries:`);
        keys.forEach(key => {
          console.log(`  - ${key.url}`);
        });
      }
    } catch (error) {
      console.error('Error checking cache:', error);
    }
  },

  // Test fetch interception
  async testFetchInterception() {
    console.log('=== Fetch Interception Test ===');
    
    const testUrl = '/workorders';
    console.log(`Testing fetch to: ${testUrl}`);
    
    try {
      const response = await fetch(testUrl);
      console.log('Fetch response:', {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        url: response.url
      });
    } catch (error) {
      console.error('Fetch failed:', error);
    }
  },

  // Run all diagnostics
  async runAllDiagnostics() {
    console.log('🔍 Running Service Worker Diagnostics...');
    
    const registrationOk = await this.checkRegistration();
    await this.checkCache();
    
    if (registrationOk) {
      await this.testFetchInterception();
    }
    
    console.log('✅ Diagnostics complete');
  }
};

// Make it available globally
if (typeof window !== 'undefined') {
  window.swDiagnostics = swDiagnostics;
}
