import axios from 'axios';
import { isOnline } from './utils/serviceWorker';

const API = axios.create({
  //baseURL: 'http://localhost:4000',
  baseURL: process.env.REACT_APP_API_URL || 'https://glls-work-order-portal.onrender.com',
});

// Add request interceptor to handle offline scenarios
API.interceptors.request.use(
  (config) => {
    // Only add timestamp if explicitly requested (for cache-busting specific requests)
    // This allows browser/CDN caching for most GET requests, improving performance
    if (config.method === 'get' && config.cacheBust !== false && !config.params?._t) {
      // Only add timestamp for requests that might be cached and need fresh data
      // Skip for paginated/list endpoints where caching is beneficial
      const shouldCacheBust = config.url?.includes('/workorders/') && 
                              !config.url?.includes('limit=') && 
                              !config.url?.includes('offset=') &&
                              !config.url?.includes('search') &&
                              !config.url?.includes('by-serial');
      if (shouldCacheBust) {
        config.params = {
          ...config.params,
          _t: Date.now()
        };
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle offline responses
API.interceptors.response.use(
  (response) => {
    // Check if response was served from offline cache
    if (response.headers['x-served-from'] === 'offline-cache') {
      console.log('Serving offline cached data for:', response.config.url);
    }
    return response;
  },
  (error) => {
    // If offline and it's a network error, the service worker will handle it
    if (!isOnline() && error.code === 'ERR_NETWORK') {
      console.log('Offline: Service worker will handle cached response');
    }
    return Promise.reject(error);
  }
);

export default API;