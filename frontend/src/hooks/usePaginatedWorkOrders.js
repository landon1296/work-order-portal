import { useState, useCallback, useEffect, useRef } from 'react';
import API from '../api';

const DEFAULT_PAGE_SIZE = 50;

export const usePaginatedWorkOrders = (user, options = {}) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const abortControllerRef = useRef(null);
  
  const pageSize = options.pageSize || DEFAULT_PAGE_SIZE;
  const includeClosed = options.includeClosed || false;

  const fetchOrders = useCallback(async (page = 1, append = false) => {
    if (!user?.token) return;
    
    // Cancel previous request if still in flight
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    setLoading(true);
    setError(null);
    
    try {
      // Always use paginated approach (legacy full dataset removed)
      const offset = (page - 1) * pageSize;
      const includeClosedParam = includeClosed ? '&includeClosed=true' : '';
      const res = await API.get(`/workorders?limit=${pageSize}&offset=${offset}${includeClosedParam}`, { 
        headers: { Authorization: `Bearer ${user.token}` },
        signal
      });
      
      if (signal.aborted) return;
      
      if (append && page > 1) {
        setOrders(prev => [...prev, ...res.data.rows]);
      } else {
        setOrders(res.data.rows);
      }
      
      setTotal(res.data.total);
      setHasMore(offset + pageSize < res.data.total);
      
      setCurrentPage(page);
      
    } catch (err) {
      // Ignore abort errors
      if (err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
        return;
      }
      console.error('Failed to fetch orders:', err);
      setError('Failed to load work orders. Please refresh the page.');
      if (!append) {
        setOrders([]);
      }
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, [user?.token, pageSize, includeClosed]);

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
