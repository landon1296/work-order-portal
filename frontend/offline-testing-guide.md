# 🧪 Offline Testing Guide

## Quick Test Steps

### 1. **First, Load the App Online**
- Open your app and navigate around all the dashboards
- Let the service worker cache all the API responses
- You should see logs like: `Service Worker: Cached API response: /workorders`

### 2. **Test Offline Functionality**
1. **Open Developer Tools** (F12)
2. **Go to Network tab**
3. **Check "Offline"** checkbox
4. **Navigate around the app** - it should still work with cached data!

### 3. **Access Offline Test Page**
- Navigate to `/offline-test` in your browser
- This page shows:
  - Connection status
  - Storage information
  - Pending updates
  - Test buttons

## What Should Happen

### ✅ **When Online:**
- All pages load normally
- API responses are cached automatically
- Console shows: `Service Worker: Cached API response: /workorders`

### ✅ **When Offline:**
- Pages still load (from cache)
- Console shows: `Service Worker: Serving from cache: /workorders`
- If no cache: `Service Worker: Serving fallback cache for: /workorders`
- Empty data structures returned instead of errors

### ✅ **Expected Behavior:**
- **Work Orders**: Show cached work orders or empty list
- **Analytics**: Show cached analytics or zero values
- **Alerts**: Show cached alerts or empty list
- **Notifications**: Show cached notifications or empty list

## Troubleshooting

### If Pages Don't Load Offline:

1. **Check Service Worker Registration:**
   ```javascript
   // In console:
   navigator.serviceWorker.ready.then(reg => console.log('SW ready:', reg))
   ```

2. **Check Cache Contents:**
   ```javascript
   // In console:
   caches.open('glls-api-cache-v1.0.1').then(cache => cache.keys()).then(keys => console.log('Cache keys:', keys.map(k => k.url)))
   ```

3. **Clear Cache and Retry:**
   - Go to Application tab in DevTools
   - Clear Storage → Clear All
   - Reload page and navigate around while online
   - Try offline again

### If You See 503 Errors:
- This means the service worker is working but no cache is available
- Navigate around while online first to build up the cache
- The new version returns empty data structures instead of 503 errors

## Testing Different Scenarios

### **Scenario 1: Fresh Install**
1. Clear all cache
2. Go online, load app, navigate around
3. Go offline - should work with cached data

### **Scenario 2: Partial Cache**
1. Load some pages online (work orders)
2. Go offline
3. Navigate to uncached pages - should show empty data

### **Scenario 3: Network Interruption**
1. Load app normally
2. Simulate network issues (slow 3G in DevTools)
3. App should still work with cached data

## Expected Console Messages

### **Online:**
```
Service Worker: Registered successfully
Service Worker: Content cached for offline use
Service Worker: Cached API response: /workorders
Service Worker: Cached API response: /api/analytics/summary
```

### **Offline:**
```
Service Worker: Network failed, trying cache for: /workorders
Service Worker: Serving from cache: /workorders
// OR if no exact cache match:
Service Worker: Serving fallback cache for: /workorders
// OR if no cache at all:
Serving offline cached data for: /workorders
```

## Success Indicators

✅ **App loads offline**  
✅ **No 503 errors**  
✅ **Cached data displays**  
✅ **Empty data for uncached endpoints**  
✅ **Offline status indicator shows**  
✅ **Console shows cache hits**  

The service worker is working correctly if you can navigate the app while offline and see either cached data or appropriate empty states instead of network errors!
