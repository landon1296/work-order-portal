import { io } from 'socket.io-client';
import React from 'react';

class WorkOrderWebSocket {
  constructor() {
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.listeners = new Map();
    this.connected = false;
  }

  connect(token = null) {
    // Prevent multiple connections
    if (this.connected && this.socket) {
      console.log('WebSocket: Already connected, skipping new connection');
      return;
    }
    
    // Determine WebSocket URL based on environment
    const wsUrl = process.env.REACT_APP_WS_URL || 
                  (process.env.REACT_APP_API_URL || 
                    'http://localhost:4000');
    
    console.log('Connecting to WebSocket:', wsUrl);
    
    this.socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      timeout: 20000,
      forceNew: false  // Don't force new connection
    });
    
    this.socket.on('connect', () => {
      console.log('WebSocket connected:', this.socket.id);
      this.connected = true;
      this.reconnectAttempts = 0;
      
      // Authenticate if token provided
      if (token) {
        this.socket.emit('authenticate', token);
      }
      
      // Join general updates room
      this.socket.emit('join-updates');
      
      this.notifyListeners('connected', { socketId: this.socket.id });
    });
    
    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      this.connected = false;
      this.notifyListeners('disconnected', { reason });
      
      // Attempt to reconnect
      if (reason !== 'io client disconnect') {
        this.attemptReconnect();
      }
    });
    
    this.socket.on('workorder-update', (data) => {
      console.log('Received work order update:', data);
      this.notifyListeners('workorder-update', data);
    });
    
    this.socket.on('data-refresh', (data) => {
      console.log('Received data refresh:', data);
      this.notifyListeners('data-refresh', data);
    });
    
    this.socket.on('notification', (data) => {
      console.log('Received notification:', data);
      this.notifyListeners('notification', data);
    });
    
    this.socket.on('alert', (data) => {
      console.log('Received alert:', data);
      this.notifyListeners('alert', data);
    });
    
    this.socket.on('user-activity', (data) => {
      console.log('Received user activity:', data);
      this.notifyListeners('user-activity', data);
    });
    
    this.socket.on('user-left', (data) => {
      console.log('Received user left:', data);
      this.notifyListeners('user-left', data);
    });
    
    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.notifyListeners('error', error);
    });
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      
      console.log(`Attempting to reconnect in ${delay}ms... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        if (!this.connected) {
          this.connect();
        }
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
      this.notifyListeners('reconnect-failed', { attempts: this.reconnectAttempts });
    }
  }

  joinWorkOrder(workOrderNo) {
    if (this.socket && this.connected) {
      this.socket.emit('join-workorder', workOrderNo);
      console.log(`Joined work order room: ${workOrderNo}`);
    }
  }

  leaveWorkOrder(workOrderNo) {
    if (this.socket && this.connected) {
      this.socket.emit('leave-workorder', workOrderNo);
      console.log(`Left work order room: ${workOrderNo}`);
    }
  }

  subscribe(eventType, callback) {
    console.log(`WebSocket: Subscribing to ${eventType}`);
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType).push(callback);
    console.log(`WebSocket: Total listeners for ${eventType}:`, this.listeners.get(eventType).length);
    
    // Return unsubscribe function
    return () => {
      this.unsubscribe(eventType, callback);
    };
  }

  unsubscribe(eventType, callback) {
    if (this.listeners.has(eventType)) {
      const callbacks = this.listeners.get(eventType);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  notifyListeners(eventType, payload) {
    console.log(`WebSocket: Notifying ${eventType} to`, this.listeners.has(eventType) ? this.listeners.get(eventType).length : 0, 'listeners');
    if (this.listeners.has(eventType)) {
      this.listeners.get(eventType).forEach((callback, index) => {
        try {
          console.log(`WebSocket: Calling listener ${index} for ${eventType}`);
          callback(payload);
        } catch (error) {
          console.error(`Error in WebSocket listener for ${eventType}:`, error);
        }
      });
    }
    
    // Also notify the persistent manager's global subscriptions
    if (typeof persistentWSManager !== 'undefined' && persistentWSManager.globalSubscriptions.has(eventType)) {
      console.log(`WebSocket: Also notifying persistent manager for ${eventType}`);
      persistentWSManager.globalSubscriptions.get(eventType).forEach((callback, index) => {
        try {
          console.log(`WebSocket: Calling persistent listener ${index} for ${eventType}`);
          callback(payload);
        } catch (error) {
          console.error(`Error in persistent ${eventType} listener:`, error);
        }
      });
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  getConnectionStatus() {
    return {
      connected: this.connected,
      socketId: this.socket?.id,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

// Create singleton instance
export const workOrderWS = new WorkOrderWebSocket();

// Global persistent WebSocket manager
class PersistentWebSocketManager {
  constructor() {
    this.globalSubscriptions = new Map();
    this.isInitialized = false;
    this.managerDashboardRefetch = null;
    this.workOrderFormRefetch = new Map(); // Map of workOrderNo -> refetch function
  }

  initialize(token) {
    if (this.isInitialized) {
      console.log('PersistentWebSocketManager: Already initialized');
      return;
    }
    
    console.log('PersistentWebSocketManager: Initializing with token');
    this.isInitialized = true;
    
    if (!workOrderWS.connected) {
      workOrderWS.connect(token);
    }
    
    // Set up global subscriptions that persist across component mounts/unmounts
    this.setupGlobalSubscriptions();
  }

  registerManagerDashboard(refetchFunction) {
    console.log('PersistentWebSocketManager: Registering ManagerDashboard refetch function');
    this.managerDashboardRefetch = refetchFunction;
  }

  unregisterManagerDashboard() {
    console.log('PersistentWebSocketManager: Unregistering ManagerDashboard refetch function');
    this.managerDashboardRefetch = null;
  }

  registerWorkOrderForm(workOrderNo, refetchFunction) {
    console.log(`PersistentWebSocketManager: Registering work order form refetch for ${workOrderNo}`);
    this.workOrderFormRefetch.set(workOrderNo, refetchFunction);
  }

  unregisterWorkOrderForm(workOrderNo) {
    console.log(`PersistentWebSocketManager: Unregistering work order form refetch for ${workOrderNo}`);
    this.workOrderFormRefetch.delete(workOrderNo);
  }

  setupGlobalSubscriptions() {
    console.log('PersistentWebSocketManager: Setting up global subscriptions');
    
    // Subscribe to work order updates globally
    const unsubscribeWorkOrderUpdate = workOrderWS.subscribe('workorder-update', (data) => {
      console.log('PersistentWebSocketManager: Global work order update received:', data);
      
      // Call ManagerDashboard refetch directly if registered
      if (this.managerDashboardRefetch) {
        console.log('PersistentWebSocketManager: Calling ManagerDashboard refetch directly');
        
        // Clear service worker cache to ensure fresh data
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          console.log('PersistentWebSocketManager: Sending CLEAR_API_CACHE message to service worker');
          navigator.serviceWorker.controller.postMessage({
            type: 'CLEAR_API_CACHE'
          });
        } else {
          console.log('PersistentWebSocketManager: Service worker not available for cache clearing, trying to get controller');
          navigator.serviceWorker.ready.then(registration => {
            if (registration.active) {
              console.log('PersistentWebSocketManager: Service worker ready, sending cache clear message');
              registration.active.postMessage({
                type: 'CLEAR_API_CACHE'
              });
            }
          });
        }
        
        // Add a small delay to ensure cache is cleared before refetching
        setTimeout(() => {
          console.log('PersistentWebSocketManager: Calling ManagerDashboard refetch after WebSocket update...');
          this.managerDashboardRefetch();
        }, 100);
      }

      // Call work order form update for the specific work order if registered
      const workOrderNo = data.workOrderNo;
      if (workOrderNo && this.workOrderFormRefetch.has(workOrderNo)) {
        const formUpdateHandler = this.workOrderFormRefetch.get(workOrderNo);
        console.log(`PersistentWebSocketManager: Updating work order form for ${workOrderNo} with new data`);
        
        // Send the actual updated data to the form instead of triggering a full refetch
        setTimeout(() => {
          console.log(`PersistentWebSocketManager: Sending update data to work order form ${workOrderNo}...`);
          if (typeof formUpdateHandler === 'function') {
            // If it's a refetch function, call it
            formUpdateHandler();
          } else if (typeof formUpdateHandler === 'object' && formUpdateHandler.updateWithData) {
            // If it's an update handler object, call the update method
            formUpdateHandler.updateWithData(data.data);
          }
        }, 100);
      }
      
      // Notify all global listeners
      if (this.globalSubscriptions.has('workorder-update')) {
        this.globalSubscriptions.get('workorder-update').forEach(callback => {
          try {
            callback(data);
          } catch (error) {
            console.error('Error in global workorder-update listener:', error);
          }
        });
      }
    });

    // Subscribe to data refresh globally
    const unsubscribeDataRefresh = workOrderWS.subscribe('data-refresh', (data) => {
      console.log('PersistentWebSocketManager: Global data refresh received:', data);
      
      // Notify all global listeners
      if (this.globalSubscriptions.has('data-refresh')) {
        this.globalSubscriptions.get('data-refresh').forEach(callback => {
          try {
            callback(data);
          } catch (error) {
            console.error('Error in global data-refresh listener:', error);
          }
        });
      }
    });
  }

  subscribe(eventType, callback) {
    if (!this.globalSubscriptions.has(eventType)) {
      this.globalSubscriptions.set(eventType, []);
    }
    this.globalSubscriptions.get(eventType).push(callback);
    console.log(`PersistentWebSocketManager: Added global listener for ${eventType}, total: ${this.globalSubscriptions.get(eventType).length}`);
    
    return () => {
      this.unsubscribe(eventType, callback);
    };
  }

  unsubscribe(eventType, callback) {
    if (this.globalSubscriptions.has(eventType)) {
      const callbacks = this.globalSubscriptions.get(eventType);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
        console.log(`PersistentWebSocketManager: Removed global listener for ${eventType}, remaining: ${callbacks.length}`);
      }
    }
  }
}

export const persistentWSManager = new PersistentWebSocketManager();

// React hook for WebSocket
export const useWebSocket = (token) => {
  const [connectionStatus, setConnectionStatus] = React.useState({
    connected: false,
    socketId: null,
    reconnectAttempts: 0
  });

  React.useEffect(() => {
    console.log('useWebSocket: Setting up connection, token:', !!token);
    
    if (token) {
      // Initialize the persistent manager
      persistentWSManager.initialize(token);
      
      // Update connection status
      setConnectionStatus(workOrderWS.getConnectionStatus());
    }

    const unsubscribe = workOrderWS.subscribe('connected', () => {
      console.log('useWebSocket: Connected event received');
      setConnectionStatus(workOrderWS.getConnectionStatus());
    });

    const unsubscribeDisconnected = workOrderWS.subscribe('disconnected', () => {
      console.log('useWebSocket: Disconnected event received');
      setConnectionStatus(workOrderWS.getConnectionStatus());
    });

    return () => {
      console.log('useWebSocket: Cleaning up connection status subscriptions only');
      // Only unsubscribe from connection status events, not from workorder-update events
      unsubscribe();
      unsubscribeDisconnected();
    };
  }, [token]);

  return { workOrderWS, connectionStatus, persistentWSManager };
};

// Hook for work order updates
export const useWorkOrderUpdates = (workOrderNo, onUpdate) => {
  React.useEffect(() => {
    if (workOrderNo && onUpdate) {
      const unsubscribe = workOrderWS.subscribe('workorder-update', (data) => {
        if (data.workOrderNo === workOrderNo) {
          onUpdate(data);
        }
      });

      return unsubscribe;
    }
  }, [workOrderNo, onUpdate]);
};

// Hook for general data refresh
export const useDataRefresh = (dataType, onRefresh) => {
  React.useEffect(() => {
    if (dataType && onRefresh) {
      const unsubscribe = workOrderWS.subscribe('data-refresh', (data) => {
        if (data.dataType === dataType) {
          onRefresh(data);
        }
      });

      return unsubscribe;
    }
  }, [dataType, onRefresh]);
};
