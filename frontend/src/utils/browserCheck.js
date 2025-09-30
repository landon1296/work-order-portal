// Browser compatibility checker for service worker features
export const browserCheck = {
  // Check if service workers are supported
  supportsServiceWorker() {
    const supported = 'serviceWorker' in navigator;
    console.log('Service Worker support:', supported);
    return supported;
  },

  // Check if cache API is supported
  supportsCache() {
    const supported = 'caches' in window;
    console.log('Cache API support:', supported);
    return supported;
  },

  // Check if fetch API is supported
  supportsFetch() {
    const supported = 'fetch' in window;
    console.log('Fetch API support:', supported);
    return supported;
  },

  // Check HTTPS requirement
  isSecure() {
    const isSecure = window.location.protocol === 'https:' || 
                     window.location.hostname === 'localhost' ||
                     window.location.hostname === '127.0.0.1';
    console.log('Secure context:', isSecure);
    return isSecure;
  },

  // Get browser information
  getBrowserInfo() {
    const userAgent = navigator.userAgent;
    let browser = 'Unknown';
    let version = 'Unknown';

    if (userAgent.includes('Chrome')) {
      browser = 'Chrome';
      const match = userAgent.match(/Chrome\/(\d+)/);
      version = match ? match[1] : 'Unknown';
    } else if (userAgent.includes('Firefox')) {
      browser = 'Firefox';
      const match = userAgent.match(/Firefox\/(\d+)/);
      version = match ? match[1] : 'Unknown';
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      browser = 'Safari';
      const match = userAgent.match(/Version\/(\d+)/);
      version = match ? match[1] : 'Unknown';
    } else if (userAgent.includes('Edge')) {
      browser = 'Edge';
      const match = userAgent.match(/Edge\/(\d+)/);
      version = match ? match[1] : 'Unknown';
    } else if (userAgent.includes('MSIE') || userAgent.includes('Trident')) {
      browser = 'Internet Explorer';
    }

    return { browser, version, userAgent };
  },

  // Check if browser version supports service workers
  supportsServiceWorkerVersion() {
    const { browser, version } = this.getBrowserInfo();
    
    const requirements = {
      'Chrome': 40,
      'Firefox': 44,
      'Safari': 11,
      'Edge': 17
    };

    if (browser === 'Internet Explorer') {
      return false;
    }

    if (browser === 'Unknown') {
      return true; // Assume supported if we can't detect
    }

    const requiredVersion = requirements[browser];
    if (!requiredVersion) {
      return true; // Unknown browser, assume supported
    }

    const versionNum = parseInt(version);
    return versionNum >= requiredVersion;
  },

  // Run full compatibility check
  runCompatibilityCheck() {
    console.log('=== Browser Compatibility Check ===');
    
    const browserInfo = this.getBrowserInfo();
    console.log('Browser:', browserInfo.browser, browserInfo.version);
    
    const results = {
      serviceWorker: this.supportsServiceWorker(),
      cache: this.supportsCache(),
      fetch: this.supportsFetch(),
      secure: this.isSecure(),
      versionCompatible: this.supportsServiceWorkerVersion()
    };

    console.log('Compatibility Results:', results);

    const allSupported = Object.values(results).every(result => result);
    
    if (allSupported) {
      console.log('✅ All features supported - Service Worker should work');
    } else {
      console.log('❌ Some features not supported - Service Worker may not work');
      console.log('Issues found:');
      Object.entries(results).forEach(([feature, supported]) => {
        if (!supported) {
          console.log(`  - ${feature}: Not supported`);
        }
      });
    }

    return results;
  },

  // Get recommendations for unsupported browsers
  getRecommendations() {
    const results = this.runCompatibilityCheck();
    const { browser, version } = this.getBrowserInfo();
    
    const recommendations = [];

    if (!results.serviceWorker) {
      recommendations.push('Service Workers not supported - consider updating browser');
    }

    if (!results.secure) {
      recommendations.push('Not in secure context - Service Workers require HTTPS');
    }

    if (browser === 'Internet Explorer') {
      recommendations.push('Internet Explorer not supported - use Chrome, Firefox, or Edge');
    }

    if (browser === 'Safari' && parseInt(version) < 11) {
      recommendations.push('Safari version too old - update to Safari 11.1 or later');
    }

    if (recommendations.length > 0) {
      console.log('Recommendations:');
      recommendations.forEach(rec => console.log(`  - ${rec}`));
    }

    return recommendations;
  }
};

// Make it available globally for debugging
if (typeof window !== 'undefined') {
  window.browserCheck = browserCheck;
}
