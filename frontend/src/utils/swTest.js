// Simple service worker test utility
export const swTest = {
  // Test if service worker file is accessible
  async testSwFile() {
    console.log('=== Testing Service Worker File Access ===');
    
    const swUrl = '/sw.js';
    try {
      const response = await fetch(swUrl);
      console.log('Service Worker file response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        url: response.url
      });
      
      if (response.ok) {
        const content = await response.text();
        console.log('Service Worker file content length:', content.length);
        console.log('First 200 characters:', content.substring(0, 200));
      }
      
      return response.ok;
    } catch (error) {
      console.error('Error accessing service worker file:', error);
      return false;
    }
  },

  // Test service worker registration manually
  async testRegistration() {
    console.log('=== Testing Manual Service Worker Registration ===');
    
    if (!('serviceWorker' in navigator)) {
      console.log('❌ Service Worker not supported');
      return false;
    }
    
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('✅ Manual registration successful:', registration);
      return true;
    } catch (error) {
      console.error('❌ Manual registration failed:', error);
      return false;
    }
  },

  // Run all tests
  async runAllTests() {
    console.log('🧪 Running Service Worker Tests...');
    
    const fileAccess = await this.testSwFile();
    if (fileAccess) {
      await this.testRegistration();
    }
    
    console.log('✅ Tests complete');
  }
};

// Make it available globally
if (typeof window !== 'undefined') {
  window.swTest = swTest;
}
