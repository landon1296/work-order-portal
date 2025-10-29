import { useState, useCallback, useRef, useEffect } from 'react';
import API from '../api';

// Debounce utility
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

export const useServerSideSearch = (user) => {
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const abortControllerRef = useRef(null);

  const performSearch = useCallback(async (searchTerm, options = {}) => {
    if (!searchTerm || searchTerm.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    if (!user?.token) return;

    // Cancel previous request if still in flight
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setSearchLoading(true);
    setSearchError(null);

    try {
      const { limit = 50, offset = 0 } = options;
      const res = await API.get(`/workorders/search?q=${encodeURIComponent(searchTerm.trim())}&limit=${limit}&offset=${offset}`, {
        headers: { Authorization: `Bearer ${user.token}` },
        signal // Add abort signal for request cancellation
      });
      
      // Check if request was aborted
      if (signal.aborted) return;
      
      setSearchResults(res.data.rows || []);
    } catch (err) {
      // Ignore abort errors
      if (err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
        return;
      }
      console.error('Search failed:', err);
      setSearchError('Search failed. Please try again.');
      setSearchResults([]);
    } finally {
      if (!signal.aborted) {
        setSearchLoading(false);
      }
    }
  }, [user?.token]);

  const searchBySerialNumber = useCallback(async (serialNumber, options = {}) => {
    if (!serialNumber || !user?.token) return;

    // Cancel previous request if still in flight
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setSearchLoading(true);
    setSearchError(null);

    try {
      const { limit = 50, offset = 0 } = options;
      const res = await API.get(`/workorders/by-serial/${encodeURIComponent(serialNumber)}?limit=${limit}&offset=${offset}`, {
        headers: { Authorization: `Bearer ${user.token}` },
        signal // Add abort signal for request cancellation
      });
      
      // Check if request was aborted
      if (signal.aborted) return;
      
      setSearchResults(res.data.rows || []);
    } catch (err) {
      // Ignore abort errors
      if (err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
        return;
      }
      console.error('Serial number search failed:', err);
      setSearchError('Search failed. Please try again.');
      setSearchResults([]);
    } finally {
      if (!signal.aborted) {
        setSearchLoading(false);
      }
    }
  }, [user?.token]);

  const clearSearch = useCallback(() => {
    setSearchResults([]);
    setSearchError(null);
  }, []);

  return {
    searchResults,
    searchLoading,
    searchError,
    performSearch,
    searchBySerialNumber,
    clearSearch
  };
};
