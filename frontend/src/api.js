import axios from 'axios';

// Create separate axios instance for offline API to use
const baseAPI = axios.create({
  //baseURL: 'http://localhost:4000',
  baseURL: process.env.REACT_APP_API_URL || 'https://glls-work-order-portal.onrender.com',
  timeout: 10000,
});

// Main API instance that will be overridden for offline support
const API = axios.create({
  //baseURL: 'http://localhost:4000',
  baseURL: process.env.REACT_APP_API_URL || 'https://glls-work-order-portal.onrender.com',
  timeout: 10000,
});

// Use offline API for work order endpoints
const workOrderEndpoints = ['/workorders', '/workorders/assigned'];

// Override axios methods for offline support
const originalGet = API.get;
const originalPost = API.post;
const originalPut = API.put;
const originalDelete = API.delete;

API.get = async (url, config) => {
  if (workOrderEndpoints.some(endpoint => url.includes(endpoint))) {
    // Import offlineAPI dynamically to avoid circular dependency
    const { default: offlineAPI } = await import('./services/offlineAPI');
    return offlineAPI.get(url);
  }
  return originalGet(url, config);
};

API.post = async (url, data, config) => {
  if (workOrderEndpoints.some(endpoint => url.includes(endpoint))) {
    const { default: offlineAPI } = await import('./services/offlineAPI');
    return offlineAPI.post(url, data);
  }
  return originalPost(url, data, config);
};

API.put = async (url, data, config) => {
  if (workOrderEndpoints.some(endpoint => url.includes(endpoint))) {
    const { default: offlineAPI } = await import('./services/offlineAPI');
    return offlineAPI.put(url, data);
  }
  return originalPut(url, data, config);
};

API.delete = async (url, config) => {
  if (workOrderEndpoints.some(endpoint => url.includes(endpoint))) {
    const { default: offlineAPI } = await import('./services/offlineAPI');
    return offlineAPI.delete(url);
  }
  return originalDelete(url, config);
};

export default API;
export { baseAPI };