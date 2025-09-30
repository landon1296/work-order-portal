import React, { useState, useEffect } from 'react';
import { isOnline, onOnlineStatusChange } from '../utils/serviceWorker';
import { 
  getPendingUpdates, 
  getCachedWorkOrders, 
  getStorageInfo,
  clearAllCache 
} from '../utils/offlineStorage';

const OfflineTest = () => {
  const [isOffline, setIsOffline] = useState(!isOnline());
  const [storageInfo, setStorageInfo] = useState({});
  const [pendingUpdates, setPendingUpdates] = useState([]);

  useEffect(() => {
    const handleStatusChange = (online) => {
      setIsOffline(!online);
    };

    onOnlineStatusChange(handleStatusChange);
    updateStorageInfo();
    
    // Update storage info every 5 seconds
    const interval = setInterval(updateStorageInfo, 5000);
    return () => clearInterval(interval);
  }, []);

  const updateStorageInfo = () => {
    setStorageInfo(getStorageInfo());
    setPendingUpdates(getPendingUpdates());
  };

  const simulateOfflineUpdate = () => {
    const mockUpdate = {
      work_order_no: `WO-${Date.now()}`,
      status: 'Updated offline',
      notes: 'This update was made while offline',
      type: 'work_order_update'
    };

    const updateId = require('../utils/offlineStorage').storePendingUpdate(mockUpdate);
    if (updateId) {
      alert(`Stored pending update: ${updateId}`);
      updateStorageInfo();
    }
  };

  const clearCache = () => {
    if (confirm('Clear all cached data? This will remove offline work orders and pending updates.')) {
      clearAllCache();
      updateStorageInfo();
      alert('Cache cleared!');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Offline Functionality Test</h2>
      
      {/* Connection Status */}
      <div className="mb-6 p-4 rounded-lg border">
        <h3 className="text-lg font-semibold mb-3">Connection Status</h3>
        <div className="flex items-center space-x-3">
          <div className={`w-4 h-4 rounded-full ${isOffline ? 'bg-red-500' : 'bg-green-500'}`}></div>
          <span className={`font-medium ${isOffline ? 'text-red-600' : 'text-green-600'}`}>
            {isOffline ? 'Offline' : 'Online'}
          </span>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          {isOffline 
            ? 'App is working with cached data. Changes will sync when connection is restored.'
            : 'App is connected to the internet. All data is synced.'
          }
        </p>
      </div>

      {/* Storage Information */}
      <div className="mb-6 p-4 rounded-lg border">
        <h3 className="text-lg font-semibold mb-3">Storage Information</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">Pending Updates:</span>
            <span className="ml-2 text-blue-600">{storageInfo.pendingUpdates}</span>
          </div>
          <div>
            <span className="font-medium">Cached Work Orders:</span>
            <span className="ml-2 text-blue-600">
              {storageInfo.hasCachedWorkOrders ? 'Yes' : 'No'}
            </span>
          </div>
          <div>
            <span className="font-medium">Cached User Data:</span>
            <span className="ml-2 text-blue-600">
              {storageInfo.hasCachedUserData ? 'Yes' : 'No'}
            </span>
          </div>
          <div>
            <span className="font-medium">Total Cache Size:</span>
            <span className="ml-2 text-blue-600">
              {(storageInfo.totalSize / 1024).toFixed(1)} KB
            </span>
          </div>
        </div>
      </div>

      {/* Pending Updates */}
      {pendingUpdates.length > 0 && (
        <div className="mb-6 p-4 rounded-lg border border-yellow-200 bg-yellow-50">
          <h3 className="text-lg font-semibold mb-3 text-yellow-800">Pending Updates</h3>
          <div className="space-y-2">
            {pendingUpdates.map((update) => (
              <div key={update.id} className="text-sm bg-white p-2 rounded border">
                <div className="font-medium">Work Order: {update.work_order_no}</div>
                <div className="text-gray-600">Status: {update.status}</div>
                <div className="text-gray-500 text-xs">
                  Created: {new Date(update.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Test Actions */}
      <div className="mb-6 p-4 rounded-lg border">
        <h3 className="text-lg font-semibold mb-3">Test Actions</h3>
        <div className="space-x-3">
          <button
            onClick={simulateOfflineUpdate}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Simulate Offline Update
          </button>
          <button
            onClick={clearCache}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Clear All Cache
          </button>
          <button
            onClick={updateStorageInfo}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            Refresh Info
          </button>
        </div>
      </div>

      {/* Instructions */}
      <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
        <h3 className="text-lg font-semibold mb-3 text-blue-800">How to Test Offline Functionality</h3>
        <ol className="list-decimal list-inside space-y-2 text-sm text-blue-700">
          <li>Open Developer Tools (F12) and go to the Network tab</li>
          <li>Check "Offline" to simulate no internet connection</li>
          <li>Navigate around the app - it should still work with cached data</li>
          <li>Try making changes - they'll be stored for later sync</li>
          <li>Uncheck "Offline" to restore internet connection</li>
          <li>Watch as pending updates sync automatically</li>
        </ol>
      </div>
    </div>
  );
};

export default OfflineTest;
