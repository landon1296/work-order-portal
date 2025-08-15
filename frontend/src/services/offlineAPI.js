import { baseAPI } from '../api';
import offlineStorage from './offlineStorage';

class OfflineAPI {
  constructor() {
    this.isOnline = navigator.onLine;
    this.syncQueue = [];
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.syncPendingChanges();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  async get(endpoint) {
    try {
      if (this.isOnline) {
        const response = await baseAPI.get(endpoint);
        
        // Cache the response
        if (endpoint.includes('/workorders')) {
          await offlineStorage.saveWorkOrders(response.data);
        }
        
        return response;
      } else {
        // Return cached data
        const cachedData = await offlineStorage.getWorkOrders();
        return { data: cachedData };
      }
    } catch (error) {
      console.error('API request failed:', error);
      
      // Fallback to cached data
      if (endpoint.includes('/workorders')) {
        const cachedData = await offlineStorage.getWorkOrders();
        return { data: cachedData };
      }
      
      throw error;
    }
  }

  async post(endpoint, data) {
    try {
      if (this.isOnline) {
        const response = await baseAPI.post(endpoint, data);
        return response;
      } else {
        // Queue for later sync
        await offlineStorage.savePendingChange({
          type: 'POST',
          endpoint,
          data,
          timestamp: Date.now()
        });
        
        // Return optimistic response
        return { data: { ...data, id: Date.now(), synced: false } };
      }
    } catch (error) {
      console.error('POST request failed:', error);
      throw error;
    }
  }

  async put(endpoint, data) {
    try {
      if (this.isOnline) {
        const response = await baseAPI.put(endpoint, data);
        return response;
      } else {
        // Queue for later sync
        await offlineStorage.savePendingChange({
          type: 'PUT',
          endpoint,
          data,
          timestamp: Date.now()
        });
        
        // Update local cache
        const workOrders = await offlineStorage.getWorkOrders();
        const updatedWorkOrders = workOrders.map(wo => 
          wo.workOrderNo === data.workOrderNo ? { ...wo, ...data, synced: false } : wo
        );
        await offlineStorage.saveWorkOrders(updatedWorkOrders);
        
        return { data: { ...data, synced: false } };
      }
    } catch (error) {
      console.error('PUT request failed:', error);
      throw error;
    }
  }

  async delete(endpoint) {
    try {
      if (this.isOnline) {
        const response = await baseAPI.delete(endpoint);
        return response;
      } else {
        // Queue for later sync
        await offlineStorage.savePendingChange({
          type: 'DELETE',
          endpoint,
          timestamp: Date.now()
        });
        
        return { data: { success: true, synced: false } };
      }
    } catch (error) {
      console.error('DELETE request failed:', error);
      throw error;
    }
  }

  async syncPendingChanges() {
    if (!this.isOnline) return;

    try {
      const pendingChanges = await offlineStorage.getPendingChanges();
      
      for (const change of pendingChanges) {
        try {
          switch (change.type) {
            case 'POST':
              await baseAPI.post(change.endpoint, change.data);
              break;
            case 'PUT':
              await baseAPI.put(change.endpoint, change.data);
              break;
            case 'DELETE':
              await baseAPI.delete(change.endpoint);
              break;
          }
        } catch (error) {
          console.error('Failed to sync change:', change, error);
          // Keep in queue for retry
          continue;
        }
      }
      
      // Clear successfully synced changes
      await offlineStorage.clearPendingChanges();
      
      // Refresh cached data
      const response = await baseAPI.get('/workorders');
      await offlineStorage.saveWorkOrders(response.data);
      
    } catch (error) {
      console.error('Sync failed:', error);
    }
  }

  async initializeOfflineStorage() {
    await offlineStorage.init();
    
          // Load initial data if online
      if (this.isOnline) {
        try {
          const response = await baseAPI.get('/workorders');
        await offlineStorage.saveWorkOrders(response.data);
      } catch (error) {
        console.error('Failed to load initial data:', error);
      }
    }
  }
}

export default new OfflineAPI();
