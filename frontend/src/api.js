import axios from 'axios';
const API = axios.create({
  baseURL: 'http://localhost:4000',
  //baseURL: process.env.REACT_APP_API_URL || 'https://glls-work-order-portal.onrender.com',
});
export default API;