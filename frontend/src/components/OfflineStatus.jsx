import React, { useState, useEffect } from 'react';
import { isOnline, onOnlineStatusChange } from '../utils/serviceWorker';

const OfflineStatus = () => {
  const [isOffline, setIsOffline] = useState(!isOnline());
  const [showStatus, setShowStatus] = useState(false);

  useEffect(() => {
    const handleStatusChange = (online) => {
      const offline = !online;
      setIsOffline(offline);
      
      // Show status message when going offline or coming back online
      if (offline) {
        setShowStatus(true);
        // Auto-hide after 5 seconds
        setTimeout(() => setShowStatus(false), 5000);
      } else {
        setShowStatus(true);
        // Auto-hide after 3 seconds when back online
        setTimeout(() => setShowStatus(false), 3000);
      }
    };

    // Listen for online/offline events
    onOnlineStatusChange(handleStatusChange);

    // Initial check
    handleStatusChange(isOnline());
  }, []);

  if (!showStatus) {
    return null;
  }

  return (
    <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg transition-all duration-300 ${
      isOffline 
        ? 'bg-red-500 text-white' 
        : 'bg-green-500 text-white'
    }`}>
      <div className="flex items-center space-x-2">
        <div className={`w-3 h-3 rounded-full ${
          isOffline ? 'bg-red-300' : 'bg-green-300'
        }`}></div>
        <span className="text-sm font-medium">
          {isOffline ? 'Offline - Working with cached data' : 'Back online - Syncing data'}
        </span>
        <button
          onClick={() => setShowStatus(false)}
          className="ml-2 text-white hover:text-gray-200"
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default OfflineStatus;
