import { useState, useCallback, useEffect } from 'react';
import API from '../api';

const DEFAULT_PAGE_SIZE = 50;

export const usePaginatedWorkOrders = (user, options = {}) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  
  const pageSize = options.pageSize || DEFAULT_PAGE_SIZE;
  const useFullDataset = options.useFullDataset || false;

  const fetchOrders = useCallback(async (page = 1, append = false) => {
    if (!user?.token) return;
    
    setLoading(true);
    setError(null);
    
    try {
      let res;
      
      if (useFullDataset) {
        // Legacy behavior - fetch all work orders
        const timestamp = Date.now();
        res = await API.get(`/workorders?_t=${timestamp}`, { 
          headers: { Authorization: `Bearer ${user.token}` } 
        });
        setOrders(res.data);
        setTotal(res.data.length);
        setHasMore(false);
      } else {
        // Paginated approach
        const offset = (page - 1) * pageSize;
        res = await API.get(`/workorders?limit=${pageSize}&offset=${offset}`, { 
          headers: { Authorization: `Bearer ${user.token}` } 
        });
        
        if (append && page > 1) {
          setOrders(prev => [...prev, ...res.data.rows]);
        } else {
          setOrders(res.data.rows);
        }
        
        setTotal(res.data.total);
        setHasMore(offset + pageSize < res.data.total);
      }
      
      setCurrentPage(page);
      
    } catch (err) {
      console.error('Failed to fetch orders:', err);
      setError('Failed to load work orders. Please refresh the page.');
      if (!append) {
        setOrders([]);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.token, pageSize, useFullDataset]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchOrders(currentPage + 1, true);
    }
  }, [loading, hasMore, currentPage, fetchOrders]);

  const refresh = useCallback(() => {
    fetchOrders(1, false);
  }, [fetchOrders]);

  useEffect(() => {
    fetchOrders(1, false);
  }, [fetchOrders]);

  return { 
    orders, 
    loading, 
    error, 
    total,
    currentPage,
    hasMore,
    loadMore,
    refresh,
    setCurrentPage: (page) => fetchOrders(page, false)
  };
};
