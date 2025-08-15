import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import offlineAPI from './services/offlineAPI';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

// Initialize offline storage
offlineAPI.initializeOfflineStorage();
