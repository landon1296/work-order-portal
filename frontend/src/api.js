import axios from 'axios';
import offlineAPI from './services/offlineAPI';

const API = axios.create({
  baseURL: 'http://localhost:4000',
  //baseURL: process.env.REACT_APP_API_URL || 'https://glls-work-order-portal.onrender.com',
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
    return offlineAPI.get(url);
  }
  return originalGet(url, config);
};

API.post = async (url, data, config) => {
  if (workOrderEndpoints.some(endpoint => url.includes(endpoint))) {
    return offlineAPI.post(url, data);
  }
  return originalPost(url, data, config);
};

API.put = async (url, data, config) => {
  if (workOrderEndpoints.some(endpoint => url.includes(endpoint))) {
    return offlineAPI.put(url, data);
  }
  return originalPut(url, data, config);
};

API.delete = async (url, config) => {
  if (workOrderEndpoints.some(endpoint => url.includes(endpoint))) {
    return offlineAPI.delete(url);
  }
  return originalDelete(url, config);
};

export default API;