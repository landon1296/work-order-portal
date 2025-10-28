import { useState, useCallback } from 'react';
import API from '../api';

export const useServerSideSearch = (user) => {
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const performSearch = useCallback(async (searchTerm, options = {}) => {
    if (!searchTerm || searchTerm.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    if (!user?.token) return;

    setSearchLoading(true);
    setSearchError(null);

    try {
      const { limit = 50, offset = 0 } = options;
      const res = await API.get(`/workorders/search?q=${encodeURIComponent(searchTerm.trim())}&limit=${limit}&offset=${offset}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      
      setSearchResults(res.data.rows || []);
    } catch (err) {
      console.error('Search failed:', err);
      setSearchError('Search failed. Please try again.');
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [user?.token]);

  const searchBySerialNumber = useCallback(async (serialNumber, options = {}) => {
    if (!serialNumber || !user?.token) return;

    setSearchLoading(true);
    setSearchError(null);

    try {
      const { limit = 50, offset = 0 } = options;
      const res = await API.get(`/workorders/by-serial/${encodeURIComponent(serialNumber)}?limit=${limit}&offset=${offset}`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      
      setSearchResults(res.data.rows || []);
    } catch (err) {
      console.error('Serial number search failed:', err);
      setSearchError('Search failed. Please try again.');
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
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
