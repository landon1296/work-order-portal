import React, { useState, useEffect } from 'react';

const OfflineStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showSync, setShowSync] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSync = async () => {
    setShowSync(true);
    try {
      // Import here to avoid circular dependencies
      const offlineAPI = (await import('../services/offlineAPI')).default;
      await offlineAPI.syncPendingChanges();
      setTimeout(() => setShowSync(false), 2000);
    } catch (error) {
      console.error('Sync failed:', error);
      setTimeout(() => setShowSync(false), 2000);
    }
  };

  if (isOnline) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: '#f59e0b',
      color: 'white',
      padding: '8px 16px',
      textAlign: 'center',
      zIndex: 1000,
      fontSize: '14px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <span>⚠️ You're offline. Changes will be saved locally and synced when you're back online.</span>
      <button
        onClick={handleSync}
        disabled={showSync}
        style={{
          background: 'white',
          color: '#f59e0b',
          border: 'none',
          padding: '4px 8px',
          borderRadius: '4px',
          cursor: showSync ? 'not-allowed' : 'pointer',
          fontSize: '12px'
        }}
      >
        {showSync ? 'Syncing...' : 'Sync Now'}
      </button>
    </div>
  );
};

export default OfflineStatus;
