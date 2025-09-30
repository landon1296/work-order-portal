// Service Worker Registration and Management
const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
  window.location.hostname === '[::1]' ||
  window.location.hostname.match(
    /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/
  )
);

// Browser compatibility checker
function runBrowserCheck() {
  console.log('=== Browser Compatibility Check ===');
  
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

  const serviceWorkerSupport = 'serviceWorker' in navigator;
  const cacheSupport = 'caches' in window;
  const fetchSupport = 'fetch' in window;
  const isSecure = window.location.protocol === 'https:' || 
                   window.location.hostname === 'localhost' ||
                   window.location.hostname === '127.0.0.1';

  console.log('Browser:', browser, version);
  console.log('Service Worker support:', serviceWorkerSupport);
  console.log('Cache API support:', cacheSupport);
  console.log('Fetch API support:', fetchSupport);
  console.log('Secure context:', isSecure);
  console.log('User Agent:', userAgent);

  // Check version requirements
  const requirements = {
    'Chrome': 40,
    'Firefox': 44,
    'Safari': 11,
    'Edge': 17
  };

  let versionCompatible = true;
  if (browser === 'Internet Explorer') {
    versionCompatible = false;
    console.log('❌ Internet Explorer not supported');
  } else if (browser !== 'Unknown' && requirements[browser]) {
    const versionNum = parseInt(version);
    versionCompatible = versionNum >= requirements[browser];
    if (!versionCompatible) {
      console.log(`❌ ${browser} version ${version} too old, need ${requirements[browser]}+`);
    }
  }

  const allSupported = serviceWorkerSupport && cacheSupport && fetchSupport && isSecure && versionCompatible;
  
  if (allSupported) {
    console.log('✅ All features supported - Service Worker should work');
  } else {
    console.log('❌ Some features not supported - Service Worker may not work');
    if (!serviceWorkerSupport) console.log('  - Service Workers not supported');
    if (!cacheSupport) console.log('  - Cache API not supported');
    if (!fetchSupport) console.log('  - Fetch API not supported');
    if (!isSecure) console.log('  - Not in secure context (need HTTPS)');
    if (!versionCompatible) console.log('  - Browser version too old');
  }

  return {
    browser,
    version,
    serviceWorker: serviceWorkerSupport,
    cache: cacheSupport,
    fetch: fetchSupport,
    secure: isSecure,
    versionCompatible,
    allSupported
  };
}

export function register() {
  // Run browser compatibility check
  const compatibility = runBrowserCheck();
  
  if ('serviceWorker' in navigator) {
    console.log('Service Worker: Browser supports service workers');
    
    const publicUrl = new URL(process.env.PUBLIC_URL, window.location.href);
    if (publicUrl.origin !== window.location.origin) {
      console.log('Service Worker: Skipping registration - different origin');
      return;
    }

    window.addEventListener('load', () => {
      const swUrl = `${process.env.PUBLIC_URL}/sw.js`;
      console.log('Service Worker: Attempting to register at:', swUrl);

      if (isLocalhost) {
        checkValidServiceWorker(swUrl);
        navigator.serviceWorker.ready.then(() => {
          console.log('Service Worker: Ready in development mode');
          // Add diagnostic logging
          setTimeout(() => {
            navigator.serviceWorker.getRegistrations().then(regs => {
              console.log('Service Worker: Active registrations:', regs.length);
              regs.forEach((reg, i) => {
                console.log(`Service Worker ${i + 1}:`, {
                  scope: reg.scope,
                  state: reg.active ? reg.active.state : 'no active worker',
                  scriptURL: reg.active ? reg.active.scriptURL : 'no active worker'
                });
              });
            });
          }, 2000);
        });
      } else {
        registerValidSW(swUrl);
      }
    });
  } else {
    console.warn('Service Worker: Browser does not support service workers');
  }
}

function registerValidSW(swUrl) {
  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      console.log('Service Worker: Registered successfully');
      
      // Add diagnostic logging for production
      setTimeout(() => {
        navigator.serviceWorker.getRegistrations().then(regs => {
          console.log('Service Worker: Active registrations:', regs.length);
          regs.forEach((reg, i) => {
            console.log(`Service Worker ${i + 1}:`, {
              scope: reg.scope,
              state: reg.active ? reg.active.state : 'no active worker',
              scriptURL: reg.active ? reg.active.scriptURL : 'no active worker'
            });
          });
        });
      }, 2000);
      
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (installingWorker == null) {
          return;
        }
        
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              console.log('Service Worker: New content available');
              // Show update notification to user
              showUpdateNotification();
            } else {
              console.log('Service Worker: Content cached for offline use');
            }
          }
        };
      };
    })
    .catch((error) => {
      console.error('Service Worker: Registration failed', error);
    });
}

function checkValidServiceWorker(swUrl) {
  fetch(swUrl, {
    headers: { 'Service-Worker': 'script' },
  })
    .then((response) => {
      const contentType = response.headers.get('content-type');
      if (
        response.status === 404 ||
        (contentType != null && contentType.indexOf('javascript') === -1)
      ) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => {
            window.location.reload();
          });
        });
      } else {
        registerValidSW(swUrl);
      }
    })
    .catch(() => {
      console.log('Service Worker: No internet connection found');
    });
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        console.error(error.message);
      });
  }
}

// Show update notification to user
function showUpdateNotification() {
  if (confirm('New version available! Reload to update?')) {
    window.location.reload();
  }
}

// Check if app is online/offline
export function isOnline() {
  return navigator.onLine;
}

// Listen for online/offline events
export function onOnlineStatusChange(callback) {
  window.addEventListener('online', () => callback(true));
  window.addEventListener('offline', () => callback(false));
}

// Get service worker registration
export function getRegistration() {
  return navigator.serviceWorker.ready;
}

// Send message to service worker
export function sendMessageToSW(message) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(message);
  }
}

// Request background sync
export function requestBackgroundSync(tag = 'work-order-sync') {
  if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
    navigator.serviceWorker.ready.then((registration) => {
      return registration.sync.register(tag);
    });
  }
}

// Cache API response manually
export async function cacheApiResponse(url, response) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CACHE_API_RESPONSE',
      url,
      response: await response.clone().json()
    });
  }
}
