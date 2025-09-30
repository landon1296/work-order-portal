// Offline storage utilities for work order app
const STORAGE_KEYS = {
  PENDING_UPDATES: 'glls_pending_updates',
  CACHED_WORK_ORDERS: 'glls_cached_work_orders',
  USER_DATA: 'glls_user_data'
};

// Store pending updates when offline
export function storePendingUpdate(update) {
  try {
    const pendingUpdates = getPendingUpdates();
    const newUpdate = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      ...update
    };
    
    pendingUpdates.push(newUpdate);
    localStorage.setItem(STORAGE_KEYS.PENDING_UPDATES, JSON.stringify(pendingUpdates));
    
    console.log('Stored pending update:', newUpdate.id);
    return newUpdate.id;
  } catch (error) {
    console.error('Failed to store pending update:', error);
    return null;
  }
}

// Get all pending updates
export function getPendingUpdates() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.PENDING_UPDATES);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to get pending updates:', error);
    return [];
  }
}

// Remove pending update after successful sync
export function removePendingUpdate(id) {
  try {
    const pendingUpdates = getPendingUpdates();
    const filtered = pendingUpdates.filter(update => update.id !== id);
    localStorage.setItem(STORAGE_KEYS.PENDING_UPDATES, JSON.stringify(filtered));
    
    console.log('Removed pending update:', id);
  } catch (error) {
    console.error('Failed to remove pending update:', error);
  }
}

// Clear all pending updates
export function clearPendingUpdates() {
  try {
    localStorage.removeItem(STORAGE_KEYS.PENDING_UPDATES);
    console.log('Cleared all pending updates');
  } catch (error) {
    console.error('Failed to clear pending updates:', error);
  }
}

// Cache work order data for offline viewing
export function cacheWorkOrders(workOrders) {
  try {
    const cacheData = {
      data: workOrders,
      timestamp: new Date().toISOString(),
      count: workOrders.length
    };
    
    localStorage.setItem(STORAGE_KEYS.CACHED_WORK_ORDERS, JSON.stringify(cacheData));
    console.log('Cached work orders:', workOrders.length);
  } catch (error) {
    console.error('Failed to cache work orders:', error);
  }
}

// Get cached work orders
export function getCachedWorkOrders() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.CACHED_WORK_ORDERS);
    if (stored) {
      const cacheData = JSON.parse(stored);
      const age = new Date() - new Date(cacheData.timestamp);
      
      // Consider cache stale after 1 hour
      if (age < 60 * 60 * 1000) {
        console.log('Using cached work orders:', cacheData.count);
        return cacheData.data;
      } else {
        console.log('Cached work orders are stale');
        return null;
      }
    }
    return null;
  } catch (error) {
    console.error('Failed to get cached work orders:', error);
    return null;
  }
}

// Store user data for offline access
export function cacheUserData(userData) {
  try {
    const cacheData = {
      data: userData,
      timestamp: new Date().toISOString()
    };
    
    localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(cacheData));
    console.log('Cached user data');
  } catch (error) {
    console.error('Failed to cache user data:', error);
  }
}

// Get cached user data
export function getCachedUserData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.USER_DATA);
    if (stored) {
      const cacheData = JSON.parse(stored);
      const age = new Date() - new Date(cacheData.timestamp);
      
      // Consider cache stale after 24 hours
      if (age < 24 * 60 * 60 * 1000) {
        return cacheData.data;
      }
    }
    return null;
  } catch (error) {
    console.error('Failed to get cached user data:', error);
    return null;
  }
}

// Get storage usage info
export function getStorageInfo() {
  try {
    const pendingUpdates = getPendingUpdates();
    const cachedWorkOrders = getCachedWorkOrders();
    const cachedUserData = getCachedUserData();
    
    return {
      pendingUpdates: pendingUpdates.length,
      hasCachedWorkOrders: !!cachedWorkOrders,
      hasCachedUserData: !!cachedUserData,
      totalSize: JSON.stringify({
        pendingUpdates,
        cachedWorkOrders,
        cachedUserData
      }).length
    };
  } catch (error) {
    console.error('Failed to get storage info:', error);
    return {
      pendingUpdates: 0,
      hasCachedWorkOrders: false,
      hasCachedUserData: false,
      totalSize: 0
    };
  }
}

// Clear all cached data
export function clearAllCache() {
  try {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    console.log('Cleared all cached data');
  } catch (error) {
    console.error('Failed to clear cache:', error);
  }
}
