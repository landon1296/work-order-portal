class OfflineStorage {
  constructor() {
    this.dbName = 'GLLSWorkOrdersDB';
    this.dbVersion = 1;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object stores
        if (!db.objectStoreNames.contains('workOrders')) {
          const workOrdersStore = db.createObjectStore('workOrders', { keyPath: 'workOrderNo' });
          workOrdersStore.createIndex('status', 'status', { unique: false });
          workOrdersStore.createIndex('technician', 'technicianAssigned', { unique: false });
        }

        if (!db.objectStoreNames.contains('pendingChanges')) {
          const pendingStore = db.createObjectStore('pendingChanges', { keyPath: 'id', autoIncrement: true });
          pendingStore.createIndex('type', 'type', { unique: false });
          pendingStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains('userData')) {
          db.createObjectStore('userData', { keyPath: 'key' });
        }
      };
    });
  }

  async saveWorkOrders(workOrders) {
    const transaction = this.db.transaction(['workOrders'], 'readwrite');
    const store = transaction.objectStore('workOrders');
    
    for (const order of workOrders) {
      await store.put(order);
    }
  }

  async getWorkOrders() {
    const transaction = this.db.transaction(['workOrders'], 'readonly');
    const store = transaction.objectStore('workOrders');
    const request = store.getAll();
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getWorkOrderByNumber(workOrderNo) {
    const transaction = this.db.transaction(['workOrders'], 'readonly');
    const store = transaction.objectStore('workOrders');
    const request = store.get(workOrderNo);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async savePendingChange(change) {
    const transaction = this.db.transaction(['pendingChanges'], 'readwrite');
    const store = transaction.objectStore('pendingChanges');
    
    const pendingChange = {
      ...change,
      timestamp: Date.now()
    };
    
    await store.add(pendingChange);
  }

  async getPendingChanges() {
    const transaction = this.db.transaction(['pendingChanges'], 'readonly');
    const store = transaction.objectStore('pendingChanges');
    const request = store.getAll();
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clearPendingChanges() {
    const transaction = this.db.transaction(['pendingChanges'], 'readwrite');
    const store = transaction.objectStore('pendingChanges');
    await store.clear();
  }

  async saveUserData(key, data) {
    const transaction = this.db.transaction(['userData'], 'readwrite');
    const store = transaction.objectStore('userData');
    await store.put({ key, data });
  }

  async getUserData(key) {
    const transaction = this.db.transaction(['userData'], 'readonly');
    const store = transaction.objectStore('userData');
    const request = store.get(key);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result?.data);
      request.onerror = () => reject(request.error);
    });
  }
}

export default new OfflineStorage();
